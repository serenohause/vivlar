import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, DollarSign, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatCurrency } from '@/features/finance/constants';
import { useAllPaymentInstallments } from '@/features/finance/hooks';
import {
  MonthlyDefaultRateChart,
  MonthlyRevenueChart,
  PaymentMixChart,
  RevenueByProjectChart,
} from '@/features/finance/components/FinanceDashboardCharts';
import {
  calculateMonthlyDefault,
  calculateMonthlyRevenue,
  calculatePaymentMix,
  calculateRevenueByProject,
  computeAccountTotals,
  filterInstallmentsByPeriod,
  type FinancePeriodFilter,
} from '@/features/finance/utils';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Tradução de `original-project/src/pages/FinanceDashboard.jsx` — análises e
 * tendências financeiras (complementar a `FinanceListPage`, que é a lista
 * operacional "Contas a Receber"). Diferente do original (só os 4
 * gráficos), esta versão abre com os mesmos 4 KPIs de topo de
 * `FinanceListPage` — pedido explícito desta leva — recalculados sobre o
 * período selecionado (o original também aplica `filterByPeriod` antes de
 * qualquer gráfico, então manter os KPIs presos ao mesmo filtro é
 * consistente com o resto da tela).
 */
export function FinanceDashboardPage() {
  const { data: installments, isLoading, isError, refetch } = useAllPaymentInstallments();
  const { data: units } = useUnits();
  const { data: projects } = useProjects();

  const [period, setPeriod] = useState<FinancePeriodFilter>('12m');

  // Parcelas canceladas ficam de fora de todo cálculo, mesmo padrão de
  // `Finance.jsx`/`FinanceListPage` (`i.status !== "CANCELADO"`), fiel a
  // `FinanceDashboard.jsx` (`installments = allInstallments.filter(i =>
  // !i.is_deleted)`, sem excluir cancelado explicitamente ali — mas as
  // funções de cálculo do original nunca contam parcela cancelada como
  // receita, então o resultado final é o mesmo).
  const validInstallments = useMemo(() => (installments ?? []).filter((i) => i.status !== 'cancelado'), [installments]);
  const filteredInstallments = useMemo(() => filterInstallmentsByPeriod(validInstallments, period), [validInstallments, period]);

  const totals = useMemo(() => computeAccountTotals(filteredInstallments), [filteredInstallments]);
  const receitaPorMes = useMemo(() => calculateMonthlyRevenue(filteredInstallments), [filteredInstallments]);
  const receitaPorProjeto = useMemo(
    () => calculateRevenueByProject(filteredInstallments, units ?? [], projects ?? []),
    [filteredInstallments, units, projects]
  );
  const formasPagamento = useMemo(() => calculatePaymentMix(filteredInstallments), [filteredInstallments]);
  const inadimplenciaPorMes = useMemo(() => calculateMonthlyDefault(filteredInstallments), [filteredInstallments]);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard Financeiro" subtitle="Análises e tendências financeiras" backTo="Finance" />

      <div className="flex justify-end">
        <Select value={period} onValueChange={(value) => setPeriod(value as FinancePeriodFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="6m">Últimos 6 meses</SelectItem>
            <SelectItem value="12m">Últimos 12 meses</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs — mesmos 4 de `FinanceListPage`, recalculados sobre o período selecionado acima */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Total Previsto</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.totalPrevisto)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Recebido</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.totalPago)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Pendente</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.totalEmAberto)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Em Atraso</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.totalAtrasado)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Receita Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyRevenueChart data={receitaPorMes} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Receita por Projeto</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueByProjectChart data={receitaPorProjeto} />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Formas de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentMixChart data={formasPagamento} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Taxa de Inadimplência (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyDefaultRateChart data={inadimplenciaPorMes} />
        </CardContent>
      </Card>
    </div>
  );
}
