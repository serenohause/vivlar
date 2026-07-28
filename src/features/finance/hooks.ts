import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/finance/constants';
import type {
  FinanceAccountMutationPayload,
  InstallmentMutationPayload,
  RegisterCobrancaMutationPayload,
  RegisterPaymentMutationPayload,
} from '@/features/finance/schemas';
import type { CobrancaHistorico, FinanceAccount, FinanceEvent, FinancingProcess, PaymentInstallment } from '@/features/finance/types';
import { computeInstallmentDisplayStatus } from '@/features/finance/utils';
import { supabase } from '@/lib/supabase';

const FINANCE_ACCOUNTS_QUERY_KEY = ['finance-accounts'] as const;
// Prefixo compartilhado por `useAllPaymentInstallments` (chave exata) e
// `usePaymentInstallments(financeAccountId)` (chave com id extra) — permite
// invalidar as duas com uma única chamada (`exact: false` é o default do
// React Query), mesmo padrão de `paymentInstallmentsQueryKey` abaixo.
const ALL_PAYMENT_INSTALLMENTS_QUERY_KEY = ['payment-installments'] as const;

function financeAccountQueryKey(id: string) {
  return ['finance-account', id] as const;
}

function financeAccountsByUnitQueryKey(unitId: string) {
  return ['finance-accounts-by-unit', unitId] as const;
}

function paymentInstallmentsQueryKey(financeAccountId: string) {
  return ['payment-installments', financeAccountId] as const;
}

function financeEventsQueryKey(financeAccountId: string) {
  return ['finance-events', financeAccountId] as const;
}

function cobrancaHistoricoQueryKey(installmentId: string) {
  return ['cobranca-historico', installmentId] as const;
}

function financingProcessesQueryKey(financeAccountId: string) {
  return ['financing-processes', financeAccountId] as const;
}

/**
 * Notificação de mural (`type=FINANCEIRO`, `audience=INTERNAL_ONLY`) ao
 * registrar/cancelar um pagamento — tradução de `notifyInstallmentPaid`/
 * `notifyInstallmentCancelled` (`original-project/src/components/notifications/notificationService.jsx`,
 * linhas 274-326, chamadas de `FinanceDetail.jsx`). "Melhor esforço": erro
 * aqui nunca propaga para a mutation principal (mesmo `try/catch` isolado
 * do original em toda chamada de `Notification.create`) — busca o SKU da
 * unidade à parte porque as mutations deste módulo não recebem a unidade
 * carregada, só `unit_id` (desnormalizado na própria parcela).
 */
async function notifyInstallmentEvent(params: {
  tenantId: string;
  installment: PaymentInstallment;
  financeAccountId: string;
  userId: string | null;
  kind: 'pago' | 'cancelado';
}): Promise<void> {
  try {
    const { tenantId, installment, financeAccountId, userId, kind } = params;

    const { data: unit } = await supabase.from('units').select('sku').eq('id', installment.unit_id).maybeSingle();
    const unitSku = unit?.sku ?? 'N/A';

    const isPago = kind === 'pago';
    await supabase.from('notifications').insert({
      tenant_id: tenantId,
      title: isPago ? '✅ Pagamento Recebido' : '❌ Parcela Cancelada',
      message: isPago
        ? `Parcela ${installment.numero_parcela ?? ''} de ${unitSku} - ${formatCurrency(installment.valor_previsto)}`
        : `Parcela ${installment.numero_parcela ?? ''} de ${unitSku} foi cancelada`,
      type: 'FINANCEIRO',
      event_key: `INSTALLMENT_${isPago ? 'PAID' : 'CANCELLED'}_${installment.id}_${Date.now()}`,
      severity: isPago ? 'INFO' : 'ALERTA',
      audience: 'INTERNAL_ONLY',
      link_route: `/finance/${financeAccountId}`,
      entity_type: 'PaymentInstallment',
      entity_id: installment.id,
      meta: {
        installment_id: installment.id,
        finance_account_id: financeAccountId,
        unit_sku: unitSku,
        amount: installment.valor_previsto,
      },
      created_by_user_id: userId,
    });
  } catch {
    // Notificação é efeito colateral opcional — nunca bloqueia/reverte a
    // mutation principal (mesmo critério do original).
  }
}

/**
 * Invalida tudo que depende de uma carteira financeira específica depois de
 * uma mutation em `payment_installments`/`finance_events` — lista de
 * contas (totais mudam), a conta em si, as parcelas (chave exata e a
 * "global" via prefixo) e a timeline. Mesmo padrão de
 * `invalidateUnitsQueries` em `features/units/hooks.ts`.
 */
function invalidateFinanceAccountQueries(queryClient: ReturnType<typeof useQueryClient>, financeAccountId: string) {
  queryClient.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: financeAccountQueryKey(financeAccountId) });
  queryClient.invalidateQueries({ queryKey: ALL_PAYMENT_INSTALLMENTS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: financeEventsQueryKey(financeAccountId) });
}

/** Lista de carteiras financeiras do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted. Usada por `FinanceListPage`. */
export function useFinanceAccounts() {
  return useQuery({
    queryKey: FINANCE_ACCOUNTS_QUERY_KEY,
    queryFn: async (): Promise<FinanceAccount[]> => {
      const { data, error } = await supabase
        .from('finance_accounts')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useFinanceAccount(id: string | undefined) {
  return useQuery({
    queryKey: financeAccountQueryKey(id ?? ''),
    queryFn: async (): Promise<FinanceAccount> => {
      const { data, error } = await supabase.from('finance_accounts').select('*').eq('id', id as string).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

/**
 * Carteiras financeiras de uma unidade específica — usada só por
 * `UnitDetailPage` para decidir entre "Ver Carteira Financeira" (já existe
 * uma) e "Criar Carteira Financeira" (ainda não existe), mesmo critério de
 * `primaryAccount` em `Finance.jsx` (`accounts.find(a => a.status ===
 * "ativa") || accounts[0]`).
 */
export function useFinanceAccountsByUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: financeAccountsByUnitQueryKey(unitId ?? ''),
    queryFn: async (): Promise<FinanceAccount[]> => {
      const { data, error } = await supabase
        .from('finance_accounts')
        .select('*')
        .eq('unit_id', unitId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(unitId),
  });
}

/**
 * Todas as parcelas do tenant (RLS restringe a admin/comercial/administrativo),
 * excluindo soft-deleted — usada só pelos KPIs e pelo agrupamento por
 * unidade de `FinanceListPage` (fiel a `base44.entities.PaymentInstallment.list()`
 * sem filtro em `Finance.jsx`). Parcelas `cancelado` continuam nesta lista
 * (excluídas depois, no cálculo, por `computeAccountTotals` — ver
 * `features/finance/utils.ts`), diferente de `usePaymentInstallments`
 * (parcelas de uma única carteira, exibidas na tabela de
 * `FinanceAccountDetailPage` mesmo quando canceladas).
 */
async function fetchAllPaymentInstallments(): Promise<PaymentInstallment[]> {
  const { data, error } = await supabase.from('payment_installments').select('*').eq('is_deleted', false);

  if (error) throw error;
  return data;
}

export function useAllPaymentInstallments() {
  return useQuery({
    queryKey: ALL_PAYMENT_INSTALLMENTS_QUERY_KEY,
    queryFn: fetchAllPaymentInstallments,
  });
}

/**
 * Parcelas em atraso do tenant inteiro — tabela "Parcelas em Atraso" de
 * `InadimplenciaManagerPage`. Mesma query/cache de `useAllPaymentInstallments`
 * (mesma `queryKey`, só um fetch de rede mesmo com os dois hooks montados ao
 * mesmo tempo — ex: sidebar com badge + tela), filtrada no cliente via
 * `select` do React Query (memoizado por referência de `data`) porque
 * `em_atraso` não é um valor persistido em `status` (ver
 * `computeInstallmentDisplayStatus` em `utils.ts`) — não dá pra filtrar
 * direto na query do Supabase.
 */
export function useOverdueInstallments() {
  return useQuery({
    queryKey: ALL_PAYMENT_INSTALLMENTS_QUERY_KEY,
    queryFn: fetchAllPaymentInstallments,
    select: (data) => data.filter((i) => computeInstallmentDisplayStatus(i) === 'em_atraso'),
  });
}

/** Parcelas de uma carteira financeira específica — tabela "Parcelas" de `FinanceAccountDetailPage`. */
export function usePaymentInstallments(financeAccountId: string | undefined) {
  return useQuery({
    queryKey: paymentInstallmentsQueryKey(financeAccountId ?? ''),
    queryFn: async (): Promise<PaymentInstallment[]> => {
      const { data, error } = await supabase
        .from('payment_installments')
        .select('*')
        .eq('finance_account_id', financeAccountId as string)
        .eq('is_deleted', false)
        .order('vencimento', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(financeAccountId),
  });
}

/** Timeline de eventos de uma carteira — aba "Timeline" de `FinanceAccountDetailPage`. Só leitura: `finance_events` é log write-once, sem policy de UPDATE (ver 0023_rls_financeiro.sql). */
export function useFinanceEvents(financeAccountId: string | undefined) {
  return useQuery({
    queryKey: financeEventsQueryKey(financeAccountId ?? ''),
    queryFn: async (): Promise<FinanceEvent[]> => {
      const { data, error } = await supabase
        .from('finance_events')
        .select('*')
        .eq('finance_account_id', financeAccountId as string)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(financeAccountId),
  });
}

/**
 * Processo(s) de financiamento bancário de uma carteira financeira —
 * bloco "Financiamento" de `ClientFinancePage` (Portal do Cliente). Só
 * leitura: sem `create`/`update` confirmado em nenhuma tela do original
 * (nem admin, nem cliente — ver comentário em `0052_financing_process.sql`,
 * "processo é alimentado fora do app"). `financing_process` não é 1:1 com
 * `finance_accounts` de propósito (ver `FinancingProcess` em `types.ts`) —
 * mais recente primeiro, mesmo critério do resto do projeto.
 */
export function useFinancingProcesses(financeAccountId: string | undefined) {
  return useQuery({
    queryKey: financingProcessesQueryKey(financeAccountId ?? ''),
    queryFn: async (): Promise<FinancingProcess[]> => {
      const { data, error } = await supabase
        .from('financing_process')
        .select('*')
        .eq('finance_account_id', financeAccountId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(financeAccountId),
  });
}

/**
 * Cria a carteira financeira de uma unidade e grava o evento
 * `criacao_carteira` — fiel ao fluxo embutido em
 * `src/components/unit/FinanceTabNew.jsx` (linhas 116-140), que cria a
 * `FinanceAccount` e o evento em sequência (duas chamadas, não uma
 * transação) na primeira vez que uma parcela é lançada para a unidade. Aqui
 * vira um diálogo explícito acionado a partir de `UnitDetailPage` (ver
 * `CreateFinanceAccountDialog`) em vez de nascer lazy dentro da criação da
 * primeira parcela — simplificação combinada nesta leva, sinalizada no
 * relatório final. Igual ao original, as duas escritas não são atômicas
 * (uma RPC dedicada ficaria a cargo do `schema-architect`/`rls-guardian`
 * numa leva futura, se o volume de falha no meio justificar).
 */
export function useCreateFinanceAccount() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: FinanceAccountMutationPayload): Promise<FinanceAccount> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: account, error: accountError } = await supabase
        .from('finance_accounts')
        .insert({
          ...input,
          tenant_id: tenantId,
          status: 'ativa',
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (accountError) throw accountError;

      const { error: eventError } = await supabase.from('finance_events').insert({
        tenant_id: tenantId,
        finance_account_id: account.id,
        tipo_evento: 'criacao_carteira',
        descricao: 'Carteira financeira criada.',
        created_by_user_id: user?.id ?? null,
      });

      if (eventError) throw eventError;

      return account;
    },
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: financeAccountsByUnitQueryKey(account.unit_id) });
    },
  });
}

/** Cria parcela numa carteira e grava o evento `criacao_parcela` — fiel ao diálogo "Nova Parcela" de `FinanceDetail.jsx`/`FinanceTabNew.jsx`. */
export function useCreateInstallment(financeAccountId: string, unitId: string, clientId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: InstallmentMutationPayload): Promise<PaymentInstallment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: installment, error: installmentError } = await supabase
        .from('payment_installments')
        .insert({
          ...input,
          tenant_id: tenantId,
          finance_account_id: financeAccountId,
          unit_id: unitId,
          client_id: clientId,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (installmentError) throw installmentError;

      const { error: eventError } = await supabase.from('finance_events').insert({
        tenant_id: tenantId,
        finance_account_id: financeAccountId,
        installment_id: installment.id,
        tipo_evento: 'criacao_parcela',
        descricao: `Parcela criada: ${input.descricao || input.tipo}`,
        created_by_user_id: user?.id ?? null,
      });

      if (eventError) throw eventError;

      return installment;
    },
    onSuccess: () => invalidateFinanceAccountQueries(queryClient, financeAccountId),
  });
}

/** Edita parcela e grava o evento `edicao_parcela` — fiel ao diálogo "Editar Parcela" (`handleEdit`/`updateInstallmentMutation` de `FinanceDetail.jsx`). */
export function useUpdateInstallment(financeAccountId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InstallmentMutationPayload }): Promise<PaymentInstallment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: installment, error: installmentError } = await supabase
        .from('payment_installments')
        .update({ ...data, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (installmentError) throw installmentError;

      const { error: eventError } = await supabase.from('finance_events').insert({
        tenant_id: tenantId,
        finance_account_id: financeAccountId,
        installment_id: id,
        tipo_evento: 'edicao_parcela',
        descricao: `Parcela editada: ${data.descricao || data.tipo}`,
        created_by_user_id: user?.id ?? null,
      });

      if (eventError) throw eventError;

      return installment;
    },
    onSuccess: () => invalidateFinanceAccountQueries(queryClient, financeAccountId),
  });
}

/**
 * Dá baixa num pagamento (`status: 'pago'`) e grava o evento
 * `baixa_pagamento` — fiel ao fluxo "Baixar Pagamento" de
 * `baixarPagamentoMutation` (`FinanceDetail.jsx`/`FinanceTabNew.jsx`),
 * enriquecido com um diálogo para capturar `metodo_pagamento`/
 * `comprovante_url` em vez de baixar direto só com o valor previsto (ver
 * comentário em `features/finance/schemas.ts`, `registerPaymentFormSchema`).
 */
export function useRegisterPayment(financeAccountId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RegisterPaymentMutationPayload }): Promise<PaymentInstallment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: installment, error: installmentError } = await supabase
        .from('payment_installments')
        .update({
          status: 'pago',
          valor_pago: data.valor_pago,
          data_pagamento: data.data_pagamento,
          metodo_pagamento: data.metodo_pagamento,
          comprovante_url: data.comprovante_url,
          updated_by_user_id: user?.id ?? null,
        })
        .eq('id', id)
        .select()
        .single();

      if (installmentError) throw installmentError;

      const { error: eventError } = await supabase.from('finance_events').insert({
        tenant_id: tenantId,
        finance_account_id: financeAccountId,
        installment_id: id,
        tipo_evento: 'baixa_pagamento',
        descricao: `Pagamento recebido: ${formatCurrency(data.valor_pago)}`,
        created_by_user_id: user?.id ?? null,
      });

      if (eventError) throw eventError;

      await notifyInstallmentEvent({ tenantId, installment, financeAccountId, userId: user?.id ?? null, kind: 'pago' });

      return installment;
    },
    onSuccess: () => invalidateFinanceAccountQueries(queryClient, financeAccountId),
  });
}

/**
 * Cancela uma parcela (`status: 'cancelado'`) e grava o evento
 * `cancelamento_parcela`. Diferente do original (`deleteInstallmentMutation`
 * em `FinanceDetail.jsx`/`FinanceTabNew.jsx`, que soft-deleta a parcela —
 * `is_deleted = true` — e some da lista): aqui o cancelamento fica visível
 * na tabela com o badge "Cancelado" (`installment_status` já tem esse valor
 * de domínio, ver 0020_payment_installments.sql), sem esconder o histórico.
 */
export function useCancelInstallment(financeAccountId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (id: string): Promise<PaymentInstallment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: installment, error: installmentError } = await supabase
        .from('payment_installments')
        .update({ status: 'cancelado', updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (installmentError) throw installmentError;

      const { error: eventError } = await supabase.from('finance_events').insert({
        tenant_id: tenantId,
        finance_account_id: financeAccountId,
        installment_id: id,
        tipo_evento: 'cancelamento_parcela',
        descricao: 'Parcela cancelada.',
        created_by_user_id: user?.id ?? null,
      });

      if (eventError) throw eventError;

      await notifyInstallmentEvent({ tenantId, installment, financeAccountId, userId: user?.id ?? null, kind: 'cancelado' });

      return installment;
    },
    onSuccess: () => invalidateFinanceAccountQueries(queryClient, financeAccountId),
  });
}

/** Histórico de ações de cobrança de uma parcela — coluna "Última Ação" e diálogo "Registrar Cobrança" de `InadimplenciaManagerPage`, mais recente primeiro. */
export function useCobrancaHistorico(installmentId: string | undefined) {
  return useQuery({
    queryKey: cobrancaHistoricoQueryKey(installmentId ?? ''),
    queryFn: async (): Promise<CobrancaHistorico[]> => {
      const { data, error } = await supabase
        .from('cobranca_historico')
        .select('*')
        .eq('installment_id', installmentId as string)
        .eq('is_deleted', false)
        .order('data_execucao', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(installmentId),
  });
}

/**
 * Registra manualmente uma ação de cobrança sobre uma parcela — tradução de
 * `registrarAcaoMutation` (`AcoesCobranca`, `InadimplenciaManager.jsx`),
 * fora de escopo o envio automático/escalonamento (ver `types.ts`).
 * `data_execucao`/`status` não vêm do formulário: gravados aqui como "agora"
 * e `'enviado'` — a ação já foi executada pelo usuário (ligou, mandou
 * WhatsApp/e-mail) antes de logar, mesmo critério do original
 * (`status: 'ENVIADO'`).
 */
export function useRegisterCobranca(installmentId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: RegisterCobrancaMutationPayload): Promise<CobrancaHistorico> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('cobranca_historico')
        .insert({
          ...input,
          tenant_id: tenantId,
          installment_id: installmentId,
          data_execucao: new Date().toISOString(),
          status: 'enviado',
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cobrancaHistoricoQueryKey(installmentId) });
    },
  });
}
