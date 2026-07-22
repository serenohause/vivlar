import { COMMISSION_ADJUSTMENT_CONFIG } from '@/features/commissions/constants';
import type { Commission, CommissionAdjustment, CommissionPayment } from '@/features/commissions/types';

/**
 * Tradução de `totalAjustes` (`CommissionDetail.jsx`) — soma assinada dos
 * ajustes (desconto = negativo, acréscimo/bônus = positivo). Ajustes são
 * write-once e nunca soft-deletados de fato (ver comentário em `types.ts`),
 * mas o original filtra defensivamente por `!a.is_deleted` antes de somar —
 * aqui já se assume que o array recebido veio filtrado pelo hook (mesmo
 * critério de `useCommissionAdjustments`).
 */
export function computeTotalAjustes(adjustments: Pick<CommissionAdjustment, 'type' | 'amount'>[]): number {
  return adjustments.reduce((sum, adj) => sum + adj.amount * COMMISSION_ADJUSTMENT_CONFIG[adj.type].sign, 0);
}

/** Tradução de `totalComissao` (`CommissionDetail.jsx`) — `base_value + totalAjustes`. */
export function computeTotalComissao(baseValue: number | null | undefined, totalAjustes: number): number {
  return (baseValue ?? 0) + totalAjustes;
}

/** Tradução de `totalPago` (`CommissionDetail.jsx`) — soma de `valor_pago` dos pagamentos (já filtrados por `!is_deleted`, mesmo critério de `useCommissionPayments`). */
export function computeTotalPago(payments: Pick<CommissionPayment, 'valor_pago'>[]): number {
  return payments.reduce((sum, p) => sum + p.valor_pago, 0);
}

/** Tradução de `saldo` (`CommissionDetail.jsx`) — `totalComissao - totalPago`. Pode ficar negativo (inconsistência legada, ver alerta em `CommissionDetailPage`), fiel ao original. */
export function computeSaldo(totalComissao: number, totalPago: number): number {
  return totalComissao - totalPago;
}

export interface CommissionTotals {
  totalAjustes: number;
  totalComissao: number;
  totalPago: number;
  saldo: number;
}

/**
 * Agrega os 4 totais de uma comissão a partir de `base_value` + ajustes +
 * pagamentos carregados na tela — usado só para exibição em
 * `CommissionDetailPage` (os cálculos que **persistem** em
 * `commissions.gross_value/saldo/total_pago` ficam nos hooks de mutation,
 * que recalculam a partir da linha fresca do banco em vez desses arrays
 * carregados na UI — ver comentário em `features/commissions/hooks.ts`).
 */
export function computeCommissionTotals(
  commission: Pick<Commission, 'base_value'>,
  adjustments: Pick<CommissionAdjustment, 'type' | 'amount'>[],
  payments: Pick<CommissionPayment, 'valor_pago'>[]
): CommissionTotals {
  const totalAjustes = computeTotalAjustes(adjustments);
  const totalComissao = computeTotalComissao(commission.base_value, totalAjustes);
  const totalPago = computeTotalPago(payments);
  const saldo = computeSaldo(totalComissao, totalPago);

  return { totalAjustes, totalComissao, totalPago, saldo };
}

/** Tradução de `computeRecebidoNoMes` equivalente para comissões — usado só pelo KPI "Pago no Mês" de `CommissionsListPage` (ver nota sobre `paid_at` órfão em `types.ts`). */
export function computeCommissionPagoNoMes(payments: Pick<CommissionPayment, 'valor_pago' | 'data_pagamento' | 'is_deleted'>[], today: Date = new Date()): number {
  return payments
    .filter((p) => {
      if (p.is_deleted) return false;
      const dataPagamento = new Date(p.data_pagamento);
      return dataPagamento.getMonth() === today.getMonth() && dataPagamento.getFullYear() === today.getFullYear();
    })
    .reduce((sum, p) => sum + p.valor_pago, 0);
}
