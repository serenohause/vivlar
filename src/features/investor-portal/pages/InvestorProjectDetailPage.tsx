import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { useMyInvestor, useProjectOperationalResult } from '@/features/investor-portal/hooks';
import { formatCurrency } from '@/features/investors/constants';
import { useInvestmentContributions, useInvestmentReturns, useProjectInvestors } from '@/features/investors/hooks';
import { calculateAmountDue, calculateInvestorShare, calculateROI, projectResultsFromOperationalResult } from '@/features/investors/resultHelpers';
import { useProject } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestorProjectDetail.jsx` —
 * detalhe de UM projeto vinculado ao investidor logado.
 *
 * ROTA: path param (`/investor-projects/:id`), não a query string
 * (`?projectId=`) do original — segue a convenção majoritária do resto do
 * app (`/<slug>/:id`, ver comentário de topo de `AppRoutes.tsx`), mesma
 * escolha já feita para `InvestorDetailPage` (`/investors/:id`).
 *
 * SIMPLIFICAÇÃO EM RELAÇÃO AO ORIGINAL: `useProject`/`useProjectInvestors`/
 * `useInvestmentContributions`/`useInvestmentReturns` são as MESMAS queries
 * do lado admin — a RLS (`0055_rls_investor_portal.sql`) já devolve só o
 * projeto (com vínculo ativo), os PRÓPRIOS vínculos/aportes/retornos do
 * investidor autenticado, sem precisar repetir nenhum filtro por
 * `investor_id`/`user.id` aqui.
 *
 * Resultado Operacional do projeto (receita/custos/lucro/margem) vem da RPC
 * `get_project_operational_result` (`0056_investor_operational_result.sql`)
 * — SEM fatiar pela participação do investidor, é o resultado do projeto
 * INTEIRO (mesmo texto contextual do original: "Seu lucro esperado é
 * calculado sobre sua participação"). `calculateInvestorShare` recorta esse
 * resultado na fatia (%) do investidor só para os cards de resumo pessoal
 * acima ("Sua Participação"/"Aportado"/"Lucro Esperado"/"A Receber").
 */
export function InvestorProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: investor, isLoading: isLoadingInvestor, isError: isErrorInvestor, refetch: refetchInvestor } = useMyInvestor();
  const { data: project, isLoading: isLoadingProject, isError: isErrorProject, refetch: refetchProject } = useProject(id);
  const { data: links, isLoading: isLoadingLinks, isError: isErrorLinks, refetch: refetchLinks } = useProjectInvestors();
  const {
    data: contributions,
    isLoading: isLoadingContributions,
    isError: isErrorContributions,
    refetch: refetchContributions,
  } = useInvestmentContributions();
  const { data: returns, isLoading: isLoadingReturns, isError: isErrorReturns, refetch: refetchReturns } = useInvestmentReturns();
  const {
    data: operationalResult,
    isLoading: isLoadingResult,
    isError: isErrorResult,
    refetch: refetchResult,
  } = useProjectOperationalResult(id);

  const isLoading =
    isLoadingInvestor ||
    (Boolean(investor) && (isLoadingProject || isLoadingLinks || isLoadingContributions || isLoadingReturns || isLoadingResult));
  const isError = isErrorInvestor || isErrorProject || isErrorLinks || isErrorContributions || isErrorReturns || isErrorResult;

  function refetchAll() {
    void refetchInvestor();
    void refetchProject();
    void refetchLinks();
    void refetchContributions();
    void refetchReturns();
    void refetchResult();
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={refetchAll} />;

  if (!investor) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-slate-600">Você ainda não possui um perfil de investidor vinculado.</p>
      </div>
    );
  }

  const link = (links ?? []).find((l) => l.project_id === id && !l.is_deleted);

  if (!project || !link) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Projeto não encontrado</p>
        <Link to={pageUrl('InvestorProjects')}>
          <Button variant="outline">Voltar</Button>
        </Link>
      </div>
    );
  }

  const projectContributions = (contributions ?? []).filter((c) => c.project_id === id && !c.is_deleted);
  const projectReturns = (returns ?? []).filter((r) => r.project_id === id && !r.is_deleted);

  const totalAportado = projectContributions.filter((c) => c.status === 'CONFIRMADO').reduce((sum, c) => sum + c.valor, 0);
  const totalRetornado = projectReturns.filter((r) => r.status === 'PAGO').reduce((sum, r) => sum + r.valor, 0);

  const projectResults = operationalResult ? projectResultsFromOperationalResult(operationalResult) : null;
  const investorShare = projectResults ? calculateInvestorShare(projectResults, link.percentual_participacao) : null;
  const roi = investorShare ? calculateROI(investorShare.netResult, totalAportado) : 0;
  const amountDue = investorShare ? calculateAmountDue(totalAportado, investorShare.netResult, totalRetornado) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to={pageUrl('InvestorProjects')}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader title={project.name} subtitle={project.code} className="mb-0" />
      </div>

      {/* Seu Investimento */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Sua Participação</p>
            <p className="text-2xl font-bold text-foreground">{link.percentual_participacao.toFixed(2)}%</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Aportado</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalAportado)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Lucro Esperado</p>
            <p className="text-2xl font-bold text-green-600">{investorShare ? formatCurrency(investorShare.netResult) : '—'}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">A Receber</p>
            <p className={`text-2xl font-bold ${amountDue >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {investorShare ? formatCurrency(amountDue) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ROI e Retornos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">ROI Esperado</p>
            <p className="text-2xl font-bold text-green-600">{investorShare ? `${roi.toFixed(2)}%` : '—'}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Total Retornado</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRetornado)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm text-muted-foreground">Status do Projeto</p>
            <Badge className="bg-slate-500 text-white">{project.status}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Resultado Operacional do projeto inteiro (somente leitura) */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Resultado Operacional do Projeto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!projectResults ? (
            <p className="text-sm text-muted-foreground">Resultado operacional indisponível para este projeto.</p>
          ) : (
            <>
              <div className="grid gap-3 rounded-lg bg-muted p-3 lg:grid-cols-4">
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Receita Total</p>
                  <p className="font-semibold text-foreground">{formatCurrency(projectResults.receivedRevenue)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Custos Totais</p>
                  <p className="font-semibold text-foreground">{formatCurrency(projectResults.totalCosts)}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Lucro Líquido</p>
                  <p className={`font-semibold ${projectResults.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(projectResults.netResult)}
                  </p>
                </div>
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Margem</p>
                  <p className="font-semibold text-foreground">{projectResults.margin.toFixed(2)}%</p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-muted-foreground">
                <p>Estes valores refletem a posição operacional completa do projeto. Seu lucro esperado é calculado sobre a sua participação (percentual acima).</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detalhes de custos (somente informativo) */}
      {projectResults && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Custo da Obra</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-1 text-sm text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(projectResults.totalConstructionCost)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Custos Indiretos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-1 text-sm text-muted-foreground">Valor Total</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(projectResults.totalIndirectCosts)}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
