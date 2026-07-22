import { Building2, Home, TrendingUp, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClients } from '@/features/clients/hooks';
import { useDeals } from '@/features/deals/hooks';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Bloco de KPIs — tradução completa de
 * `original-project/src/components/dashboard/DashboardStats.jsx` (os 4
 * cards: "Projetos Ativos"/"Unidades" chegaram com o módulo de Catálogo;
 * "Clientes"/"Taxa Conversão" completados agora que `clients`/`deals`
 * existem). Taxa de conversão adaptada ao enum `deal_sales_stage`
 * unificado deste projeto (não existe mais `opportunity_status` separado,
 * ver `docs/SCHEMA_PLAN.md` seção 2.2): vendido / (vendido + em aberto).
 * Reaproveita hooks já existentes, sem duplicar query.
 */
export function CatalogStats() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: units, isLoading: loadingUnits } = useUnits();
  const { data: clients, isLoading: loadingClients } = useClients();
  const { data: deals, isLoading: loadingDeals } = useDeals();

  const isLoading = loadingProjects || loadingUnits || loadingClients || loadingDeals;
  const projectsActive = projects?.filter((p) => p.status !== 'entregue').length ?? 0;
  const totalUnits = units?.length ?? 0;
  const unitsAvailable = units?.filter((u) => u.status === 'disponivel').length ?? 0;
  const totalClients = clients?.length ?? 0;

  const won = deals?.filter((d) => d.sales_stage === 'vendido').length ?? 0;
  const open = deals?.filter((d) => !['vendido', 'perdido', 'distratado'].includes(d.sales_stage)).length ?? 0;
  const conversionRate = won + open > 0 ? Math.round((won / (won + open)) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Projetos Ativos</CardTitle>
          <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : projectsActive}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Unidades</CardTitle>
          <div className="rounded-lg bg-green-100 p-2 dark:bg-green-950">
            <Home className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : totalUnits}</div>
          {!isLoading && <p className="mt-1 text-xs text-muted-foreground">{unitsAvailable} disponíveis</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Clientes</CardTitle>
          <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-950">
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : totalClients}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Conversão</CardTitle>
          <div className="rounded-lg bg-orange-100 p-2 dark:bg-orange-950">
            <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{isLoading ? '—' : `${conversionRate}%`}</div>
        </CardContent>
      </Card>
    </div>
  );
}
