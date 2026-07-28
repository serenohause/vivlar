import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { COMMISSION_ADJUSTMENT_CONFIG, formatCurrency } from '@/features/commissions/constants';
import type {
  CommissionAdjustmentMutationPayload,
  CommissionPaymentMutationPayload,
} from '@/features/commissions/schemas';
import type { Commission, CommissionAdjustment, CommissionPayment } from '@/features/commissions/types';
import type { NotificationSeverity } from '@/features/notifications/types';
import { supabase } from '@/lib/supabase';

const COMMISSIONS_QUERY_KEY = ['commissions'] as const;
// Prefixo compartilhado por `useAllCommissionPayments` (chave exata) e
// `useCommissionPayments(commissionId)` (chave com id extra) — mesmo padrão
// de `ALL_PAYMENT_INSTALLMENTS_QUERY_KEY` em `features/finance/hooks.ts`,
// permite invalidar as duas com uma única chamada.
const ALL_COMMISSION_PAYMENTS_QUERY_KEY = ['commission-payments'] as const;

function commissionQueryKey(id: string) {
  return ['commission', id] as const;
}

function commissionAdjustmentsQueryKey(commissionId: string) {
  return ['commission-adjustments', commissionId] as const;
}

function commissionPaymentsQueryKey(commissionId: string) {
  return ['commission-payments', commissionId] as const;
}

/**
 * Invalida tudo que depende de uma comissão específica depois de uma
 * mutation em `commissions`/`commission_adjustments`/`commission_payments`
 * — lista (KPIs/valores mudam), a comissão em si, ajustes e pagamentos
 * (chave exata e a "global" via prefixo). Mesmo padrão de
 * `invalidateFinanceAccountQueries` em `features/finance/hooks.ts`.
 */
function invalidateCommissionQueries(queryClient: ReturnType<typeof useQueryClient>, commissionId: string) {
  queryClient.invalidateQueries({ queryKey: COMMISSIONS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: commissionQueryKey(commissionId) });
  queryClient.invalidateQueries({ queryKey: commissionAdjustmentsQueryKey(commissionId) });
  queryClient.invalidateQueries({ queryKey: ALL_COMMISSION_PAYMENTS_QUERY_KEY });
}

/**
 * Contexto (nomes legíveis + totais atuais) para as notificações de mural de
 * `commissions` — busca a comissão FRESCA (já com `saldo`/`total_pago`
 * recalculados pela RPC que acabou de rodar) mais broker/unidade/projeto/
 * cliente (via `deals.client_id`), tradução das 6 chamadas de
 * `Notification.create()` de `original-project/src/pages/CommissionDetail.jsx`
 * (linhas 232/320/363/429/488/529), que liam esses nomes de dados já
 * carregados na tela — aqui, como a notificação nasce no hook (não no
 * componente), busca-se de novo, só os campos necessários.
 */
async function fetchCommissionNotificationContext(commissionId: string): Promise<{
  tenantId: string;
  brokerName: string | null;
  unitSku: string | null;
  projectName: string | null;
  clientName: string | null;
  saldo: number;
  totalComissao: number;
  totalPago: number;
} | null> {
  const { data: commission } = await supabase
    .from('commissions')
    .select('tenant_id, broker_id, unit_id, project_id, deal_id, base_value, gross_value, saldo, total_pago')
    .eq('id', commissionId)
    .single();

  if (!commission) return null;

  const [{ data: broker }, { data: unit }, { data: project }, { data: deal }] = await Promise.all([
    supabase.from('brokers').select('name').eq('id', commission.broker_id).maybeSingle(),
    supabase.from('units').select('sku').eq('id', commission.unit_id).maybeSingle(),
    supabase.from('projects').select('name').eq('id', commission.project_id).maybeSingle(),
    supabase.from('deals').select('client_id').eq('id', commission.deal_id).maybeSingle(),
  ]);

  let clientName: string | null = null;
  if (deal?.client_id) {
    const { data: client } = await supabase.from('clients').select('name').eq('id', deal.client_id).maybeSingle();
    clientName = client?.name ?? null;
  }

  return {
    tenantId: commission.tenant_id,
    brokerName: broker?.name ?? null,
    unitSku: unit?.sku ?? null,
    projectName: project?.name ?? null,
    clientName,
    saldo: commission.saldo,
    totalComissao: commission.gross_value ?? commission.base_value,
    totalPago: commission.total_pago,
  };
}

/**
 * Insere a notificação de mural (`type=COMISSAO`, `audience=INTERNAL_ONLY`)
 * em si — "melhor esforço": busca o contexto e insere dentro do mesmo
 * `try/catch`, erro aqui nunca propaga para a mutation principal (mesmo
 * critério do `try/catch` isolado em toda chamada de `Notification.create`
 * no original).
 */
async function notifyCommissionEvent(
  commissionId: string,
  build: (ctx: NonNullable<Awaited<ReturnType<typeof fetchCommissionNotificationContext>>>) => {
    title: string;
    message: string;
    severity: NotificationSeverity;
    eventKey: string;
    meta: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const ctx = await fetchCommissionNotificationContext(commissionId);
    if (!ctx) return;

    const { title, message, severity, eventKey, meta } = build(ctx);

    await supabase.from('notifications').insert({
      tenant_id: ctx.tenantId,
      title,
      message,
      type: 'COMISSAO',
      event_key: eventKey,
      severity,
      audience: 'INTERNAL_ONLY',
      link_route: `/commissions/${commissionId}`,
      entity_type: 'Commission',
      entity_id: commissionId,
      meta,
    });
  } catch {
    // Notificação é efeito colateral opcional — nunca bloqueia/reverte a
    // mutation principal (mesmo critério do original).
  }
}

/** Lista de comissões do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted. Usada por `CommissionsListPage`. */
export function useCommissions() {
  return useQuery({
    queryKey: COMMISSIONS_QUERY_KEY,
    queryFn: async (): Promise<Commission[]> => {
      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useCommission(id: string | undefined) {
  return useQuery({
    queryKey: commissionQueryKey(id ?? ''),
    queryFn: async (): Promise<Commission> => {
      const { data, error } = await supabase.from('commissions').select('*').eq('id', id as string).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

/** Ajustes (desconto/acréscimo/bônus) de uma comissão — card "Ajustes" de `CommissionDetailPage`, mais recente primeiro. Log write-once (sem policy de UPDATE, ver 0027_rls_comissoes.sql). */
export function useCommissionAdjustments(commissionId: string | undefined) {
  return useQuery({
    queryKey: commissionAdjustmentsQueryKey(commissionId ?? ''),
    queryFn: async (): Promise<CommissionAdjustment[]> => {
      const { data, error } = await supabase
        .from('commission_adjustments')
        .select('*')
        .eq('commission_id', commissionId as string)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(commissionId),
  });
}

/** Pagamentos de uma comissão específica — card "Pagamentos Registrados" de `CommissionDetailPage`, excluindo soft-deleted, mais recente primeiro. */
export function useCommissionPayments(commissionId: string | undefined) {
  return useQuery({
    queryKey: commissionPaymentsQueryKey(commissionId ?? ''),
    queryFn: async (): Promise<CommissionPayment[]> => {
      const { data, error } = await supabase
        .from('commission_payments')
        .select('*')
        .eq('commission_id', commissionId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(commissionId),
  });
}

/** Todos os pagamentos de comissão do tenant, excluindo soft-deleted — usado só pelo KPI "Pago no Mês" de `CommissionsListPage` (ver `computeCommissionPagoNoMes`, nota sobre `commissions.paid_at` órfão em `types.ts`). */
export function useAllCommissionPayments() {
  return useQuery({
    queryKey: ALL_COMMISSION_PAYMENTS_QUERY_KEY,
    queryFn: async (): Promise<CommissionPayment[]> => {
      const { data, error } = await supabase.from('commission_payments').select('*').eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Adiciona um ajuste (desconto/acréscimo/bônus) e recalcula
 * `commissions.gross_value`/`saldo` — tradução de `addAdjustmentMutation`
 * (`CommissionDetail.jsx`). Chama a RPC `create_commission_adjustment`
 * (ver `supabase/migrations/0029_*.sql`) em vez de 2 escritas sequenciais:
 * achado ALTO de uma auditoria de segurança — diferente do caso já aceito
 * em `finance_accounts` (onde a segunda escrita era só um log de
 * auditoria), aqui a segunda escrita é o valor financeiro pago ao
 * corretor; uma falha no meio podia deixar `saldo` desatualizado e abrir
 * caminho para pagamento a maior. A função roda sem `security definer` —
 * cada statement interno continua sujeito à RLS de quem chama.
 */
export function useCreateAdjustment(commissionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CommissionAdjustmentMutationPayload): Promise<CommissionAdjustment> => {
      const { data, error } = await supabase.rpc('create_commission_adjustment', {
        p_commission_id: commissionId,
        p_type: input.type,
        p_amount: input.amount,
        p_reason: input.reason,
        p_attachment_url: input.attachment_url ?? null,
        p_attachment_name: input.attachment_name ?? null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_adjustment, input) => {
      invalidateCommissionQueries(queryClient, commissionId);

      const adjustmentLabel = COMMISSION_ADJUSTMENT_CONFIG[input.type].label;
      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: `Ajuste em Comissão: ${adjustmentLabel}`,
        message: `${adjustmentLabel} de ${formatCurrency(input.amount)} aplicado${input.attachment_url ? ' (com anexo)' : ''}. Motivo: ${input.reason.slice(0, 50)}...`,
        severity: 'INFO',
        eventKey: `commission_adjustment_${commissionId}_${Date.now()}`,
        meta: {
          project_name: ctx.projectName,
          unit_sku: ctx.unitSku,
          broker_name: ctx.brokerName,
          client_name: ctx.clientName,
          adjustment_type: input.type,
          adjustment_value: input.amount,
          has_attachment: Boolean(input.attachment_url),
        },
      }));
    },
  });
}

/**
 * Registra um pagamento e recalcula `commissions.total_pago`/`saldo`/
 * `status` — tradução de `registerPaymentMutation`. Chama a RPC
 * `register_commission_payment` (ver `supabase/migrations/0029_*.sql`),
 * mesmo motivo de `useCreateAdjustment` acima.
 */
export function useCreatePayment(commissionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CommissionPaymentMutationPayload): Promise<CommissionPayment> => {
      const { data, error } = await supabase.rpc('register_commission_payment', {
        p_commission_id: commissionId,
        p_valor_pago: input.valor_pago,
        p_data_pagamento: input.data_pagamento,
        p_payment_method: input.payment_method ?? null,
        p_payment_reference: input.payment_reference ?? null,
        p_comprovante_url: input.comprovante_url ?? null,
        p_observacoes: input.observacoes ?? null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_payment, input) => {
      invalidateCommissionQueries(queryClient, commissionId);

      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: 'Pagamento de Comissão Registrado',
        message: `Pagamento de ${formatCurrency(input.valor_pago)} registrado. Projeto: ${ctx.projectName}, Unidade: ${ctx.unitSku}, Corretor: ${ctx.brokerName}. Saldo restante: ${formatCurrency(ctx.saldo)}`,
        // Fiel ao original (`newSaldo <= 0.01 ? "INFO" : "ALERTA"`): "INFO" quando a
        // comissão já ficou quitada com este pagamento, "ALERTA" enquanto ainda resta saldo.
        severity: ctx.saldo <= 0.01 ? 'INFO' : 'ALERTA',
        eventKey: `commission_payment_${commissionId}_${Date.now()}`,
        meta: {
          project_name: ctx.projectName,
          unit_sku: ctx.unitSku,
          broker_name: ctx.brokerName,
          client_name: ctx.clientName,
          valor_pago: input.valor_pago,
          saldo: ctx.saldo,
        },
      }));
    },
  });
}

/**
 * Edita um pagamento e recalcula `commissions.total_pago`/`saldo`/`status`
 * — tradução de `editPaymentMutation`. Chama a RPC `update_commission_payment`
 * (ver `supabase/migrations/0029_*.sql`), mesmo motivo de `useCreateAdjustment`.
 */
export function useUpdatePayment(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      data: input,
    }: {
      id: string;
      data: CommissionPaymentMutationPayload;
    }): Promise<{ payment: CommissionPayment; oldValorPago: number }> => {
      // Lido ANTES da RPC — precisamos do valor anterior só para o texto da
      // notificação ("editado de X para Y"), a RPC já recalcula
      // `total_pago`/`saldo` sozinha a partir da linha nova.
      const { data: oldPayment } = await supabase.from('commission_payments').select('valor_pago').eq('id', id).maybeSingle();

      const { data, error } = await supabase.rpc('update_commission_payment', {
        p_payment_id: id,
        p_valor_pago: input.valor_pago,
        p_data_pagamento: input.data_pagamento,
        p_payment_method: input.payment_method ?? null,
        p_payment_reference: input.payment_reference ?? null,
        p_comprovante_url: input.comprovante_url ?? null,
        p_observacoes: input.observacoes ?? null,
      });

      if (error) throw error;
      return { payment: data, oldValorPago: oldPayment?.valor_pago ?? input.valor_pago };
    },
    onSuccess: ({ payment, oldValorPago }) => {
      invalidateCommissionQueries(queryClient, commissionId);

      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: 'Pagamento de Comissão Editado',
        message: `Pagamento editado de ${formatCurrency(oldValorPago)} para ${formatCurrency(payment.valor_pago)}. Projeto: ${ctx.projectName}, Unidade: ${ctx.unitSku}, Corretor: ${ctx.brokerName}. Novo saldo: ${formatCurrency(ctx.saldo)}`,
        severity: 'INFO',
        eventKey: `commission_payment_edit_${commissionId}_${Date.now()}`,
        meta: {
          project_name: ctx.projectName,
          unit_sku: ctx.unitSku,
          broker_name: ctx.brokerName,
          client_name: ctx.clientName,
          old_valor: oldValorPago,
          new_valor: payment.valor_pago,
          saldo: ctx.saldo,
          edited_by: user?.email ?? null,
        },
      }));
    },
  });
}

/**
 * Soft-deleta um pagamento e recalcula `commissions.total_pago`/`saldo`/
 * `status` — tradução de `deletePaymentMutation`. Chama a RPC
 * `delete_commission_payment` (ver `supabase/migrations/0029_*.sql`),
 * mesmo motivo de `useCreateAdjustment`.
 */
export function useSoftDeletePayment(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (paymentId: string): Promise<number> => {
      // Lido ANTES da RPC — só para o texto da notificação ("valor excluído").
      const { data: payment } = await supabase.from('commission_payments').select('valor_pago').eq('id', paymentId).maybeSingle();

      const { error } = await supabase.rpc('delete_commission_payment', { p_payment_id: paymentId });
      if (error) throw error;

      return payment?.valor_pago ?? 0;
    },
    onSuccess: (deletedValorPago) => {
      invalidateCommissionQueries(queryClient, commissionId);

      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: 'Pagamento de Comissão Excluído',
        message: `Pagamento de ${formatCurrency(deletedValorPago)} foi excluído. Projeto: ${ctx.projectName}, Unidade: ${ctx.unitSku}, Corretor: ${ctx.brokerName}. Novo saldo: ${formatCurrency(ctx.saldo)}`,
        severity: 'ALERTA',
        eventKey: `commission_payment_delete_${commissionId}_${Date.now()}`,
        meta: {
          project_name: ctx.projectName,
          unit_sku: ctx.unitSku,
          broker_name: ctx.brokerName,
          client_name: ctx.clientName,
          valor_excluido: deletedValorPago,
          saldo: ctx.saldo,
          deleted_by: user?.email ?? null,
        },
      }));
    },
  });
}

/** Agenda o pagamento (`status: 'agendado'`, grava `due_date`) — tradução de `scheduleMutation` (`CommissionDetail.jsx`). */
export function useScheduleCommission(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (dueDate: string): Promise<void> => {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'agendado', due_date: dueDate, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (error) throw error;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}

/** Cancela a comissão (`status: 'cancelado'`, grava o motivo em `notes`) — tradução de `cancelMutation` (`CommissionDetail.jsx`). */
export function useCancelCommission(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (notes: string): Promise<void> => {
      const { error } = await supabase
        .from('commissions')
        .update({ status: 'cancelado', notes, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (error) throw error;
    },
    onSuccess: (_data, notes) => {
      invalidateCommissionQueries(queryClient, commissionId);

      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: 'Comissão Cancelada',
        message: `Comissão de ${ctx.brokerName ?? 'corretor'} foi cancelada. Motivo: ${notes.slice(0, 50)}...`,
        severity: 'ALERTA',
        eventKey: `commission_cancelled_${commissionId}_${Date.now()}`,
        meta: { project_name: ctx.projectName, unit_sku: ctx.unitSku, broker_name: ctx.brokerName, client_name: ctx.clientName },
      }));
    },
  });
}

/**
 * Finaliza a comissão (`is_finalizada: true`, `status: 'pago'`) — tradução
 * de `finalizeMutation`. A trava contra novos ajustes/pagamentos/
 * cancelamento é decidida no frontend (`canManage`/`canFinalize` em
 * `CommissionDetailPage`, fiel ao original) e reforçada nos hooks de
 * mutation acima (`if (commission.is_finalizada) throw ...`) — não há
 * policy de RLS dedicada para isso (fora de escopo desta leva, mesma
 * lacuna já aceita no original, que também só trava no frontend/aplicação).
 */
export function useFinalizeCommission(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase
        .from('commissions')
        .update({
          is_finalizada: true,
          status: 'pago',
          finalized_at: new Date().toISOString(),
          finalized_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .eq('id', commissionId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCommissionQueries(queryClient, commissionId);

      void notifyCommissionEvent(commissionId, (ctx) => ({
        title: 'Comissão Finalizada e Paga',
        message: `Comissão no valor de ${formatCurrency(ctx.totalComissao)} foi finalizada. Total pago: ${formatCurrency(ctx.totalPago)}`,
        severity: 'CRITICO',
        eventKey: `commission_finalized_${commissionId}_${Date.now()}`,
        meta: {
          project_name: ctx.projectName,
          unit_sku: ctx.unitSku,
          broker_name: ctx.brokerName,
          client_name: ctx.clientName,
          total_comissao: ctx.totalComissao,
          total_pago: ctx.totalPago,
        },
      }));
    },
  });
}
