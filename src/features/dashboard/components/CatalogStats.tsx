import { Building2, Home, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClients } from '@/features/clients/hooks';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Bloco de KPIs de Catálogo/CRM — tradução de
 * `original-project/src/components/dashboard/DashboardStats.jsx` ("Projetos
 * Ativos"/"Unidades" chegaram com o módulo de Catálogo; "Clientes"
 * completado agora que `clients` existe). "Taxa Conversão" morava aqui
 * antes, mas saiu: no original ela é o 3º `KPICard` da fileira principal do
 * topo (`Dashboard.jsx`, junto de Receita do Mês/Deals Ativos/Ticket
 * Médio), não um card de catálogo — o cálculo (vendido / (vendido + em
 * aberto)) foi movido para `ExecutiveKpis.tsx`. Reaproveita hooks já
 * existentes, sem duplicar query.
 */
export function CatalogStats() {
  const { data: projects, isLoading: loadingProjects } = useProjects();
  const { data: units, isLoading: loadingUnits } = useUnits();
  const { data: clients, isLoading: loadingClients } = useClients();

  const isLoading = loadingProjects || loadingUnits || loadingClients;
  const projectsActive = projects?.filter((p) => p.status !== 'entregue').length ?? 0;
  const totalUnits = units?.length ?? 0;
  const unitsAvailable = units?.filter((u) => u.status === 'disponivel').length ?? 0;
  const totalClients = clients?.length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
    </div>
  );
}
