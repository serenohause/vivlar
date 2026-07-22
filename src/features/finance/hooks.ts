import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/finance/constants';
import type {
  FinanceAccountMutationPayload,
  InstallmentMutationPayload,
  RegisterPaymentMutationPayload,
} from '@/features/finance/schemas';
import type { FinanceAccount, FinanceEvent, PaymentInstallment } from '@/features/finance/types';
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
export function useAllPaymentInstallments() {
  return useQuery({
    queryKey: ALL_PAYMENT_INSTALLMENTS_QUERY_KEY,
    queryFn: async (): Promise<PaymentInstallment[]> => {
      const { data, error } = await supabase.from('payment_installments').select('*').eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
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

      return installment;
    },
    onSuccess: () => invalidateFinanceAccountQueries(queryClient, financeAccountId),
  });
}
