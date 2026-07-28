import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, TrendingDown, TrendingUp, Trophy } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useDocuments } from '@/features/documents/hooks';
import { useAllPaymentInstallments, useFinanceAccounts } from '@/features/finance/hooks';
import { useProjects } from '@/features/projects/hooks';
import { useUnitStatusTransitions, useUnits } from '@/features/units/hooks';
import type { Unit } from '@/features/units/types';
import { calculateUnitComparisonMetrics, getUnitScoreBadge, getUnitScoreColorClass } from '@/features/units/utils';
import { pageUrl } from '@/lib/page-url';

interface UnitWithMetrics extends Unit {
  metrics: ReturnType<typeof calculateUnitComparisonMetrics>;
  projectName: string;
}

/**
 * Tradução fiel de `original-project/src/pages/UnitsComparison.jsx` —
 * ranking de unidades por um score composto (progresso no pipeline
 * administrativo 40% + documentos aprovados 30% + saúde financeira 30%,
 * ver `calculateUnitComparisonMetrics` em `features/units/utils.ts`). Só
 * leitura, sem mudança de schema/RLS: reaproveita `useUnits`/`useProjects`/
 * `useDocuments`/`useFinanceAccounts`/`useAllPaymentInstallments` já
 * existentes e `useUnitStatusTransitions` (novo, listagem geral de
 * `status_transitions` por `unit_id` — ver `features/units/hooks.ts`).
 *
 * Página alcançada só pelo botão "Comparar" de `UnitsListPage` — sem item
 * de nav próprio, fiel ao original.
 */
export function UnitsComparisonPage() {
  const [selectedProject, setSelectedProject] = useState('all');

  const { data: units, isLoading, isError, refetch } = useUnits();
  const { data: projects } = useProjects();
  const { data: documents } = useDocuments();
  const { data: transitions } = useUnitStatusTransitions();
  const { data: financeAccounts } = useFinanceAccounts();
  const { data: installments } = useAllPaymentInstallments();

  const allProjects = projects ?? [];
  const allDocuments = documents ?? [];
  const allTransitions = transitions ?? [];
  const allFinanceAccounts = financeAccounts ?? [];
  const allInstallments = installments ?? [];

  const projectFilteredUnits = useMemo(() => {
    const all = units ?? [];
    return selectedProject === 'all' ? all : all.filter((u) => u.project_id === selectedProject);
  }, [units, selectedProject]);

  const unitsWithMetrics: UnitWithMetrics[] = useMemo(() => {
    return projectFilteredUnits
      .map((unit) => {
        const account = allFinanceAccounts.find((a) => a.unit_id === unit.id);
        const metrics = calculateUnitComparisonMetrics(
          unit,
          allTransitions.filter((t) => t.unit_id === unit.id),
          allDocuments.filter((d) => d.unit_id === unit.id),
          account,
          account ? allInstallments.filter((i) => i.finance_account_id === account.id) : []
        );

        return {
          ...unit,
          metrics,
          projectName: allProjects.find((p) => p.id === unit.project_id)?.name ?? '—',
        };
      })
      .filter((u) => u.admin_status !== 'distrato')
      .sort((a, b) => b.metrics.score - a.metrics.score);
  }, [projectFilteredUnits, allProjects, allTransitions, allDocuments, allFinanceAccounts, allInstallments]);

  const deliveredCount = projectFilteredUnits.filter((u) => u.admin_status === 'entregue').length;

  const avgProgress =
    unitsWithMetrics.length > 0
      ? unitsWithMetrics.reduce((sum, u) => sum + u.metrics.progressPercent, 0) / unitsWithMetrics.length
      : 0;

  const avgDays =
    unitsWithMetrics.length > 0
      ? unitsWithMetrics.reduce((sum, u) => sum + u.metrics.totalDays, 0) / unitsWithMetrics.length
      : 0;

  const avgScore =
    unitsWithMetrics.length > 0
      ? unitsWithMetrics.reduce((sum, u) => sum + u.metrics.score, 0) / unitsWithMetrics.length
      : 0;

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Comparativo de Unidades" subtitle="Análise de desempenho e ranking" backTo="Units" />

      {/* Filtro por Projeto */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Filtrar por Projeto:</label>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Projetos</SelectItem>
            {allProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo Geral */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Total Unidades</div>
            <div className="text-3xl font-bold text-brand">{unitsWithMetrics.length}</div>
            <p className="mt-2 text-xs text-muted-foreground">{deliveredCount} entregues</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Média Progresso</div>
            <div className="text-3xl font-bold text-foreground">{avgProgress.toFixed(0)}%</div>
            <Progress value={avgProgress} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Tempo Médio</div>
            <div className="text-3xl font-bold text-foreground">{avgDays.toFixed(0)}</div>
            <p className="mt-2 text-xs text-muted-foreground">dias no processo</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Score Médio</div>
            <div className={`text-3xl font-bold ${getUnitScoreColorClass(avgScore)}`}>{avgScore.toFixed(0)}</div>
            <p className="mt-2 text-xs text-muted-foreground">de 100 pontos</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela Comparativa */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-brand" />
            <CardTitle>Ranking de Unidades</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {unitsWithMetrics.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhuma unidade encontrada</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Ranking</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Tempo</TableHead>
                    <TableHead>Documentos</TableHead>
                    <TableHead>Financeiro</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitsWithMetrics.map((unit, index) => {
                    const scoreBadge = getUnitScoreBadge(unit.metrics.score);

                    return (
                      <TableRow key={unit.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                                index === 0
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : index === 1
                                    ? 'bg-slate-200 text-slate-700'
                                    : index === 2
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-slate-50 text-slate-500'
                              }`}
                            >
                              {index + 1}º
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="font-medium">{unit.sku}</TableCell>

                        <TableCell className="text-sm text-muted-foreground">{unit.projectName}</TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={unit.metrics.progressPercent} className="h-2 w-20" />
                            <span className="whitespace-nowrap text-sm font-medium">
                              {unit.metrics.progressPercent.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1">
                            {unit.metrics.totalDays < avgDays && unit.metrics.totalDays > 0 && (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            )}
                            {unit.metrics.totalDays > avgDays * 1.2 && <TrendingDown className="h-4 w-4 text-red-600" />}
                            <span className="text-sm font-medium">{unit.metrics.totalDays} dias</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="text-sm">
                            <span className="font-medium">{unit.metrics.docsCompleted}</span>
                            <span className="text-muted-foreground">/{unit.metrics.docsTotal}</span>
                          </div>
                        </TableCell>

                        <TableCell>
                          {unit.metrics.financeStatus === 'ok' && <Badge className="bg-green-100 text-green-700">OK</Badge>}
                          {unit.metrics.financeStatus === 'atraso' && (
                            <Badge className="bg-yellow-100 text-yellow-700">{unit.metrics.overdueCount} atraso(s)</Badge>
                          )}
                          {unit.metrics.financeStatus === 'critico' && (
                            <Badge variant="destructive">{unit.metrics.overdueCount} em atraso</Badge>
                          )}
                          {unit.metrics.financeStatus === 'sem_dados' && <Badge variant="secondary">Sem dados</Badge>}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`text-2xl font-bold ${getUnitScoreColorClass(unit.metrics.score)}`}>
                              {unit.metrics.score}
                            </div>
                            <Badge className={scoreBadge.className}>{scoreBadge.label}</Badge>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Link to={`${pageUrl('Units')}/${unit.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
