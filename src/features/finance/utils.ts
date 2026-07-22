import type { InstallmentStatus, PaymentInstallment } from '@/features/finance/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';

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

/**
 * Tradução de `getDiasAtraso` em `original-project/src/pages/InadimplenciaManager.jsx`
 * — dias corridos entre o vencimento e hoje (só faz sentido para parcelas já
 * `em_atraso`, mas não valida isso aqui, mesmo comportamento do original).
 */
export function getDiasAtraso(installment: Pick<PaymentInstallment, 'vencimento'>, today: Date = new Date()): number {
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const vencimento = new Date(installment.vencimento);
  const vencimentoDate = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());
  return Math.floor((todayDate.getTime() - vencimentoDate.getTime()) / (1000 * 60 * 60 * 24));
}

export interface OverdueAgingBuckets {
  '1-7': PaymentInstallment[];
  '8-15': PaymentInstallment[];
  '16-30': PaymentInstallment[];
  '30+': PaymentInstallment[];
}

/** Tradução de `porFaixa` em `InadimplenciaManager.jsx` — agrupa parcelas em atraso (já filtradas por `useOverdueInstallments`) por faixa de dias, para os 4 cards de KPI do topo. */
export function groupOverdueByAging(installments: PaymentInstallment[], today: Date = new Date()): OverdueAgingBuckets {
  return {
    '1-7': installments.filter((i) => getDiasAtraso(i, today) <= 7),
    '8-15': installments.filter((i) => {
      const dias = getDiasAtraso(i, today);
      return dias > 7 && dias <= 15;
    }),
    '16-30': installments.filter((i) => {
      const dias = getDiasAtraso(i, today);
      return dias > 15 && dias <= 30;
    }),
    '30+': installments.filter((i) => getDiasAtraso(i, today) > 30),
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

// ---------------------------------------------------------------------
// FinanceDashboardPage — tradução das funções de cálculo de
// `original-project/src/pages/FinanceDashboard.jsx` (fora de
// `financeHelpers.jsx`; existiam soltas no próprio arquivo da página, mas
// são puras e cabem aqui, mesmo padrão do restante deste arquivo). Os
// gráficos do original usam `recharts` (não instalado nesta leva, evitado
// de propósito — ver relatório da tarefa); aqui os mesmos dados alimentam
// gráficos em CSS puro (`FinanceDashboardCharts.tsx`), mesmo espírito do
// `SalesFunnel` do dashboard executivo.
// ---------------------------------------------------------------------

export type FinancePeriodFilter = '3m' | '6m' | '12m' | 'all';

/** Tradução de `filterByPeriod` — filtra por `vencimento` dentro dos últimos N meses (`'all'` não filtra). */
export function filterInstallmentsByPeriod(installments: PaymentInstallment[], period: FinancePeriodFilter): PaymentInstallment[] {
  if (period === 'all') return installments;

  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return installments.filter((i) => new Date(i.vencimento) >= cutoff);
}

interface MonthBucket {
  year: number;
  monthIndex: number;
  label: string;
}

/** Tradução de `getLast12Months` — os 12 meses corridos até o atual, do mais antigo ao mais recente. */
function getLast12Months(today: Date = new Date()): MonthBucket[] {
  const months: MonthBucket[] = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    });
  }

  return months;
}

export interface MonthlyRevenuePoint {
  mes: string;
  previsto: number;
  recebido: number;
}

/** Tradução de `calculateMonthlyRevenue` — "Receita Mensal": previsto (todas as parcelas com vencimento no mês) vs. recebido (só as pagas), últimos 12 meses corridos. */
export function calculateMonthlyRevenue(installments: PaymentInstallment[], today: Date = new Date()): MonthlyRevenuePoint[] {
  return getLast12Months(today).map((month) => {
    const monthInstallments = installments.filter((i) => {
      const vencimento = new Date(i.vencimento);
      return vencimento.getMonth() === month.monthIndex && vencimento.getFullYear() === month.year;
    });

    const previsto = monthInstallments.reduce((sum, i) => sum + (i.valor_previsto || 0), 0);
    const recebido = monthInstallments
      .filter((i) => i.status === 'pago')
      .reduce((sum, i) => sum + (i.valor_pago ?? i.valor_previsto ?? 0), 0);

    return { mes: month.label, previsto, recebido };
  });
}

export interface RevenueByProjectPoint {
  projeto: string;
  valor: number;
}

/** Tradução de `calculateRevenueByProject` — soma de recebido (parcelas `pago`) por projeto, via `unit_id -> project_id`, top 10. */
export function calculateRevenueByProject(
  installments: PaymentInstallment[],
  units: Pick<Unit, 'id' | 'project_id'>[],
  projects: Pick<Project, 'id' | 'name'>[]
): RevenueByProjectPoint[] {
  const byProject = new Map<string, RevenueByProjectPoint>();

  for (const i of installments) {
    if (i.status !== 'pago') continue;

    const unit = units.find((u) => u.id === i.unit_id);
    const projectId = unit?.project_id ?? 'outros';
    const project = projects.find((p) => p.id === projectId);

    const current = byProject.get(projectId) ?? { projeto: project?.name ?? 'Outros', valor: 0 };
    current.valor += i.valor_pago ?? i.valor_previsto ?? 0;
    byProject.set(projectId, current);
  }

  return Array.from(byProject.values())
    .filter((p) => p.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
}

export interface PaymentMixPoint {
  forma: string;
  valor: number;
  color: string;
}

/**
 * `metodo_pagamento` é texto livre neste projeto (preenchido a mão em
 * `RegisterPaymentDialog`, ver comentário em `schemas.ts`), diferente do
 * original (`<Select>` com valores fixos `PIX`/`BOLETO`/`TRANSFERENCIA`).
 * Normaliza (maiúsculas, sem acento) antes de comparar, pra não cair em
 * "Outros" só por causa de caixa/acentuação.
 */
function normalizeMetodoPagamento(value: string | null): 'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'OUTROS' {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  if (normalized === 'PIX') return 'PIX';
  if (normalized === 'BOLETO') return 'BOLETO';
  if (normalized === 'TRANSFERENCIA') return 'TRANSFERENCIA';
  return 'OUTROS';
}

/** Tradução de `calculatePaymentMix` — soma de recebido por forma de pagamento, só parcelas `pago`. */
export function calculatePaymentMix(installments: PaymentInstallment[]): PaymentMixPoint[] {
  const mix: Record<'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'OUTROS', PaymentMixPoint> = {
    PIX: { forma: 'PIX', valor: 0, color: '#00d9ff' },
    BOLETO: { forma: 'Boleto', valor: 0, color: '#ff9800' },
    TRANSFERENCIA: { forma: 'Transferência', valor: 0, color: '#4caf50' },
    OUTROS: { forma: 'Outros', valor: 0, color: '#9e9e9e' },
  };

  for (const i of installments) {
    if (i.status !== 'pago') continue;
    const key = normalizeMetodoPagamento(i.metodo_pagamento);
    mix[key].valor += i.valor_pago ?? i.valor_previsto ?? 0;
  }

  return Object.values(mix).filter((m) => m.valor > 0);
}

export interface MonthlyDefaultPoint {
  mes: string;
  taxa: number;
}

/** Tradução de `calculateMonthlyDefault` — "Taxa de Inadimplência (%)": percentual de parcelas com vencimento no mês que estão `em_atraso` hoje. */
export function calculateMonthlyDefault(installments: PaymentInstallment[], today: Date = new Date()): MonthlyDefaultPoint[] {
  return getLast12Months(today).map((month) => {
    const monthInstallments = installments.filter((i) => {
      const vencimento = new Date(i.vencimento);
      return vencimento.getMonth() === month.monthIndex && vencimento.getFullYear() === month.year;
    });

    const total = monthInstallments.length;
    const atrasados = monthInstallments.filter((i) => computeInstallmentDisplayStatus(i, today) === 'em_atraso').length;
    const taxa = total > 0 ? (atrasados / total) * 100 : 0;

    return { mes: month.label, taxa };
  });
}
