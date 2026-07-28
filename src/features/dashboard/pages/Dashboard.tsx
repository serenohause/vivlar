import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { CatalogStats } from '@/features/dashboard/components/CatalogStats';
import { CriticalAlerts } from '@/features/dashboard/components/CriticalAlerts';
import { ExecutiveKpis } from '@/features/dashboard/components/ExecutiveKpis';
import { InspectionsDashboard } from '@/features/dashboard/components/InspectionsDashboard';
import { MaintenanceDashboard } from '@/features/dashboard/components/MaintenanceDashboard';
import { QuickActions } from '@/features/dashboard/components/QuickActions';
import { RevenueChart } from '@/features/dashboard/components/RevenueChart';
import { SalesFunnel } from '@/features/dashboard/components/SalesFunnel';
import { TeamPerformance } from '@/features/dashboard/components/TeamPerformance';
import { UnitFlowDashboard } from '@/features/dashboard/components/UnitFlowDashboard';
import { pageUrl } from '@/lib/page-url';

/**
 * Dashboard Executivo — construído incrementalmente.
 *
 * Histórico: esta página nasceu com só 3 blocos (`ExecutiveKpis`/
 * `CatalogStats`/`SalesFunnel`), porque os módulos de dado dos demais
 * blocos do original (CRM, Financeiro, Comissões, Vistorias, Manutenção)
 * ainda não existiam. Com todos eles construídos, os blocos operacionais/
 * de equipe que faltavam foram adicionados nesta leva: `CriticalAlerts`,
 * `QuickActions`, `TeamPerformance` e a seção "Operacional e Pós-Venda"
 * (`UnitFlowDashboard`/`InspectionsDashboard`/`MaintenanceDashboard`) —
 * mesma ordem de `original-project/src/pages/Dashboard.jsx`.
 *
 * Único bloco do original deliberadamente de fora (não é débito técnico, é
 * decisão registrada): `SalesFunnelChart`/`DashboardCharts` (já coberto pelo
 * nosso `SalesFunnel.tsx`, que soma valor real de negócios em vez do
 * placeholder `count * 300000` do original — ver comentário lá).
 * `RevenueChart`/gráfico de receita mensal também não tinha dado real por
 * trás no original (`Math.random()`) e por isso ficou de fora por um
 * tempo — foi portado depois com dado real de `payment_installments` (ver
 * `components/RevenueChart.tsx`), sem a série "projetado" (também
 * `Math.random()` no original, sem lógica real equivalente pra portar).
 */
export function Dashboard() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Dashboard Executivo</h1>
          <p className="mt-1 text-muted-foreground">Visão estratégica do negócio</p>
        </div>
      </div>

      {/* Alertas críticos — parcelas atrasadas, negócios sem atividade, documentos pendentes. Some por completo quando não há nenhum. */}
      <CriticalAlerts />

      {/* KPIs executivos (Receita do Mês, Deals Ativos, Taxa de Conversão, Ticket Médio) — mesma linha de 4 KPICard do Dashboard.jsx original */}
      <ExecutiveKpis />

      {/* Catálogo (Projetos/Unidades) + CRM (Clientes) — complemento fiel a DashboardStats.jsx (dead code no original, revivido aqui com dado real) */}
      <CatalogStats />

      {/* Ações rápidas — 4 atalhos estáticos para os fluxos mais comuns do dia a dia */}
      <QuickActions />

      {/* Financeiro — mesmo botão "Financeiro Detalhado" de `Dashboard.jsx`, agora que `FinanceDashboardPage` existe */}
      <div className="flex justify-end">
        <Link to={pageUrl('FinanceDashboard')}>
          <Button variant="outline">Financeiro Detalhado</Button>
        </Link>
      </div>

      {/* Receita mensal (dado real de payment_installments) + funil de vendas — mesma linha de gráficos de Dashboard.jsx original */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueChart />
        <SalesFunnel />
      </div>

      {/* Performance da equipe de corretores — só aparece se houver corretor com pelo menos 1 negócio */}
      <TeamPerformance />

      {/* Operacional e Pós-Venda — fluxo MCMV, vistorias e manutenções */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Operacional e Pós-Venda</h2>
        <UnitFlowDashboard />
        <InspectionsDashboard />
        <MaintenanceDashboard />
      </div>
    </div>
  );
}
