import { Building2, Home } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Bloco de KPIs do catálogo (Projetos/Unidades) no Dashboard — tradução
 * parcial de `original-project/src/components/dashboard/DashboardStats.jsx`
 * (só os 2 primeiros cards, "Projetos Ativos" e "Unidades"; os outros dois
 * do original, "Clientes" e "Taxa Conversão", dependem de `clients`/`deals`,
 * que ainda não existem — entram junto com o módulo de CRM). Reaproveita
 * `useProjects`/`useUnits` já existentes, sem duplicar query.
 */
export function CatalogStats() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: units, isLoading: loadingUnits } = useUnits();

  const isLoading = loadingProjects || loadingUnits;
  const projectsActive = projects?.filter((p) => p.status !== 'entregue').length ?? 0;
  const totalUnits = units?.length ?? 0;
  const unitsAvailable = units?.filter((u) => u.status === 'disponivel').length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
    </div>
  );
}
