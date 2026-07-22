import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type {
  CommissionAdjustmentMutationPayload,
  CommissionPaymentMutationPayload,
} from '@/features/commissions/schemas';
import type { Commission, CommissionAdjustment, CommissionPayment } from '@/features/commissions/types';
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
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
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
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}

/**
 * Edita um pagamento e recalcula `commissions.total_pago`/`saldo`/`status`
 * — tradução de `editPaymentMutation`. Chama a RPC `update_commission_payment`
 * (ver `supabase/migrations/0029_*.sql`), mesmo motivo de `useCreateAdjustment`.
 */
export function useUpdatePayment(commissionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data: input }: { id: string; data: CommissionPaymentMutationPayload }): Promise<CommissionPayment> => {
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
      return data;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
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

  return useMutation({
    mutationFn: async (paymentId: string): Promise<void> => {
      const { error } = await supabase.rpc('delete_commission_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
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
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
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
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}
