import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { InvestorNotLinkedState } from '@/features/investor-portal/components/InvestorNotLinkedState';
import { useMyInvestor } from '@/features/investor-portal/hooks';
import { formatCurrency } from '@/features/investors/constants';
import { useInvestmentContributions, useInvestmentReturns, useProjectInvestors } from '@/features/investors/hooks';
import { useProjects } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Resumo pessoal exibido em `InvestorDashboardPage` para `tenant_role =
 * 'investidor'` — landing page do Portal do Investidor (item "Dashboard" da
 * nav, `features/dashboard/navigation.ts`).
 *
 * NÃO É uma tradução do `InvestorDashboard.jsx` original: aquela página (512
 * linhas) lista TODOS os investidores lado a lado com nome/saldo de cada um
 * (`investorBalances`) — dado financeiro privado de terceiros que a RLS
 * (`0055_rls_investor_portal.sql`) passou a bloquear de propósito para este
 * papel (ver racional completo no topo da migration e no relatório desta
 * tarefa). Esta view é NOVA: só os PRÓPRIOS projetos/aportes/retornos/saldo
 * do investidor autenticado, no mesmo espírito visual dos cards de
 * `InvestorDashboardPage` (admin), mas sem a lista "Saldo por Investidor".
 *
 * DELIBERADAMENTE SEM "Lucro Esperado" agregado aqui: somar o resultado
 * operacional (RPC `get_project_operational_result`) de TODOS os projetos
 * do investidor exigiria uma chamada de RPC por projeto já nesta tela de
 * entrada (mesmo custo de `InvestorProjectCard`, mas sem o valor por card
 * que justifica isso lá). Os cards de projeto abaixo linkam direto para
 * "Meus Projetos" (`InvestorProjectsPage`), que já mostra Lucro Esperado/
 * Margem por projeto.
 */
export function InvestorDashboardInvestorView() {
  const { data: investor, isLoading: isLoadingInvestor, isError: isErrorInvestor, refetch: refetchInvestor } = useMyInvestor();
  const { data: projects, isLoading: isLoadingProjects, isError: isErrorProjects, refetch: refetchProjects } = useProjects();
  const { data: links, isLoading: isLoadingLinks, isError: isErrorLinks, refetch: refetchLinks } = useProjectInvestors();
  const {
    data: contributions,
    isLoading: isLoadingContributions,
    isError: isErrorContributions,
    refetch: refetchContributions,
  } = useInvestmentContributions();
  const { data: returns, isLoading: isLoadingReturns, isError: isErrorReturns, refetch: refetchReturns } = useInvestmentReturns();

  const isLoading =
    isLoadingInvestor || (Boolean(investor) && (isLoadingProjects || isLoadingLinks || isLoadingContributions || isLoadingReturns));
  const isError = isErrorInvestor || isErrorProjects || isErrorLinks || isErrorContributions || isErrorReturns;

  function refetchAll() {
    void refetchInvestor();
    void refetchProjects();
    void refetchLinks();
    void refetchContributions();
    void refetchReturns();
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={refetchAll} />;
  if (!investor) return <InvestorNotLinkedState />;

  const allProjects = projects ?? [];
  const activeLinks = (links ?? []).filter((link) => !link.is_deleted);
  const activeContributions = (contributions ?? []).filter((c) => !c.is_deleted);
  const activeReturns = (returns ?? []).filter((r) => !r.is_deleted);

  const totalInvested = activeContributions.filter((c) => c.status === 'CONFIRMADO').reduce((sum, c) => sum + c.valor, 0);

  const totalPrincipal = activeReturns.filter((r) => r.return_type === 'PRINCIPAL').reduce((sum, r) => sum + r.valor, 0);
  const totalDividendsInvestor = activeReturns.filter((r) => r.return_type === 'DIVIDENDO_INVESTIDOR').reduce((sum, r) => sum + r.valor, 0);
  const totalDividendsVivlar = activeReturns.filter((r) => r.return_type === 'DIVIDENDO_VIVLAR').reduce((sum, r) => sum + r.valor, 0);
  const totalReturned = totalPrincipal + totalDividendsInvestor + totalDividendsVivlar;

  const totalPaidToInvestor = totalPrincipal + totalDividendsInvestor;
  const balance = Math.max(0, totalInvested - totalPaidToInvestor);

  const myProjects = activeLinks
    .map((link) => {
      const project = allProjects.find((p) => p.id === link.project_id && !p.is_deleted);
      if (!project) return null;

      const aportado = activeContributions
        .filter((c) => c.project_id === project.id && c.status === 'CONFIRMADO')
        .reduce((sum, c) => sum + c.valor, 0);

      return { project, link, aportado };
    })
    .filter((entry): entry is { project: (typeof allProjects)[number]; link: (typeof activeLinks)[number]; aportado: number } => entry !== null);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Resumo dos seus investimentos" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Total Investido</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totalInvested)}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="space-y-3 pt-6">
            <p className="mb-2 text-sm text-muted-foreground">Retornos Recebidos</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Retorno de Aporte</p>
                <p className="text-lg font-semibold text-blue-600">{formatCurrency(totalPrincipal)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Dividendos</p>
                <p className="text-lg font-semibold text-green-600">{formatCurrency(totalDividendsInvestor)}</p>
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
            <p className="mb-3 text-sm font-medium text-purple-700">Seu Saldo na Vivlar</p>
            <p className="mb-3 text-3xl font-bold text-purple-900">{formatCurrency(balance)}</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-purple-700">
                <span>Investido:</span>
                <span className="font-semibold">{formatCurrency(totalInvested)}</span>
              </div>
              <div className="flex items-center justify-between text-purple-700">
                <span>Pago a você:</span>
                <span className="font-semibold">{formatCurrency(totalPaidToInvestor)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Seus Projetos</h2>
          <Link to={pageUrl('InvestorProjects')} className="flex items-center text-sm font-medium text-brand hover:underline">
            Ver todos <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </div>

        {myProjects.length === 0 ? (
          <p className="text-muted-foreground">Nenhum projeto vinculado</p>
        ) : (
          <div className="grid gap-4">
            {myProjects.map(({ project, link, aportado }) => (
              <Link key={project.id} to={`${pageUrl('InvestorProjects')}/${project.id}`} className="block no-underline">
                <Card className="border-0 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{project.code}</p>
                      </div>
                      <Badge className="bg-slate-500 text-white">{project.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Sua Participação</p>
                        <p className="font-semibold text-foreground">{link.percentual_participacao.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Aportado</p>
                        <p className="font-semibold text-foreground">{formatCurrency(aportado)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
