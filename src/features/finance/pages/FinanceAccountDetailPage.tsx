import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { useClient } from '@/features/clients/hooks';
import { FinanceTimeline } from '@/features/finance/components/FinanceTimeline';
import { ParcelasTable } from '@/features/finance/components/ParcelasTable';
import { formatCurrency } from '@/features/finance/constants';
import { useFinanceAccount, useFinanceEvents, usePaymentInstallments } from '@/features/finance/hooks';
import { computeAccountTotals } from '@/features/finance/utils';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/FinanceDetail.jsx` — sem a aba
 * "Financiamento" (`FinancingProcess`, schema incerto no original, adiado —
 * ver comentário em `0019_finance_accounts.sql`). Parcelas e Timeline
 * seguem fielmente o original.
 */
export function FinanceAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: account, isLoading, isError, refetch } = useFinanceAccount(id);
  const { data: unit } = useUnit(account?.unit_id);
  const { data: client } = useClient(account?.client_id);
  const { data: installments } = usePaymentInstallments(id);
  const { data: events } = useFinanceEvents(id);

  const allInstallments = installments ?? [];
  const totals = useMemo(() => computeAccountTotals(allInstallments), [allInstallments]);

  const proxVencimento = useMemo(
    () =>
      [...allInstallments]
        .filter((i) => i.status !== 'pago' && i.status !== 'cancelado')
        .sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime())[0],
    [allInstallments]
  );

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Carteira financeira não encontrada</p>
        <Button onClick={() => navigate(pageUrl('Finance'))}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Financeiro - ${unit?.sku ?? 'Unidade'}`} subtitle={client?.name ?? 'Cliente'} backTo="Finance" />

      {/* Resumo */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Resumo Financeiro</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Valor da Venda</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(account.valor_venda_total)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Total Pago</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totals.totalPago)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Saldo em Aberto</p>
              <p className="text-xl font-bold text-orange-600">{formatCurrency(totals.totalEmAberto)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">% Quitado</p>
              <p className="text-xl font-bold text-blue-600">{totals.percentualQuitado.toFixed(1)}%</p>
            </div>
          </div>
          {proxVencimento && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                <strong>Próximo Vencimento:</strong> {new Date(proxVencimento.vencimento).toLocaleDateString('pt-BR')} —{' '}
                {formatCurrency(proxVencimento.valor_previsto)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="parcelas" className="space-y-6">
        <TabsList>
          <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="parcelas">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Parcelas</CardTitle>
            </CardHeader>
            <CardContent>
              <ParcelasTable
                financeAccountId={account.id}
                unitId={account.unit_id}
                clientId={account.client_id}
                installments={allInstallments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Timeline de Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <FinanceTimeline events={events ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
