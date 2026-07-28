import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  type LucideIcon,
  Plus,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Progress } from '@/components/ui/progress';
import { useInspections } from '@/features/inspections/hooks';
import type { Inspection, InspectionStatus } from '@/features/inspections/types';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  iconColorClass: string;
  critical?: boolean;
}

/** Tradução de `INSPECTION_STATUS_CONFIG` — mesma ordem/labels do original, chaves adaptadas ao enum `inspection_status` (minúsculo) deste projeto. */
const INSPECTION_STATUS_CONFIG: Record<InspectionStatus, StatusConfig> = {
  rascunho: { label: 'Rascunhos', icon: Calendar, iconColorClass: 'text-slate-600 dark:text-slate-400' },
  em_vistoria: { label: 'Em Vistoria', icon: Clock, iconColorClass: 'text-yellow-600 dark:text-yellow-400' },
  enviado_ao_cliente: { label: 'Enviado ao Cliente', icon: Clock, iconColorClass: 'text-blue-600 dark:text-blue-400' },
  aprovado: { label: 'Aprovados', icon: CheckCircle2, iconColorClass: 'text-green-600 dark:text-green-400' },
  reprovado: { label: 'Reprovados', icon: XCircle, iconColorClass: 'text-red-600 dark:text-red-400', critical: true },
  reinspecao: { label: 'Reinspeção', icon: AlertTriangle, iconColorClass: 'text-orange-600 dark:text-orange-400', critical: true },
  concluido: { label: 'Concluídos', icon: CheckCircle2, iconColorClass: 'text-green-600 dark:text-green-400' },
};

const STATUS_ORDER: InspectionStatus[] = [
  'rascunho',
  'em_vistoria',
  'enviado_ao_cliente',
  'aprovado',
  'reprovado',
  'reinspecao',
  'concluido',
];

/** Tradução de `calculateAverageTime` — dias entre criação e a data de vistoria, só das concluídas (`aprovado`/`concluido`) com `inspection_date` preenchida. */
function calculateAverageTime(inspections: Inspection[]): number {
  const completed = inspections.filter(
    (i) => (i.status === 'aprovado' || i.status === 'concluido') && i.inspection_date
  );
  if (completed.length === 0) return 0;

  const totalDays = completed.reduce((sum, i) => {
    const start = new Date(i.created_at).getTime();
    const end = new Date(i.inspection_date as string).getTime();
    return sum + Math.abs(Math.floor((end - start) / MS_PER_DAY));
  }, 0);

  return Math.round(totalDays / completed.length);
}

/** Tradução de `getUpcomingInspections` — vistorias com `inspection_date` entre hoje e os próximos 7 dias. */
function getUpcomingInspections(inspections: Inspection[]): Inspection[] {
  const today = Date.now();
  const nextWeek = today + 7 * MS_PER_DAY;

  return inspections.filter((i) => {
    if (!i.inspection_date) return false;
    const date = new Date(i.inspection_date).getTime();
    return date >= today && date <= nextWeek;
  });
}

/**
 * Tradução de
 * `original-project/src/components/dashboard/InspectionsDashboard.jsx` —
 * grid de contagem pelos 7 status de `inspection_status`, alertas
 * (críticas/atrasadas/unidades aguardando vistoria), taxa de aprovação,
 * tempo médio, próximas 7 dias e as últimas 3 vistorias. Reaproveita
 * `useInspections`/`useUnits` já existentes.
 */
export function InspectionsDashboard() {
  const { data: inspections, isLoading: loadingInspections, isError: errorInspections } = useInspections();
  const { data: units, isLoading: loadingUnits, isError: errorUnits } = useUnits();

  const isLoading = loadingInspections || loadingUnits;
  const isError = errorInspections || errorUnits;

  const computed = useMemo(() => {
    if (!inspections || !units) return null;

    const unitsPendingInspection = units.filter(
      (u) =>
        u.admin_status === 'entrega_casa' &&
        !inspections.some((i) => i.unit_id === u.id && (i.status === 'aprovado' || i.status === 'concluido'))
    );

    const byStatus = STATUS_ORDER.reduce(
      (acc, status) => {
        acc[status] = inspections.filter((i) => i.status === status);
        return acc;
      },
      {} as Record<InspectionStatus, Inspection[]>
    );

    const criticalInspections = inspections.filter((i) => i.status === 'reprovado' || i.status === 'reinspecao');

    const overdueInspections = byStatus.em_vistoria.filter((i) => {
      const referenceDate = new Date(i.inspection_date ?? i.created_at).getTime();
      return (Date.now() - referenceDate) / MS_PER_DAY > 7;
    });

    const totalCompleted = byStatus.aprovado.length + byStatus.reprovado.length + byStatus.concluido.length;
    const approvalRate = totalCompleted > 0 ? ((byStatus.aprovado.length + byStatus.concluido.length) / totalCompleted) * 100 : 0;

    const lastInspections = [...inspections]
      .sort((a, b) => new Date(b.inspection_date ?? b.created_at).getTime() - new Date(a.inspection_date ?? a.created_at).getTime())
      .slice(0, 3);

    return {
      unitsPendingInspection,
      byStatus,
      criticalInspections,
      overdueInspections,
      totalCompleted,
      approvalRate,
      averageTime: calculateAverageTime(inspections),
      upcoming: getUpcomingInspections(inspections.filter((i) => i.inspection_date)),
      lastInspections,
    };
  }, [inspections, units]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand dark:text-brand-dark" />
            Vistorias
          </CardTitle>
          <div className="flex items-center gap-2">
            <Link to={pageUrl('CreateInspection')}>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Nova Vistoria
              </Button>
            </Link>
            <Link to={pageUrl('Inspections')}>
              <Button variant="outline" size="sm">
                Ver Todas
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && <LoadingInline />}
        {!isLoading && (isError || !computed) && <ErrorState />}
        {!isLoading && !isError && computed && (
          <>
            {(computed.criticalInspections.length > 0 ||
              computed.overdueInspections.length > 0 ||
              computed.unitsPendingInspection.length > 0) && (
              <div className="mb-6 space-y-2">
                {computed.criticalInspections.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        {computed.criticalInspections.length} vistoria(s) com problemas críticos
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">Requer ação imediata</p>
                    </div>
                    <Link to={pageUrl('Inspections')}>
                      <Button size="sm" variant="outline">
                        Resolver
                      </Button>
                    </Link>
                  </div>
                )}

                {computed.overdueInspections.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                        {computed.overdueInspections.length} vistoria(s) em andamento há mais de 7 dias
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300">Requer atenção</p>
                    </div>
                  </div>
                )}

                {computed.unitsPendingInspection.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                    <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                        {computed.unitsPendingInspection.length} unidade(s) pronta(s) aguardando vistoria
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">Em Entrega da Casa</p>
                    </div>
                    <Link to={pageUrl('CreateInspection')}>
                      <Button size="sm">Agendar</Button>
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              {STATUS_ORDER.map((status) => {
                const config = INSPECTION_STATUS_CONFIG[status];
                const count = computed.byStatus[status].length;
                const Icon = config.icon;

                return (
                  <Link
                    key={status}
                    to={pageUrl('Inspections')}
                    className={`rounded-lg border p-4 transition-all hover:shadow-md ${
                      config.critical && count > 0
                        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
                        : 'border-border'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${config.iconColorClass}`} />
                      <Badge variant={config.critical && count > 0 ? 'destructive' : 'secondary'}>{count}</Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground">{config.label}</p>
                  </Link>
                );
              })}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Taxa de Aprovação</span>
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {computed.approvalRate.toFixed(1)}%
                  </span>
                </div>
                <Progress value={computed.approvalRate} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {computed.byStatus.aprovado.length + computed.byStatus.concluido.length} de {computed.totalCompleted}{' '}
                  vistorias
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tempo Médio</span>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{computed.averageTime} dias</span>
                </div>
                <p className="text-xs text-muted-foreground">Da abertura até a aprovação</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Próximas 7 dias</span>
                  <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{computed.upcoming.length}</span>
                </div>
                <p className="text-xs text-muted-foreground">Vistorias agendadas</p>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="mb-3 text-sm font-semibold text-foreground">Últimas Vistorias</h4>
              {computed.lastInspections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma vistoria registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {computed.lastInspections.map((inspection) => {
                    const config = INSPECTION_STATUS_CONFIG[inspection.status];
                    const Icon = config.icon;
                    const unit = units?.find((u) => u.id === inspection.unit_id);

                    return (
                      <Link
                        key={inspection.id}
                        to={`${pageUrl('Inspections')}/${inspection.id}`}
                        className="flex items-center justify-between rounded-lg border p-3 transition hover:bg-accent"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`h-5 w-5 ${config.iconColorClass}`} />
                          <div>
                            <p className="text-sm font-medium text-foreground">Unidade {unit?.sku ?? inspection.unit_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(inspection.inspection_date ?? inspection.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        <Badge variant={config.critical ? 'destructive' : 'secondary'}>{config.label}</Badge>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
