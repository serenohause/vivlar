import type { InstallmentStatus, PaymentInstallment } from '@/features/finance/types';

/**
 * Tradução de `computeInstallmentComputedStatus` em
 * `original-project/src/components/finance/financeHelpers.jsx` — "fonte
 * única de verdade" dos cálculos financeiros do original. `pago`/`cancelado`
 * persistidos sempre vencem; caso contrário deriva `em_atraso` comparando
 * `vencimento` com a data de hoje (sem cron de escalonamento automático
 * nesta leva — ver `docs` do módulo Inadimplência, tarefa futura).
 */
export function computeInstallmentDisplayStatus(
  installment: Pick<PaymentInstallment, 'status' | 'vencimento'>,
  today: Date = new Date()
): InstallmentStatus {
  if (installment.status === 'cancelado') return 'cancelado';
  if (installment.status === 'pago') return 'pago';

  const vencimento = new Date(installment.vencimento);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const vencimentoDate = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());

  if (vencimentoDate < todayDate) return 'em_atraso';
  return installment.status;
}

export interface FinanceAccountTotals {
  totalPrevisto: number;
  totalPago: number;
  totalEmAberto: number;
  totalAtrasado: number;
  qtdAtrasadas: number;
  percentualQuitado: number;
}

/**
 * Tradução de `computeAccountTotals` em `financeHelpers.jsx` — totais de uma
 * carteira (ou de um conjunto de parcelas de várias carteiras, ver
 * `FinanceListPage`, que agrupa por unidade). Parcelas soft-deleted ou
 * `cancelado` são excluídas de todos os totais, fiel ao original.
 */
export function computeAccountTotals(installments: PaymentInstallment[], today: Date = new Date()): FinanceAccountTotals {
  const valid = installments.filter((i) => !i.is_deleted && i.status !== 'cancelado');

  const totalPrevisto = valid.reduce((sum, i) => sum + (i.valor_previsto || 0), 0);

  const totalPago = valid
    .filter((i) => i.status === 'pago')
    .reduce((sum, i) => sum + (i.valor_pago ?? i.valor_previsto ?? 0), 0);

  const atrasadas = valid.filter((i) => computeInstallmentDisplayStatus(i, today) === 'em_atraso');
  const totalAtrasado = atrasadas.reduce((sum, i) => sum + (i.valor_previsto || 0), 0);

  const totalEmAberto = valid.filter((i) => i.status !== 'pago').reduce((sum, i) => sum + (i.valor_previsto || 0), 0);

  const percentualQuitado = totalPrevisto > 0 ? (totalPago / totalPrevisto) * 100 : 0;

  return {
    totalPrevisto,
    totalPago,
    totalEmAberto,
    totalAtrasado,
    qtdAtrasadas: atrasadas.length,
    percentualQuitado,
  };
}

/** Tradução de `computeRecebidoNoMes` em `financeHelpers.jsx` — usado só pelo KPI "Recebido (Mês)" de `FinanceListPage`. */
export function computeRecebidoNoMes(installments: PaymentInstallment[], mes?: number, ano?: number): number {
  const today = new Date();
  const targetMonth = mes ?? today.getMonth() + 1;
  const targetYear = ano ?? today.getFullYear();

  return installments
    .filter((i) => {
      if (!i.data_pagamento || i.status !== 'pago' || i.is_deleted) return false;
      const dataPagamento = new Date(i.data_pagamento);
      return dataPagamento.getMonth() + 1 === targetMonth && dataPagamento.getFullYear() === targetYear;
    })
    .reduce((sum, i) => sum + (i.valor_pago ?? i.valor_previsto ?? 0), 0);
}
