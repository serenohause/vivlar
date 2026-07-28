import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatCurrency, RETURN_STATUS_CONFIG, RETURN_TYPE_CONFIG } from '@/features/investors/constants';
import { useInvestmentReturn, useInvestor } from '@/features/investors/hooks';
import { useProject } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestmentReturnDetail.jsx` —
 * mesmo ACHADO documentado em `InvestmentContributionDetailPage.tsx`: o
 * comentário antigo de `AppRoutes.tsx` dizia que esta página "não tinha
 * conexão real" no original, o que era falso (`InvestmentReturnsListPage`
 * já linkava para ela). Badge de tipo de retorno reaproveita
 * `RETURN_TYPE_CONFIG` (já existente em `constants.ts`, mesma cor/label do
 * `returnTypeConfig` do original), inclusive a descrição curta abaixo do
 * badge. Igual ao original: exibição pura, comprovante só é exibido se já
 * preenchido, sem upload nesta tela.
 */
export function InvestmentReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: investmentReturn, isLoading, isError, refetch } = useInvestmentReturn(id);
  const { data: investor } = useInvestor(investmentReturn?.investor_id ?? undefined);
  const { data: project } = useProject(investmentReturn?.project_id);

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!investmentReturn) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Retorno não encontrado</p>
        <Button onClick={() => navigate(pageUrl('InvestmentReturns'))}>Voltar</Button>
      </div>
    );
  }

  const typeConfig = RETURN_TYPE_CONFIG[investmentReturn.return_type];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Retorno de ${formatCurrency(investmentReturn.valor)}`}
        subtitle={new Date(investmentReturn.data).toLocaleDateString('pt-BR')}
        backTo="InvestmentReturns"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes do Retorno</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(investmentReturn.valor)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="text-lg font-medium text-foreground">{new Date(investmentReturn.data).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Tipo de Retorno</p>
                <Badge className={`${typeConfig.color} text-white`}>{typeConfig.label}</Badge>
                {typeConfig.description && <p className="mt-1 text-xs text-muted-foreground">{typeConfig.description}</p>}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={`${RETURN_STATUS_CONFIG[investmentReturn.status].color} text-white`}>
                  {RETURN_STATUS_CONFIG[investmentReturn.status].label}
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
            {investmentReturn.observacoes && (
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-sm text-muted-foreground">Observações</p>
                <p className="text-foreground">{investmentReturn.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Comprovante</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum comprovante anexado</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
