import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Droplet,
  Home,
  Lightbulb,
  type LucideIcon,
  Settings,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { useMaintenanceRequests } from '@/features/maintenance/hooks';
import { MAINTENANCE_CATEGORY_OPTIONS } from '@/features/maintenance/types';
import type { MaintenancePriority, MaintenanceRequest } from '@/features/maintenance/types';
import { pageUrl } from '@/lib/page-url';

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

interface PriorityConfig {
  label: string;
  icon: LucideIcon;
  /** SLA em horas — 24h/168h(7d)/336h(14d) para alta/média/baixa, mesmos valores de `PRIORITY_CONFIG` do original. */
  slaHours: number;
}

/** Tradução de `PRIORITY_CONFIG` — ordem alta -> média -> baixa (mesma de `order` no original). */
const PRIORITY_CONFIG: Record<MaintenancePriority, PriorityConfig> = {
  alta: { label: 'Alta', icon: Zap, slaHours: 24 },
  media: { label: 'Média', icon: Clock, slaHours: 168 },
  baixa: { label: 'Baixa', icon: CheckCircle2, slaHours: 336 },
};

const PRIORITY_ORDER: MaintenancePriority[] = ['alta', 'media', 'baixa'];

/** Tradução de `CATEGORY_CONFIG` — mesmo ícone por categoria do original (`Estrutural`/`Acabamento` também compartilham `Home` no original). */
const CATEGORY_ICONS: Record<(typeof MAINTENANCE_CATEGORY_OPTIONS)[number], LucideIcon> = {
  Hidráulica: Droplet,
  Elétrica: Lightbulb,
  Estrutural: Home,
  Acabamento: Home,
  Outros: Settings,
};

/**
 * "Em aberto" para fins de agrupamento por prioridade/categoria — mesmo
 * critério (só levemente falho) do original: `byPriority`/`byCategory`
 * excluem apenas `RESOLVIDO`, não `CANCELADO` (chamados cancelados
 * continuam contados nesses dois blocos). Preservado de propósito, fiel ao
 * original; `overdueMaintenance`/`nearSLA` abaixo já excluem os dois
 * status terminais corretamente.
 */
function isOpenForGrouping(m: MaintenanceRequest): boolean {
  return m.status !== 'resolvido';
}

function calculateAverageResolutionTime(maintenances: MaintenanceRequest[]): number {
  const completed = maintenances.filter((m) => m.status === 'resolvido' && m.resolved_at);
  if (completed.length === 0) return 0;

  const totalDays = completed.reduce((sum, m) => {
    const start = new Date(m.opened_at).getTime();
    const end = new Date(m.resolved_at as string).getTime();
    return sum + Math.abs(Math.floor((end - start) / MS_PER_DAY));
  }, 0);

  return Math.round(totalDays / completed.length);
}

/**
 * Tradução de
 * `original-project/src/components/dashboard/MaintenanceDashboard.jsx` —
 * grid por prioridade (com SLA), alertas de SLA estourado/próximo (80% do
 * tempo), breakdown pelas 5 categorias sugeridas
 * (`MAINTENANCE_CATEGORY_OPTIONS`) e resumo de pendentes/em
 * andamento/tempo médio de resolução. Reaproveita `useMaintenanceRequests`
 * já existente.
 */
export function MaintenanceDashboard() {
  const { data: maintenances, isLoading, isError } = useMaintenanceRequests();

  const computed = useMemo(() => {
    if (!maintenances) return null;

    const byPriority = PRIORITY_ORDER.reduce(
      (acc, priority) => {
        acc[priority] = maintenances.filter((m) => isOpenForGrouping(m) && m.priority === priority);
        return acc;
      },
      {} as Record<MaintenancePriority, MaintenanceRequest[]>
    );

    const activeMaintenances = maintenances.filter((m) => m.status !== 'resolvido' && m.status !== 'cancelado');

    const overdueMaintenance = activeMaintenances.filter((m) => {
      const hoursSince = (Date.now() - new Date(m.opened_at).getTime()) / MS_PER_HOUR;
      return hoursSince > PRIORITY_CONFIG[m.priority].slaHours;
    });

    const nearSLA = activeMaintenances.filter((m) => {
      const hoursSince = (Date.now() - new Date(m.opened_at).getTime()) / MS_PER_HOUR;
      const sla = PRIORITY_CONFIG[m.priority].slaHours;
      return hoursSince > sla * 0.8 && hoursSince <= sla;
    });

    const byCategory = MAINTENANCE_CATEGORY_OPTIONS.reduce(
      (acc, category) => {
        acc[category] = maintenances.filter((m) => isOpenForGrouping(m) && m.category === category).length;
        return acc;
      },
      {} as Record<(typeof MAINTENANCE_CATEGORY_OPTIONS)[number], number>
    );

    const totalPending = maintenances.filter((m) => m.status === 'aberto').length;
    const totalInProgress = maintenances.filter((m) => m.status === 'agendado' || m.status === 'em_andamento').length;

    return {
      byPriority,
      overdueMaintenance,
      nearSLA,
      byCategory,
      totalPending,
      totalInProgress,
      averageResolutionTime: calculateAverageResolutionTime(maintenances),
    };
  }, [maintenances]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand dark:text-brand-dark" />
            Manutenções
          </CardTitle>
          <Link to={pageUrl('AdminMaintenance')}>
            <Button variant="outline" size="sm">
              Ver Todas
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && <LoadingInline />}
        {!isLoading && (isError || !computed) && <ErrorState />}
        {!isLoading && !isError && computed && (
          <>
            {(computed.overdueMaintenance.length > 0 || computed.nearSLA.length > 0) && (
              <div className="mb-6 space-y-2">
                {computed.overdueMaintenance.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        {computed.overdueMaintenance.length} manutenção(ões) fora do SLA
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">Priorize imediatamente</p>
                    </div>
                    <Link to={pageUrl('AdminMaintenance')}>
                      <Button size="sm" variant="outline">
                        Ver
                      </Button>
                    </Link>
                  </div>
                )}

                {computed.nearSLA.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                        {computed.nearSLA.length} manutenção(ões) próximas do SLA
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300">Menos de 20% do tempo restante</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {PRIORITY_ORDER.map((priority) => {
                const config = PRIORITY_CONFIG[priority];
                const count = computed.byPriority[priority].length;
                const Icon = config.icon;

                return (
                  <Link
                    key={priority}
                    to={pageUrl('AdminMaintenance')}
                    className={`rounded-lg border p-4 transition-all hover:shadow-md ${
                      priority === 'alta' && count > 0
                        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
                        : 'border-border'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon
                        className={`h-4 w-4 ${
                          priority === 'alta'
                            ? 'text-red-600 dark:text-red-400'
                            : priority === 'media'
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-blue-600 dark:text-blue-400'
                        }`}
                      />
                      <Badge variant={priority === 'alta' && count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
                    </div>
                    <p className="mb-1 text-sm font-medium text-foreground">{config.label}</p>
                    <p className="text-xs text-muted-foreground">
                      SLA: {config.slaHours < 24 ? `${config.slaHours}h` : `${Math.round(config.slaHours / 24)}d`}
                    </p>
                  </Link>
                );
              })}
            </div>

            <div className="mb-6">
              <h4 className="mb-3 text-sm font-semibold text-foreground">Por Categoria</h4>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {MAINTENANCE_CATEGORY_OPTIONS.map((category) => {
                  const count = computed.byCategory[category];
                  const Icon = CATEGORY_ICONS[category];

                  return (
                    <Link
                      key={category}
                      to={pageUrl('AdminMaintenance')}
                      className="rounded-lg border p-3 text-center transition hover:bg-accent"
                    >
                      <Icon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                      <p className="text-2xl font-bold text-foreground">{count}</p>
                      <p className="text-xs text-muted-foreground">{category}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold text-foreground">{computed.totalPending}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{computed.totalInProgress}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Tempo Médio Resolução</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{computed.averageResolutionTime}d</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
