import type { Commission } from '@/features/commissions/types';
import type { Deal } from '@/features/deals/types';
import type { InvestmentContribution, InvestmentReturn } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

/**
 * Tradução de `calculateProjectResults`
 * (`original-project/src/components/project/resultadoOperacional/resultadoHelpers.jsx`)
 * — usada por `InvestorDashboardPage` para cruzar o funil de vendas (`deals`)
 * e comissões (`commissions`) de um projeto com o capital investido nele.
 */
export interface ProjectResults {
  receivedRevenue: number;
  grossVGV: number;
  salesCosts: number;
  netVGV: number;
  totalConstructionCost: number;
  totalIndirectCosts: number;
  totalCosts: number;
  grossResult: number;
  netResult: number;
  margin: number;
}

/**
 * `total_construction_cost`/`total_indirect_costs` vêm de `projects`
 * (`supabase/migrations/0046_project_operational_result_costs.sql`),
 * preenchidos manualmente pela equipe em `ProjectForm` — mesma origem que
 * o original (`resultadoHelpers.jsx`, linhas 24-28).
 */
export function calculateProjectResults(
  deals: Deal[],
  commissions: Commission[],
  project: Pick<Project, 'total_construction_cost' | 'total_indirect_costs'>
): ProjectResults {
  const soldDeals = deals.filter((deal) => deal.sales_stage === 'vendido' && deal.final_sale_value != null);
  const receivedRevenue = soldDeals.reduce((sum, deal) => sum + (deal.final_sale_value ?? 0), 0);
  const grossVGV = receivedRevenue;

  const salesCosts = commissions.filter((c) => !c.is_deleted).reduce((sum, c) => sum + (c.gross_value ?? c.base_value ?? 0), 0);

  const netVGV = grossVGV - salesCosts;

  const totalConstructionCost = project.total_construction_cost ?? 0;
  const totalIndirectCosts = project.total_indirect_costs ?? 0;
  const totalCosts = totalConstructionCost + totalIndirectCosts;

  const grossResult = netVGV - totalCosts;
  const netResult = grossResult;
  const margin = receivedRevenue > 0 ? (netResult / receivedRevenue) * 100 : 0;

  return {
    receivedRevenue,
    grossVGV,
    salesCosts,
    netVGV,
    totalConstructionCost,
    totalIndirectCosts,
    totalCosts,
    grossResult,
    netResult,
    margin,
  };
}

/**
 * Formato de retorno da RPC `get_project_operational_result` (SECURITY
 * DEFINER, `supabase/migrations/0056_investor_operational_result.sql`) —
 * mesma fórmula de `calculateProjectResults` acima, mas calculada dentro do
 * banco a partir de `deals`/`commissions`, sem expor essas 2 tabelas linha a
 * linha ao papel `investidor` (nenhuma policy de SELECT existe para
 * `investidor` nessas tabelas, de propósito — ver racional na migration).
 * Usada pelo Portal do Investidor (`src/features/investor-portal`), que por
 * isso não pode montar um `ProjectResults` a partir de `deals`/`commissions`
 * como `InvestorDashboardPage` (admin) faz — só tem o agregado desta RPC.
 */
export interface ProjectOperationalResult {
  project_id: string;
  received_revenue: number;
  sales_costs: number;
  net_vgv: number;
  total_construction_cost: number;
  total_indirect_costs: number;
  total_costs: number;
  net_result: number;
  margin: number;
}

/**
 * Reconstrói um `ProjectResults` completo a partir do retorno da RPC —
 * `grossVGV`/`grossResult` não vêm da RPC porque `calculateProjectResults`
 * (linhas 38/49 acima) já os define como idênticos a `receivedRevenue`/
 * `netResult`, sem nenhum cálculo adicional; replicar essa igualdade aqui em
 * vez de devolver os 2 campos redundantes da função SQL evita duplicar a
 * mesma fórmula em dois lugares (TS e SQL). Usada pelo Portal do Investidor
 * para poder reaproveitar `calculateInvestorShare` (que espera um
 * `ProjectResults` completo) sobre o resultado vindo da RPC.
 */
export function projectResultsFromOperationalResult(result: ProjectOperationalResult): ProjectResults {
  return {
    receivedRevenue: result.received_revenue,
    grossVGV: result.received_revenue,
    salesCosts: result.sales_costs,
    netVGV: result.net_vgv,
    totalConstructionCost: result.total_construction_cost,
    totalIndirectCosts: result.total_indirect_costs,
    totalCosts: result.total_costs,
    grossResult: result.net_result,
    netResult: result.net_result,
    margin: result.margin,
  };
}

/** Tradução 1:1 de `calculateCycleDuration` (mesmo arquivo do original) — meses entre início e fim do ciclo de vendas de um projeto. */
export function calculateCycleDuration(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

export interface InvestorShare {
  netResult: number;
  receivedRevenue: number;
  margin: number;
  totalCosts: number;
}

/** Tradução 1:1 de `calculateInvestorShare` (`original-project/src/components/investment/investmentResultHelpers.jsx`) — recorta o resultado operacional do projeto na fatia (%) de um investidor. */
export function calculateInvestorShare(projectResults: ProjectResults, percentualParticipacao: number): InvestorShare {
  if (!projectResults || percentualParticipacao === 0) {
    return { netResult: 0, receivedRevenue: 0, margin: 0, totalCosts: 0 };
  }

  const percentage = percentualParticipacao / 100;

  return {
    netResult: projectResults.netResult * percentage,
    receivedRevenue: projectResults.receivedRevenue * percentage,
    margin: projectResults.margin,
    totalCosts: projectResults.totalCosts * percentage,
  };
}

/**
 * Tradução 1:1 de `calculateROI` (mesmo arquivo). Portada por completude
 * (pedida explicitamente no escopo desta tarefa) — assim como no original,
 * nenhuma tela desta leva exibe o ROI calculado por esta função (achado:
 * `calculateROI` é importado em `InvestorDashboard.jsx` mas nunca chamado
 * no JSX renderizado, mesmo padrão de código morto já documentado em
 * `calculateParticipationPercentages`, ver `0042_project_investors.sql`).
 */
export function calculateROI(lucroEsperado: number, totalAportado: number): number {
  if (totalAportado === 0) return 0;
  return (lucroEsperado / totalAportado) * 100;
}

/** Tradução 1:1 de `calculateAmountDue` (mesmo arquivo) — total ainda a receber pelo investidor (aporte + lucro esperado - já retornado). */
export function calculateAmountDue(totalAportado: number, lucroEsperado: number, totalRetornado = 0): number {
  return totalAportado + lucroEsperado - totalRetornado;
}

export interface AggregatedContribution {
  investor_id: string | null;
  total_aportado: number;
  num_aportes: number;
}

/** Tradução 1:1 de `aggregateContributionsByInvestor` (mesmo arquivo) — só aportes `CONFIRMADO` entram no total (fiel ao original). `investor_id` nulo (capital próprio da construtora) agrupa sob uma única chave interna ("outros"), mas mantém `investor_id: null` no resultado. */
export function aggregateContributionsByInvestor(contributions: InvestmentContribution[]): AggregatedContribution[] {
  const aggregated = new Map<string, AggregatedContribution>();

  contributions
    .filter((c) => !c.is_deleted && c.status === 'CONFIRMADO')
    .forEach((c) => {
      const key = c.investor_id ?? 'outros';
      const current = aggregated.get(key) ?? { investor_id: c.investor_id, total_aportado: 0, num_aportes: 0 };
      current.total_aportado += c.valor;
      current.num_aportes += 1;
      aggregated.set(key, current);
    });

  return Array.from(aggregated.values());
}

export interface AggregatedReturn {
  investor_id: string | null;
  total_retornado: number;
  num_retornos: number;
}

/**
 * Tradução 1:1 de `aggregateReturnsByInvestor` (mesmo arquivo) — só retornos
 * `PAGO` entram no total. Portada por completude (pedida explicitamente no
 * escopo desta tarefa); igual ao original, o resultado (`returnsByInvestor`)
 * é calculado em `InvestorDashboard.jsx` mas o valor agregado nunca é
 * exibido/usado de fato (só um `.find(...)` cujo resultado fica sem uso —
 * os totais "de verdade" mostrados na tela são recalculados direto de
 * `activeReturns`, sem o filtro `PAGO` desta função). `InvestorDashboardPage`
 * segue a MESMA lógica "de verdade" (sem filtro `PAGO`) para não divergir
 * do que o original efetivamente renderiza.
 */
export function aggregateReturnsByInvestor(returns: InvestmentReturn[]): AggregatedReturn[] {
  const aggregated = new Map<string, AggregatedReturn>();

  returns
    .filter((r) => !r.is_deleted && r.status === 'PAGO')
    .forEach((r) => {
      const key = r.investor_id ?? 'outros';
      const current = aggregated.get(key) ?? { investor_id: r.investor_id, total_retornado: 0, num_retornos: 0 };
      current.total_retornado += r.valor;
      current.num_retornos += 1;
      aggregated.set(key, current);
    });

  return Array.from(aggregated.values());
}
