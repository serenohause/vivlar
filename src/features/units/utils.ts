import type { Document } from '@/features/documents/types';
import type { FinanceAccount, PaymentInstallment } from '@/features/finance/types';
import { computeInstallmentDisplayStatus } from '@/features/finance/utils';
import type { StatusTransition } from '@/features/deals/types';
import { ADMIN_STATUS_ORDER } from '@/features/units/constants';
import type { Unit, UnitAdminStatus } from '@/features/units/types';

export type UnitFinanceStatus = 'ok' | 'atraso' | 'critico' | 'sem_dados';

export interface UnitComparisonMetrics {
  progressPercent: number;
  totalDays: number;
  docsCompleted: number;
  docsTotal: number;
  docsPercent: number;
  financeStatus: UnitFinanceStatus;
  overdueCount: number;
  score: number;
}

/**
 * Tradução de `calculateUnitMetrics` em
 * `original-project/src/pages/UnitsComparison.jsx` — score composto
 * (progresso do pipeline administrativo 40% + documentos aprovados 30% +
 * saúde financeira 30%) usado pelo ranking de `UnitsComparisonPage`.
 *
 * Duas adaptações de schema, sem mudar o resultado:
 * - `transitions`/`documents`/`installments` já vêm filtrados por `unit_id`
 *   como parâmetro nomeado, em vez do array cheio filtrado aqui dentro —
 *   quem chama decide o corte (a página filtra as listas gerais por
 *   `unit.id` antes de invocar esta função, mesmo resultado do
 *   `.filter(t => t.unit_id === unit.id)` do original).
 * - Status financeiro usa `computeInstallmentDisplayStatus` (fonte única de
 *   "em atraso" do módulo financeiro) em vez de comparar `vencimento` com
 *   `hoje` de novo aqui — mesma regra (não paga/cancelada + vencimento no
 *   passado).
 */
export function calculateUnitComparisonMetrics(
  unit: Pick<Unit, 'admin_status'>,
  unitTransitions: StatusTransition[],
  unitDocuments: Document[],
  financeAccount: FinanceAccount | undefined,
  accountInstallments: PaymentInstallment[]
): UnitComparisonMetrics {
  // 1. Progresso no fluxo administrativo MCMV.
  const currentIndex = unit.admin_status ? ADMIN_STATUS_ORDER.indexOf(unit.admin_status as UnitAdminStatus) : -1;
  const progressPercent = currentIndex >= 0 ? ((currentIndex + 1) / ADMIN_STATUS_ORDER.length) * 100 : 0;

  // 2. Tempo total na jornada, desde a primeira transição de status da unidade.
  const firstTransition = [...unitTransitions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
  const totalDays = firstTransition
    ? Math.floor((Date.now() - new Date(firstTransition.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // 3. Documentos aprovados (mínimo 10 no denominador, fiel ao original).
  const docsCompleted = unitDocuments.filter((d) => d.status === 'aprovado').length;
  const docsTotal = Math.max(unitDocuments.length, 10);
  const docsPercent = docsTotal > 0 ? (docsCompleted / docsTotal) * 100 : 0;

  // 4. Status financeiro — parcelas vencidas e não pagas da carteira da unidade.
  let financeStatus: UnitFinanceStatus = 'sem_dados';
  let overdueCount = 0;

  if (financeAccount) {
    overdueCount = accountInstallments.filter((i) => computeInstallmentDisplayStatus(i) === 'em_atraso').length;
    financeStatus = overdueCount === 0 ? 'ok' : overdueCount > 3 ? 'critico' : 'atraso';
  }

  // 5. Score geral (0-100).
  const financeScore =
    financeStatus === 'ok' ? 100 : financeStatus === 'atraso' ? 60 : financeStatus === 'critico' ? 30 : 50;
  const score = Math.round(progressPercent * 0.4 + docsPercent * 0.3 + financeScore * 0.3);

  return { progressPercent, totalDays, docsCompleted, docsTotal, docsPercent, financeStatus, overdueCount, score };
}

export function getUnitScoreColorClass(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

export function getUnitScoreBadge(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'Excelente', className: 'bg-green-100 text-green-700' };
  if (score >= 60) return { label: 'Bom', className: 'bg-yellow-100 text-yellow-700' };
  if (score >= 40) return { label: 'Regular', className: 'bg-orange-100 text-orange-700' };
  return { label: 'Crítico', className: 'bg-red-100 text-red-700' };
}
