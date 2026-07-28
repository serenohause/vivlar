import { Briefcase, DollarSign, TrendingUp, type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { useDeals } from '@/features/deals/hooks';
import { useAllPaymentInstallments } from '@/features/finance/hooks';
import { computeRecebidoNoMes } from '@/features/finance/utils';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    value
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
}

/** Tradução de `original-project/src/components/dashboard/KPICard.jsx` — sem `trend` (precisaria de comparação com período anterior, que não temos ainda). */
function KpiCard({ title, value, subtitle, icon: Icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-lg bg-brand/10 p-3">
            <Icon className="h-6 w-6 text-brand dark:text-brand-dark" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Tradução completa da linha de 4 `KPICard` de `original-project/src/pages/Dashboard.jsx`
 * (linhas 186-230): Receita do Mês, Deals Ativos, Taxa de Conversão, Ticket
 * Médio — todos com dado real agora que `deals` (módulo 4) e
 * `payment_installments` (módulo 5) existem. Taxa de Conversão movida para
 * cá (era um card solto em `CatalogStats`, junto de Projetos/Unidades/
 * Clientes — posição errada; no original ela é o 3º KPI desta fileira, não
 * um card de catálogo). Mesma fórmula de antes: vendido / (vendido + em
 * aberto), adaptada ao enum `deal_sales_stage` unificado deste projeto (ver
 * `docs/SCHEMA_PLAN.md` seção 2.2).
 */
export function ExecutiveKpis() {
  const { data: deals, isLoading: loadingDeals } = useDeals();
  const { data: installments, isLoading: loadingInstallments } = useAllPaymentInstallments();

  const isLoading = loadingDeals || loadingInstallments;

  const activeDeals = deals?.filter((d) => !['vendido', 'perdido', 'distratado'].includes(d.sales_stage)) ?? [];
  const soldDeals = deals?.filter((d) => d.sales_stage === 'vendido') ?? [];
  const avgTicket =
    soldDeals.length > 0
      ? soldDeals.reduce((sum, d) => sum + (d.final_sale_value ?? d.expected_sale_value ?? 0), 0) / soldDeals.length
      : 0;
  const monthlyRevenue = computeRecebidoNoMes(installments ?? []);

  const won = soldDeals.length;
  const open = activeDeals.length;
  const conversionRate = won + open > 0 ? Math.round((won / (won + open)) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Receita do Mês"
        value={isLoading ? '—' : formatCurrency(monthlyRevenue)}
        subtitle={`${installments?.filter((i) => i.status === 'pago').length ?? 0} parcelas pagas`}
        icon={DollarSign}
      />
      <KpiCard
        title="Deals Ativos"
        value={isLoading ? '—' : String(activeDeals.length)}
        subtitle={`${soldDeals.length} vendidos`}
        icon={Briefcase}
      />
      <KpiCard
        title="Taxa de Conversão"
        value={isLoading ? '—' : `${conversionRate}%`}
        subtitle="Vendido / (vendido + em aberto)"
        icon={TrendingUp}
      />
      <KpiCard
        title="Ticket Médio"
        value={isLoading ? '—' : formatCurrency(avgTicket)}
        subtitle="Negócios vendidos"
        icon={DollarSign}
      />
    </div>
  );
}
