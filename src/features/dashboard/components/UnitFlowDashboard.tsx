import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BarChart3, Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import type { StatusTransition } from '@/features/deals/types';
import { useUnitStatusTransitions, useUnits } from '@/features/units/hooks';
import type { Unit, UnitAdminStatus } from '@/features/units/types';
import { pageUrl } from '@/lib/page-url';

type LiveAdminStatus = Exclude<UnitAdminStatus, 'distrato'>;

interface StageConfig {
  label: string;
  color: string;
  avgDays: number;
  icon: string;
}

/**
 * As 9 etapas "vivas" do pipeline administrativo MCMV (`unit_admin_status`,
 * ver `supabase/migrations/0008_units.sql`), mesma ordem/dias-esperados de
 * `STAGE_CONFIG` em
 * `original-project/src/components/dashboard/UnitFlowDashboard.jsx` —
 * `distrato` fica de fora (é saída do funil, não uma etapa de progresso).
 */
const STAGE_CONFIG: Record<LiveAdminStatus, StageConfig> = {
  laudo_engenharia: { label: 'Laudo Engenharia', color: '#64748b', avgDays: 7, icon: '📋' },
  em_conformidade: { label: 'Em Conformidade', color: '#3b82f6', avgDays: 3, icon: '✅' },
  cliente_conforme: { label: 'Cliente Conforme', color: '#8b5cf6', avgDays: 14, icon: '👤' },
  contrato_caixa: { label: 'Contrato Caixa', color: '#ec4899', avgDays: 30, icon: '🏦' },
  cartorio: { label: 'Cartório', color: '#f97316', avgDays: 15, icon: '📝' },
  registro_pago: { label: 'Registro Pago', color: '#eab308', avgDays: 7, icon: '💰' },
  registrado: { label: 'Registrado', color: '#84cc16', avgDays: 10, icon: '📜' },
  entrega_casa: { label: 'Entrega Casa', color: '#22c55e', avgDays: 7, icon: '🏠' },
  entregue: { label: 'Entregue', color: '#10b981', avgDays: 0, icon: '🎉' },
};

const ADMIN_STATUS_ORDER = Object.keys(STAGE_CONFIG) as LiveAdminStatus[];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Tradução de `calculateDaysInStage` — dias entre a transição que fez a unidade entrar na etapa e a próxima transição dela (ou "agora", se ainda estiver nesta etapa). */
function calculateDaysInStage(unitId: string, stageTransition: StatusTransition, allTransitions: StatusTransition[]): number {
  const enterDate = new Date(stageTransition.created_at).getTime();
  const unitTransitions = allTransitions
    .filter((t) => t.unit_id === unitId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const currentIndex = unitTransitions.findIndex((t) => t.id === stageTransition.id);
  const nextTransition = unitTransitions[currentIndex + 1];
  const exitDate = nextTransition ? new Date(nextTransition.created_at).getTime() : Date.now();
  return Math.floor((exitDate - enterDate) / MS_PER_DAY);
}

/** Tradução de `calculateCurrentStageTime` — dias desde a última vez que a unidade entrou na etapa em que está agora. */
function calculateCurrentStageTime(unit: Unit, transitions: StatusTransition[]): number {
  const unitTransitions = transitions
    .filter((t) => t.unit_id === unit.id && t.to_status === unit.admin_status)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (unitTransitions.length === 0) return 0;
  const enterDate = new Date(unitTransitions[0].created_at).getTime();
  return Math.floor((Date.now() - enterDate) / MS_PER_DAY);
}

/**
 * Tradução de
 * `original-project/src/components/dashboard/UnitFlowDashboard.jsx` — funil
 * das 9 etapas "vivas" do pipeline administrativo MCMV, só para unidades
 * `status = 'vendida'`. Usa `useUnitStatusTransitions` (já existente, usada
 * pelo Comparador de Unidades) em vez de uma query nova — mesma tabela
 * `status_transitions`, sem filtrar por `transition_type` (fiel ao
 * original, que também não filtra: os valores de `to_status` de transições
 * comerciais — `lead`/`qualificado`/etc — nunca colidem com os 9 nomes de
 * etapa administrativa).
 *
 * NOTA (quirk herdado do original, preservado de propósito): a etapa
 * `entregue` tem `avgDays: 0` (é terminal, não "deveria" ter um tempo
 * esperado) — isso faz `avgTime > expectedTime * 1.5` ser quase sempre
 * verdadeiro para ela, marcando "Entregue" como gargalo mesmo quando o
 * fluxo está saudável. Mesmo comportamento do `STAGE_CONFIG`/`bottlenecks`
 * original, não corrigido aqui (fora do pedido desta leva).
 */
export function UnitFlowDashboard() {
  const [expandedStage, setExpandedStage] = useState<LiveAdminStatus | null>(null);
  const { data: units, isLoading: loadingUnits, isError: errorUnits } = useUnits();
  const { data: transitions, isLoading: loadingTransitions, isError: errorTransitions } = useUnitStatusTransitions();

  const isLoading = loadingUnits || loadingTransitions;
  const isError = errorUnits || errorTransitions;

  const computed = useMemo(() => {
    if (!units || !transitions) return null;

    const soldUnits = units.filter((u) => u.status === 'vendida');

    const unitsByStage = ADMIN_STATUS_ORDER.reduce(
      (acc, status) => {
        acc[status] = soldUnits.filter((u) => u.admin_status === status);
        return acc;
      },
      {} as Record<LiveAdminStatus, Unit[]>
    );

    const avgTimeByStage = ADMIN_STATUS_ORDER.reduce(
      (acc, status) => {
        const unitsInStage = unitsByStage[status];
        if (unitsInStage.length === 0) {
          acc[status] = 0;
          return acc;
        }
        const totalDays = unitsInStage.reduce((sum, unit) => {
          const unitTransitions = transitions.filter((t) => t.unit_id === unit.id);
          const stageTransition = unitTransitions.find((t) => t.to_status === status);
          if (!stageTransition) return sum;
          return sum + calculateDaysInStage(unit.id, stageTransition, transitions);
        }, 0);
        acc[status] = Math.round(totalDays / unitsInStage.length);
        return acc;
      },
      {} as Record<LiveAdminStatus, number>
    );

    const bottlenecks = ADMIN_STATUS_ORDER.filter((status) => avgTimeByStage[status] > STAGE_CONFIG[status].avgDays * 1.5);

    const stuckUnits = soldUnits.filter((unit) => {
      if (!unit.admin_status || unit.admin_status === 'distrato') return false;
      const expectedTime = STAGE_CONFIG[unit.admin_status as LiveAdminStatus].avgDays;
      return calculateCurrentStageTime(unit, transitions) > expectedTime * 2;
    });

    const totalSold = soldUnits.length;
    const totalDelivered = unitsByStage.entregue.length;
    const deliveryRate = totalSold > 0 ? (totalDelivered / totalSold) * 100 : 0;

    const validAvgTimes = Object.values(avgTimeByStage).filter((t) => t > 0);
    const totalAverageTime = validAvgTimes.length > 0 ? Math.round(validAvgTimes.reduce((sum, t) => sum + t, 0)) : 0;

    return { unitsByStage, avgTimeByStage, bottlenecks, stuckUnits, totalSold, totalDelivered, deliveryRate, totalAverageTime };
  }, [units, transitions]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand dark:text-brand-dark" />
            Fluxo das Unidades (MCMV)
          </CardTitle>
          <Link to={pageUrl('Units')}>
            <Button variant="outline" size="sm">
              Ver Unidades
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && <LoadingInline />}
        {!isLoading && (isError || !computed) && <ErrorState />}
        {!isLoading && !isError && computed && computed.totalSold === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade vendida no pipeline administrativo ainda.
          </p>
        )}
        {!isLoading && !isError && computed && computed.totalSold > 0 && (
          <>
            {(computed.bottlenecks.length > 0 || computed.stuckUnits.length > 0) && (
              <div className="mb-6 space-y-2">
                {computed.bottlenecks.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                        {computed.bottlenecks.length} etapa(s) com gargalo identificado
                      </p>
                      <p className="text-xs text-orange-700 dark:text-orange-300">
                        {computed.bottlenecks.map((s) => STAGE_CONFIG[s].label).join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {computed.stuckUnits.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                    <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        {computed.stuckUnits.length} unidade(s) parada(s) há muito tempo
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300">Mais de 2x o tempo esperado</p>
                    </div>
                    <Link to={pageUrl('Units')}>
                      <Button size="sm" variant="outline">
                        Ver
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="mb-6 grid gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="mb-1 text-sm text-muted-foreground">Total Vendidas</p>
                <p className="text-3xl font-bold text-foreground">{computed.totalSold}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
                <p className="mb-1 text-sm text-muted-foreground">Entregues</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{computed.totalDelivered}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
                <p className="mb-1 text-sm text-muted-foreground">Taxa de Entrega</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{computed.deliveryRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-950">
                <p className="mb-1 text-sm text-muted-foreground">Tempo Médio Total</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{computed.totalAverageTime}d</p>
              </div>
            </div>

            <div className="space-y-3">
              {ADMIN_STATUS_ORDER.map((status) => {
                const config = STAGE_CONFIG[status];
                const unitsInStage = computed.unitsByStage[status];
                const count = unitsInStage.length;
                const percentage = computed.totalSold > 0 ? (count / computed.totalSold) * 100 : 0;
                const avgTime = computed.avgTimeByStage[status];
                const isBottleneck = computed.bottlenecks.includes(status);
                const isExpanded = expandedStage === status;

                return (
                  <div key={status} className="space-y-2">
                    <div
                      className={`cursor-pointer rounded-lg border p-4 transition-all ${
                        isBottleneck ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950' : 'border-border'
                      } ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}
                      onClick={() => setExpandedStage(isExpanded ? null : status)}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{config.icon}</span>
                          <div>
                            <p className="font-medium text-foreground">{config.label}</p>
                            <p className="text-xs text-muted-foreground">
                              Esperado: {config.avgDays}d • Real: {avgTime}d
                              {avgTime > config.avgDays && (
                                <span className="ml-1 text-orange-600 dark:text-orange-400">(+{avgTime - config.avgDays}d)</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {isBottleneck && (
                            <Badge
                              variant="destructive"
                              className="border-orange-300 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200"
                            >
                              Gargalo
                            </Badge>
                          )}
                          <div className="text-right">
                            <p className="text-2xl font-bold text-foreground">{count}</p>
                            <p className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>

                      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: config.color }}
                        />
                      </div>
                    </div>

                    {isExpanded && count > 0 && (
                      <div className="ml-8 space-y-2 rounded-lg bg-muted p-4">
                        <p className="mb-2 text-sm font-medium text-foreground">Unidades nesta etapa:</p>
                        {unitsInStage.slice(0, 5).map((unit) => (
                          <Link
                            key={unit.id}
                            to={`${pageUrl('Units')}/${unit.id}`}
                            className="flex items-center justify-between rounded border bg-card p-2 text-sm transition hover:bg-accent"
                          >
                            <span>Unidade {unit.sku}</span>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {calculateCurrentStageTime(unit, transitions ?? [])}d nesta etapa
                              </Badge>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </span>
                          </Link>
                        ))}
                        {count > 5 && (
                          <Link to={pageUrl('Units')}>
                            <Button variant="outline" size="sm" className="mt-2 w-full">
                              Ver todas as {count} unidades
                            </Button>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
