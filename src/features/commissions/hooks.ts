import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { COMMISSION_ADJUSTMENT_CONFIG, formatCurrency } from '@/features/commissions/constants';
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

/** Busca a linha fresca da comissão direto do banco (fora do cache do React Query) — usado pelos hooks de mutation abaixo para recalcular `gross_value`/`saldo`/`total_pago` a partir do estado mais recente possível, em vez de um valor potencialmente obsoleto vindo de props/closure da tela. */
async function fetchCommissionRow(commissionId: string): Promise<Commission> {
  const { data, error } = await supabase.from('commissions').select('*').eq('id', commissionId).single();
  if (error) throw error;
  return data;
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
 * (`CommissionDetail.jsx`). Diferente do original (que recalcula a partir
 * dos arrays de ajustes/pagamentos já carregados na tela), este hook busca
 * a linha fresca de `commissions` no banco antes de calcular (`gross_value
 * ?? base_value` como "total atual", `total_pago` já persistido) — mesmo
 * resultado quando os dois lados estão em sincronia (sempre estão, cada
 * mutation deste módulo grava os 3 campos), mas reduz a janela de
 * obsolescência. Ainda não é atômico (2 escritas sequenciais, sem RPC) —
 * mesma limitação já aceita em `finance_accounts`/`payment_installments`.
 * Bloqueia se `is_finalizada` (a comissão está travada).
 */
export function useCreateAdjustment(commissionId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CommissionAdjustmentMutationPayload): Promise<CommissionAdjustment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const commission = await fetchCommissionRow(commissionId);
      if (commission.is_finalizada) {
        throw new Error('Esta comissão está finalizada e não aceita novos ajustes.');
      }

      const { data: adjustment, error: adjustmentError } = await supabase
        .from('commission_adjustments')
        .insert({
          ...input,
          tenant_id: tenantId,
          commission_id: commissionId,
          attachment_uploaded_at: input.attachment_url ? new Date().toISOString() : null,
          attachment_uploaded_by_user_id: input.attachment_url ? (user?.id ?? null) : null,
          created_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (adjustmentError) throw adjustmentError;

      const signedAmount = input.amount * COMMISSION_ADJUSTMENT_CONFIG[input.type].sign;
      const currentTotal = commission.gross_value ?? commission.base_value;
      const newTotal = currentTotal + signedAmount;
      const newSaldo = newTotal - commission.total_pago;

      const { error: commissionError } = await supabase
        .from('commissions')
        .update({ gross_value: newTotal, saldo: newSaldo, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (commissionError) throw commissionError;

      return adjustment;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}

/**
 * Registra um pagamento e recalcula `commissions.total_pago`/`saldo`/
 * `status` (`pago` se o saldo zerar, mantém o status atual caso contrário)
 * — tradução de `registerPaymentMutation`. Valida que o valor não excede o
 * saldo disponível (tolerância de 1 centavo, fiel ao original) e que a
 * comissão não está finalizada.
 */
export function useCreatePayment(commissionId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CommissionPaymentMutationPayload): Promise<CommissionPayment> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const commission = await fetchCommissionRow(commissionId);
      if (commission.is_finalizada) {
        throw new Error('Esta comissão está finalizada e não aceita novos pagamentos.');
      }

      const totalComissao = commission.gross_value ?? commission.base_value;
      const saldoDisponivel = totalComissao - commission.total_pago;

      if (input.valor_pago > saldoDisponivel + 0.01) {
        throw new Error(`Valor informado excede o saldo disponível da comissão. Saldo atual: ${formatCurrency(saldoDisponivel)}`);
      }

      const { data: payment, error: paymentError } = await supabase
        .from('commission_payments')
        .insert({
          ...input,
          tenant_id: tenantId,
          commission_id: commissionId,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const newTotalPago = commission.total_pago + input.valor_pago;
      const newSaldo = totalComissao - newTotalPago;
      // Fiel a `registerPaymentMutation`: só força "pago" quando o saldo
      // zera; caso contrário mantém o status corrente (ex: "agendado" segue
      // "agendado" após um pagamento parcial).
      const newStatus = newSaldo <= 0.01 ? 'pago' : commission.status;

      const { error: commissionError } = await supabase
        .from('commissions')
        .update({ total_pago: newTotalPago, saldo: newSaldo, status: newStatus, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (commissionError) throw commissionError;

      return payment;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}

/**
 * Edita um pagamento e recalcula `commissions.total_pago`/`saldo`/`status`
 * — tradução de `editPaymentMutation`. Diferente de `useCreatePayment`, o
 * `newStatus` aqui sempre recai para `a_pagar` quando o saldo não zera
 * (fiel ao original: `newSaldo <= 0.01 ? "PAGO" : "A_PAGAR"`, não preserva
 * o status anterior).
 */
export function useUpdatePayment(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CommissionPaymentMutationPayload }): Promise<CommissionPayment> => {
      const commission = await fetchCommissionRow(commissionId);
      if (commission.is_finalizada) {
        throw new Error('Esta comissão está finalizada e não aceita edição de pagamentos.');
      }

      const { data: oldPayment, error: oldPaymentError } = await supabase
        .from('commission_payments')
        .select('*')
        .eq('id', id)
        .single();

      if (oldPaymentError) throw oldPaymentError;

      const totalComissao = commission.gross_value ?? commission.base_value;
      const saldoDisponivel = totalComissao - commission.total_pago + oldPayment.valor_pago;

      if (data.valor_pago > saldoDisponivel + 0.01) {
        throw new Error(`Valor informado excede o saldo disponível. Saldo disponível: ${formatCurrency(saldoDisponivel)}`);
      }

      const { data: payment, error: paymentError } = await supabase
        .from('commission_payments')
        .update({ ...data, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (paymentError) throw paymentError;

      const newTotalPago = commission.total_pago - oldPayment.valor_pago + data.valor_pago;
      const newSaldo = totalComissao - newTotalPago;
      const newStatus = newSaldo <= 0.01 ? 'pago' : 'a_pagar';

      const { error: commissionError } = await supabase
        .from('commissions')
        .update({ total_pago: newTotalPago, saldo: newSaldo, status: newStatus, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (commissionError) throw commissionError;

      return payment;
    },
    onSuccess: () => invalidateCommissionQueries(queryClient, commissionId),
  });
}

/**
 * Soft-deleta um pagamento e recalcula `commissions.total_pago`/`saldo`/
 * `status` — tradução de `deletePaymentMutation` (`newSaldo > 0.01 ?
 * "A_PAGAR" : "PAGO"`, fiel ao original).
 */
export function useSoftDeletePayment(commissionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (paymentId: string): Promise<void> => {
      const commission = await fetchCommissionRow(commissionId);
      if (commission.is_finalizada) {
        throw new Error('Esta comissão está finalizada e não aceita exclusão de pagamentos.');
      }

      const { data: paymentToDelete, error: paymentFetchError } = await supabase
        .from('commission_payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (paymentFetchError) throw paymentFetchError;

      const { error: deleteError } = await supabase
        .from('commission_payments')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .eq('id', paymentId);

      if (deleteError) throw deleteError;

      const totalComissao = commission.gross_value ?? commission.base_value;
      const newTotalPago = commission.total_pago - paymentToDelete.valor_pago;
      const newSaldo = totalComissao - newTotalPago;
      const newStatus = newSaldo > 0.01 ? 'a_pagar' : 'pago';

      const { error: commissionError } = await supabase
        .from('commissions')
        .update({ total_pago: newTotalPago, saldo: newSaldo, status: newStatus, updated_by_user_id: user?.id ?? null })
        .eq('id', commissionId);

      if (commissionError) throw commissionError;
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
