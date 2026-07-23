import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/PageHeader';
import { useCommissions } from '@/features/commissions/hooks';
import { useDeals } from '@/features/deals/hooks';
import { formatCurrency } from '@/features/investors/constants';
import { useInvestmentContributions, useInvestmentReturns, useInvestors, useProjectInvestors } from '@/features/investors/hooks';
import { calculateAmountDue, calculateInvestorShare, calculateProjectResults } from '@/features/investors/resultHelpers';
import { useProjects } from '@/features/projects/hooks';

/**
 * Tradução de `original-project/src/pages/InvestorDashboard.jsx` — resultado
 * operacional de cada projeto cruzado com o capital investido nele. Sem o
 * card/alerta de "retornos legados sem classificação" nem a migração
 * automática (`migrateInvestmentReturns`): não existe dado legado nesta
 * plataforma nova (`investment_returns.return_type` é `not null` desde o
 * primeiro registro).
 */
export function InvestorDashboardPage() {
  const { data: projects, isLoading: isLoadingProjects, isError: isErrorProjects, refetch: refetchProjects } = useProjects();
  const { data: investors, isLoading: isLoadingInvestors, isError: isErrorInvestors, refetch: refetchInvestors } = useInvestors();
  const { data: projectInvestors, isLoading: isLoadingLinks, isError: isErrorLinks, refetch: refetchLinks } = useProjectInvestors();
  const {
    data: contributions,
    isLoading: isLoadingContributions,
    isError: isErrorContributions,
    refetch: refetchContributions,
  } = useInvestmentContributions();
  const { data: returns, isLoading: isLoadingReturns, isError: isErrorReturns, refetch: refetchReturns } = useInvestmentReturns();
  const { data: deals, isLoading: isLoadingDeals, isError: isErrorDeals, refetch: refetchDeals } = useDeals();
  const { data: commissions, isLoading: isLoadingCommissions, isError: isErrorCommissions, refetch: refetchCommissions } = useCommissions();

  const isLoading =
    isLoadingProjects || isLoadingInvestors || isLoadingLinks || isLoadingContributions || isLoadingReturns || isLoadingDeals || isLoadingCommissions;
  const isError = isErrorProjects || isErrorInvestors || isErrorLinks || isErrorContributions || isErrorReturns || isErrorDeals || isErrorCommissions;

  function refetchAll() {
    void refetchProjects();
    void refetchInvestors();
    void refetchLinks();
    void refetchContributions();
    void refetchReturns();
    void refetchDeals();
    void refetchCommissions();
  }

  const activeProjects = projects ?? [];
  const activeInvestors = investors ?? [];
  const activeLinks = projectInvestors ?? [];
  const activeContributions = contributions ?? [];
  const activeReturns = returns ?? [];
  const allDeals = deals ?? [];
  const allCommissions = commissions ?? [];

  const projectsWithResults = useMemo(
    () =>
      activeProjects.map((project) => {
        const projectDeals = allDeals.filter((d) => d.project_id === project.id);
        const projectCommissions = allCommissions.filter((c) => c.project_id === project.id);
        return { ...project, results: calculateProjectResults(projectDeals, projectCommissions, project) };
      }),
    [activeProjects, allDeals, allCommissions]
  );

  // Total investido: só aportes CONFIRMADO (mesmo critério de
  // `aggregateContributionsByInvestor`, mas calculado direto aqui — sem
  // filtro de status para "Investido neste Projeto" por projeto, abaixo,
  // fiel à mesma inconsistência já presente no original entre o total geral
  // (só CONFIRMADO) e o total por projeto (todos os status).
  const totalInvested = activeContributions.filter((c) => c.status === 'CONFIRMADO').reduce((sum, c) => sum + c.valor, 0);

  const totalPrincipal = activeReturns.filter((r) => r.return_type === 'PRINCIPAL').reduce((sum, r) => sum + r.valor, 0);
  const totalDividendsInvestor = activeReturns.filter((r) => r.return_type === 'DIVIDENDO_INVESTIDOR').reduce((sum, r) => sum + r.valor, 0);
  const totalDividendsVivlar = activeReturns.filter((r) => r.return_type === 'DIVIDENDO_VIVLAR').reduce((sum, r) => sum + r.valor, 0);
  const totalReturned = totalPrincipal + totalDividendsInvestor + totalDividendsVivlar;

  const totalPaidToInvestors = totalPrincipal + totalDividendsInvestor;
  const investorBalanceInVivlar = Math.max(0, totalInvested - totalPaidToInvestors);
  const hasNegativeBalance = totalInvested - totalPaidToInvestors < 0;

  const contributionsByInvestor = useMemo(() => {
    const aggregated = new Map<string, { investor_id: string | null; total_aportado: number }>();
    activeContributions
      .filter((c) => c.status === 'CONFIRMADO')
      .forEach((c) => {
        const key = c.investor_id ?? 'outros';
        const current = aggregated.get(key) ?? { investor_id: c.investor_id, total_aportado: 0 };
        current.total_aportado += c.valor;
        aggregated.set(key, current);
      });
    return Array.from(aggregated.values());
  }, [activeContributions]);

  const investorBalances = useMemo(
    () =>
      contributionsByInvestor
        .map((inv) => {
          const investorReturnsList = activeReturns.filter((r) => r.investor_id === inv.investor_id);
          const principalReturned = investorReturnsList.filter((r) => r.return_type === 'PRINCIPAL').reduce((sum, r) => sum + r.valor, 0);
          const dividendsReceived = investorReturnsList.filter((r) => r.return_type === 'DIVIDENDO_INVESTIDOR').reduce((sum, r) => sum + r.valor, 0);
          const totalPaid = principalReturned + dividendsReceived;
          const balance = Math.max(0, inv.total_aportado - totalPaid);
          const investor = activeInvestors.find((i) => i.id === inv.investor_id);

          return {
            investor_id: inv.investor_id,
            investor_name: investor?.nome ?? 'Capital Próprio (Vivlar)',
            balance,
          };
        })
        .sort((a, b) => b.balance - a.balance),
    [contributionsByInvestor, activeReturns, activeInvestors]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Resultado Operacional x Investimentos" subtitle="Visão integrada de projetos e investidores" />

      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={refetchAll} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="mb-1 text-sm text-muted-foreground">Total Investido</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalInvested)}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="space-y-3 pt-6">
                <p className="mb-2 text-sm text-muted-foreground">Retornos Totais</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Retorno de Aporte</p>
                    <p className="text-lg font-semibold text-blue-600">{formatCurrency(totalPrincipal)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Dividendos Investidor</p>
                    <p className="text-lg font-semibold text-green-600">{formatCurrency(totalDividendsInvestor)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Dividendos Vivlar</p>
                    <p className="text-lg font-semibold text-amber-600">{formatCurrency(totalDividendsVivlar)}</p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <p className="text-sm font-semibold text-foreground">Total</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(totalReturned)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100 shadow-sm">
              <CardContent className="pt-6">
                <div className="mb-3 flex items-start justify-between">
                  <p className="text-sm font-medium text-purple-700">Saldo dos Investidores na Vivlar</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="h-4 w-4 cursor-help text-purple-600" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Saldo em aberto dos investidores = Investido – (Retorno de Aporte + Dividendos Investidor)
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="mb-3 text-3xl font-bold text-purple-900">{formatCurrency(investorBalanceInVivlar)}</p>
                <div className="mb-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-purple-700">
                    <span>Investido:</span>
                    <span className="font-semibold">{formatCurrency(totalInvested)}</span>
                  </div>
                  <div className="flex items-center justify-between text-purple-700">
                    <span>Pago ao investidor:</span>
                    <span className="font-semibold">{formatCurrency(totalPaidToInvestors)}</span>
                  </div>
                </div>
                {hasNegativeBalance && (
                  <Alert className="mb-3 border-red-200 bg-red-50 px-3 py-2">
                    <AlertTriangle className="h-3 w-3 text-red-600" />
                    <AlertDescription className="text-xs text-red-700">Verifique lançamentos: retornos excedem investido.</AlertDescription>
                  </Alert>
                )}
                <div className="border-t border-purple-200 pt-3">
                  <p className="mb-2 text-xs font-semibold text-purple-800">Saldo por Investidor:</p>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {investorBalances.length === 0 ? (
                      <p className="text-xs italic text-purple-600">Nenhum investidor com saldo em aberto</p>
                    ) : (
                      investorBalances.map((inv) => (
                        <div key={inv.investor_id ?? 'outros'} className="flex items-center justify-between rounded bg-white/50 px-2 py-1.5 text-xs">
                          <span className="flex-1 truncate font-medium text-purple-900">{inv.investor_name}</span>
                          <span className="ml-2 font-bold text-purple-900">{formatCurrency(inv.balance)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="mb-1 text-sm text-muted-foreground">Projetos Ativos</p>
                <p className="text-2xl font-bold text-foreground">{projectsWithResults.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <p className="mb-1 text-sm text-muted-foreground">Investidores</p>
                <p className="text-2xl font-bold text-foreground">{activeInvestors.length}</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Projetos</h2>
            {projectsWithResults.length === 0 ? (
              <p className="text-muted-foreground">Nenhum projeto cadastrado</p>
            ) : (
              <div className="grid gap-4">
                {projectsWithResults.map((project) => {
                  const projInvestors = activeLinks.filter((pi) => pi.project_id === project.id);
                  const projectContributions = activeContributions.filter((c) => c.project_id === project.id);
                  const projectReturns = activeReturns.filter((r) => r.project_id === project.id);

                  const totalInvestedInProject = projectContributions.reduce((sum, c) => sum + c.valor, 0);

                  const principalReturned = projectReturns.filter((r) => r.return_type === 'PRINCIPAL').reduce((sum, r) => sum + r.valor, 0);
                  const dividendsInvestor = projectReturns.filter((r) => r.return_type === 'DIVIDENDO_INVESTIDOR').reduce((sum, r) => sum + r.valor, 0);
                  const dividendsVivlar = projectReturns.filter((r) => r.return_type === 'DIVIDENDO_VIVLAR').reduce((sum, r) => sum + r.valor, 0);
                  const totalReturnedInProject = principalReturned + dividendsInvestor + dividendsVivlar;

                  const projectPaidToInvestors = principalReturned + dividendsInvestor;
                  const projectInvestorBalance = Math.max(0, totalInvestedInProject - projectPaidToInvestors);

                  return (
                    <Card key={project.id} className="border-0 shadow-sm">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle>{project.name}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">{project.code}</p>
                          </div>
                          <Badge className="bg-slate-500 text-white">{project.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 rounded-lg bg-muted p-3 lg:grid-cols-4">
                          <div>
                            <p className="mb-0.5 text-xs text-muted-foreground">Receita</p>
                            <p className="font-semibold text-foreground">{formatCurrency(project.results.receivedRevenue)}</p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-xs text-muted-foreground">Custos</p>
                            <p className="font-semibold text-foreground">{formatCurrency(project.results.totalCosts)}</p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-xs text-muted-foreground">Lucro Líquido</p>
                            <p className={`font-semibold ${project.results.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(project.results.netResult)}
                            </p>
                          </div>
                          <div>
                            <p className="mb-0.5 text-xs text-muted-foreground">Margem</p>
                            <p className="font-semibold text-foreground">{project.results.margin.toFixed(2)}%</p>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Investido neste Projeto</p>
                            <p className="font-semibold text-foreground">{formatCurrency(totalInvestedInProject)}</p>
                          </div>
                          <div className="flex items-center justify-between border-y border-blue-200 bg-purple-50 py-2">
                            <p className="text-xs font-semibold text-purple-700">Saldo do Investidor neste Projeto</p>
                            <p className="font-bold text-purple-900">{formatCurrency(projectInvestorBalance)}</p>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Retornos:</p>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">• Retorno de Aporte</p>
                                <p className="text-sm font-medium text-blue-600">{formatCurrency(principalReturned)}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">• Dividendos Investidor</p>
                                <p className="text-sm font-medium text-green-600">{formatCurrency(dividendsInvestor)}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">• Dividendos Vivlar</p>
                                <p className="text-sm font-medium text-amber-600">{formatCurrency(dividendsVivlar)}</p>
                              </div>
                              <div className="flex items-center justify-between border-t border-blue-200 pt-1.5">
                                <p className="text-xs font-semibold text-foreground">Retornado Total</p>
                                <p className="font-semibold text-green-600">{formatCurrency(totalReturnedInProject)}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {projInvestors.length > 0 && (
                          <div>
                            <p className="mb-2 text-sm font-semibold text-foreground">Investidores Vinculados</p>
                            <div className="space-y-2">
                              {projInvestors.map((pi) => {
                                const investorShare = calculateInvestorShare(project.results, pi.percentual_participacao);
                                const investorContributions = activeContributions.filter(
                                  (c) => c.project_id === project.id && c.investor_id === pi.investor_id
                                );
                                const investorReturns = activeReturns.filter((r) => r.project_id === project.id && r.investor_id === pi.investor_id);
                                const totalInvestorAporte = investorContributions.reduce((sum, c) => sum + c.valor, 0);
                                const totalInvestorReturn = investorReturns.reduce((sum, r) => sum + r.valor, 0);
                                const investorDue = calculateAmountDue(totalInvestorAporte, investorShare.netResult, totalInvestorReturn);

                                return (
                                  <div key={pi.id} className="rounded border p-2 text-sm">
                                    <div className="mb-1 flex items-center justify-between">
                                      <span className="font-medium text-foreground">{pi.nome_exibicao}</span>
                                      <Badge variant="outline">{pi.percentual_participacao.toFixed(2)}%</Badge>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                      <div>
                                        <p className="text-muted-foreground">Aporte</p>
                                        <p className="font-semibold text-foreground">{formatCurrency(totalInvestorAporte)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Lucro Esp.</p>
                                        <p className="font-semibold text-green-600">{formatCurrency(investorShare.netResult)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">A Receber</p>
                                        <p className={`font-semibold ${investorDue >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                          {formatCurrency(investorDue)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
