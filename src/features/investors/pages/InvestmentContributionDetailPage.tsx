import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { CONTRIBUTION_STATUS_CONFIG, CONTRIBUTION_TYPE_LABELS, formatCurrency } from '@/features/investors/constants';
import { useInvestmentContribution, useInvestor } from '@/features/investors/hooks';
import { useProject } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestmentContributionDetail.jsx`
 * — ACHADO: essa página havia sido classificada por engano (no comentário
 * antigo de `AppRoutes.tsx`) como "não conectada" no original; na verdade
 * `InvestmentContributionsListPage` já linkava para ela (ícone `Eye`), só
 * faltava a tela em si. Igual ao original: exibição pura (sem
 * criar/editar/excluir aqui), e o card "Comprovante" nunca tem um jeito de
 * anexar arquivo por esta tela — só mostra o que já veio preenchido em
 * `comprovante_url`/`comprovante_nome` via `ContributionForm` (dialog de
 * criar/editar da lista).
 */
export function InvestmentContributionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: contribution, isLoading, isError, refetch } = useInvestmentContribution(id);
  const { data: investor } = useInvestor(contribution?.investor_id ?? undefined);
  const { data: project } = useProject(contribution?.project_id);

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!contribution) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Aporte não encontrado</p>
        <Button onClick={() => navigate(pageUrl('InvestmentContributions'))}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Aporte de ${formatCurrency(contribution.valor)}`}
        subtitle={new Date(contribution.data).toLocaleDateString('pt-BR')}
        backTo="InvestmentContributions"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes do Aporte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(contribution.valor)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="text-lg font-medium text-foreground">{new Date(contribution.data).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <Badge variant="outline">{CONTRIBUTION_TYPE_LABELS[contribution.tipo]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={`${CONTRIBUTION_STATUS_CONFIG[contribution.status].color} text-white`}>
                  {CONTRIBUTION_STATUS_CONFIG[contribution.status].label}
                </Badge>
              </div>
            </div>
            {investor && (
              <div>
                <p className="text-sm text-muted-foreground">Investidor</p>
                <p className="font-medium text-foreground">{investor.nome}</p>
              </div>
            )}
            {project && (
              <div>
                <p className="text-sm text-muted-foreground">Projeto</p>
                <p className="font-medium text-foreground">{project.name}</p>
              </div>
            )}
            {contribution.observacoes && (
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-sm text-muted-foreground">Observações</p>
                <p className="text-foreground">{contribution.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Comprovante</CardTitle>
          </CardHeader>
          <CardContent>
            {contribution.comprovante_url ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border bg-muted p-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium text-foreground">{contribution.comprovante_nome}</p>
                    <p className="text-xs text-muted-foreground">PDF / Imagem</p>
                  </div>
                </div>
                <a href={contribution.comprovante_url} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full" variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar
                  </Button>
                </a>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum comprovante anexado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
