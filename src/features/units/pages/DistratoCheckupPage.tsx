import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, PlayCircle, RefreshCw, Shield } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { useRunDistratoCheckup } from '@/features/units/hooks';
import type { DistratoCheckupReport } from '@/features/units/types';
import { pageUrl } from '@/lib/page-url';

/** Link para a unidade dona do item — cada item de `details` já traz o `sku`, então não precisa de um lookup em `useUnits()` (diferente de `UnitLink` em `FinanceCheckupPage.tsx`, cujos itens só trazem `unit_id`). */
function UnitLink({ unitId, sku }: { unitId: string; sku: string }) {
  return (
    <Link to={`${pageUrl('Units')}/${unitId}`} className="font-medium text-brand hover:underline">
      {sku}
    </Link>
  );
}

function ResultBadge({ result }: { result: 'pending_dry_run' | 'reconciled' | 'reset' | 'error' }) {
  if (result === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (result === 'pending_dry_run') return <Badge variant="outline">Candidato</Badge>;
  return <Badge variant="secondary">{result === 'reconciled' ? 'Reconciliado' : 'Resetado'}</Badge>;
}

/**
 * Tradução de `original-project/src/pages/DistratoCheckup.jsx` — a leitura
 * client-side de `units`/`deals`/`documents` + o `runReconciliation` que só
 * fazia reset de MCMV (mesmo mostrando um card de "Inconsistências
 * Detectadas" de reconciliação, nunca corrigidas — bug confirmado por
 * leitura linha a linha, ver comentário de topo de
 * `supabase/migrations/0071_distrato_checkup_rpc.sql`) viram uma única
 * chamada a `run_distrato_checkup`, que já faz as duas correções de
 * verdade (reconciliação + reset MCMV em lote).
 *
 * Diferente de `FinanceCheckupPage` (dry run só ao clicar em "Rodar em Modo
 * Simulação"): aqui o dry run roda AUTOMATICAMENTE ao montar a tela (via
 * `useEffect`, mesmo padrão de `useCheckAndResetUnitMcmvFlow` em
 * `UnitDetailPage.tsx`), fiel ao original — que já calculava
 * `potentialIssues` e mostrava o card de resumo assim que `units`/`deals`/
 * `documents` terminavam de carregar, sem exigir uma ação explícita do
 * usuário só para ver o diagnóstico.
 *
 * Gate de acesso: `tenantRole === 'admin'`, mesmo critério e mesmo
 * vocabulário visual de `FinanceCheckupPage` — defesa em profundidade, não
 * a autorização real (a RPC verifica `tenant_role = 'admin'` de novo,
 * internamente, antes de ler ou escrever qualquer coisa).
 */
export function DistratoCheckupPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const runCheckup = useRunDistratoCheckup();

  const [report, setReport] = useState<DistratoCheckupReport | null>(null);
  const [mode, setMode] = useState<'dryrun' | 'apply' | null>(null);
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);

  function handleRun(dryRun: boolean) {
    setMode(dryRun ? 'dryrun' : 'apply');
    runCheckup.mutate(dryRun, {
      onSuccess: (data) => {
        setReport(data);
        if (!dryRun) {
          toast.success('Checkup de distratos executado com sucesso.');
        }
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Erro ao executar o checkup de distratos.');
      },
    });
  }

  // Dry run automático ao montar a tela -- só para quem passa no gate de
  // admin (evita bater na RPC e receber 42501 à toa para os demais papéis).
  useEffect(() => {
    if (isAdmin) handleRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function handleConfirmApply() {
    setIsApplyConfirmOpen(false);
    handleRun(false);
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Shield}
          title="Acesso negado"
          description="Apenas administradores podem acessar o Checkup de Distratos."
        />
      </div>
    );
  }

  const isRunningDryRun = runCheckup.isPending && mode === 'dryrun';
  const isRunningApply = runCheckup.isPending && mode === 'apply';
  const isInitialLoad = isRunningDryRun && !report;
  const isInitialError = runCheckup.isError && mode === 'dryrun' && !report;

  const totalCandidates = report
    ? report.summary.reconciliation_candidates + report.summary.mcmv_reset_candidates
    : 0;
  const showApplyButton = Boolean(report) && mode === 'dryrun' && totalCandidates > 0;

  return (
    <div>
      <PageHeader
        title="Checkup de Distratos"
        subtitle="Reconciliação de unidades com distrato aprovado e reset em lote do fluxo MCMV"
      />

      {isInitialError && (
        <ErrorState
          description="Não foi possível carregar o diagnóstico de distratos. Tente novamente em instantes."
          onRetry={() => handleRun(true)}
        />
      )}

      {isInitialLoad && <LoadingInline />}

      {report && (
        <>
          {/* Status Overview */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total de Unidades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{report.summary.total_units}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Candidatos à Reconciliação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{report.summary.reconciliation_candidates}</div>
                <p className="mt-1 text-xs text-muted-foreground">Distrato aprovado mas status/negócio inconsistente</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Candidatos a Reset MCMV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">{report.summary.mcmv_reset_candidates}</div>
                <p className="mt-1 text-xs text-muted-foreground">Em distrato mas com negócio ativo não finalizado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Última Execução</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {new Date(report.executed_at).toLocaleString('pt-BR')}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Executar Reconciliação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>O que esta ação faz:</strong> aplica o distrato de verdade (deal distratado/inativo, unidade
                    liberada para disponível) nas unidades com Termo de Distrato aprovado e status/negócio
                    inconsistente, e reseta em lote o fluxo MCMV de unidades em distrato com uma nova negociação ativa.
                    O diagnóstico acima já foi calculado em modo simulação — nenhum dado foi alterado até este ponto.
                  </AlertDescription>
                </Alert>

                {showApplyButton && (
                  <Button variant="brand" size="lg" onClick={() => setIsApplyConfirmOpen(true)} disabled={runCheckup.isPending}>
                    {isRunningApply ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        Executando Reconciliação...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-5 w-5" />
                        Reconciliar Distratos
                      </>
                    )}
                  </Button>
                )}

                {!showApplyButton && totalCandidates === 0 && (
                  <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                    <p className="font-medium text-foreground">Nenhuma inconsistência encontrada!</p>
                    <p className="text-sm">Todos os distratos e fluxos MCMV estão devidamente sincronizados.</p>
                  </div>
                )}

                {runCheckup.isPending && (
                  <span className="text-sm text-muted-foreground">Processando... isso pode levar alguns segundos.</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {report.corrections_applied && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Resultado da Reconciliação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                    <div className="mb-1 text-sm text-green-700 dark:text-green-400">Reconciliadas</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{report.summary.reconciled}</div>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-950/30">
                    <div className="mb-1 text-sm text-purple-700 dark:text-purple-400">MCMV Resetado</div>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{report.summary.mcmv_reset}</div>
                  </div>
                  <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/30">
                    <div className="mb-1 text-sm text-red-700 dark:text-red-400">Erros</div>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{report.summary.errors}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reconciliation detail */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Reconciliação ({report.details.reconciliation.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.details.reconciliation.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma unidade candidata a reconciliação.</p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {report.details.reconciliation.map((item) => (
                    <div key={item.unit_id} className="rounded-lg bg-muted/50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p>
                          Unidade <UnitLink unitId={item.unit_id} sku={item.sku} /> — status atual{' '}
                          <span className="font-mono text-xs">{item.unit_status}</span>
                        </p>
                        <ResultBadge result={item.result} />
                      </div>
                      {item.result === 'error' && <p className="mt-1 text-destructive">{item.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* MCMV reset detail */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="h-4 w-4 text-purple-600" />
                Reset MCMV ({report.details.mcmv_reset.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.details.mcmv_reset.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma unidade candidata a reset de MCMV.</p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {report.details.mcmv_reset.map((item) => (
                    <div key={item.unit_id} className="rounded-lg bg-muted/50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p>
                          Unidade <UnitLink unitId={item.unit_id} sku={item.sku} />
                          {item.deal_sales_stage ? (
                            <>
                              {' '}
                              — negócio ativo em <span className="font-mono text-xs">{item.deal_sales_stage}</span>
                            </>
                          ) : null}
                        </p>
                        <ResultBadge result={item.result} />
                      </div>
                      {item.result === 'error' && <p className="mt-1 text-destructive">{item.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={isApplyConfirmOpen} onOpenChange={setIsApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconciliar distratos?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação altera dados reais: aplica o distrato de {report?.summary.reconciliation_candidates ?? 0}{' '}
              unidade(s) e reseta o fluxo MCMV de {report?.summary.mcmv_reset_candidates ?? 0} unidade(s), conforme o
              diagnóstico acima. Não pode ser desfeita automaticamente. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApply}>Reconciliar Distratos</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
