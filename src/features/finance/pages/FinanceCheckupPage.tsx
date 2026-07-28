import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, PlayCircle, RefreshCw, Shield } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/finance/constants';
import { useRunFinanceCheckup } from '@/features/finance/hooks';
import type { FinanceCheckupReport } from '@/features/finance/types';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

type CheckupCategoryKey = keyof FinanceCheckupReport['summary'];

const CATEGORY_LABELS: Record<CheckupCategoryKey, string> = {
  duplicate_wallets: 'Carteiras Duplicadas',
  duplicate_installments: 'Parcelas Duplicadas',
  missing_payment_date: 'Data de Pagamento Faltando',
  zero_valor_pago_on_paid: 'Valor Pago Zerado em Parcela Paga',
  nonzero_valor_pago_on_unpaid: 'Valor Pago Não-Zero em Parcela Não Paga',
  overdue_not_marked: 'Atrasadas Não Marcadas',
};

const CATEGORY_ORDER: CheckupCategoryKey[] = [
  'duplicate_wallets',
  'duplicate_installments',
  'missing_payment_date',
  'zero_valor_pago_on_paid',
  'nonzero_valor_pago_on_unpaid',
  'overdue_not_marked',
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR');
}

/** Link para a unidade dona do item, quando o id é conhecido — mesmo estilo de link já usado para unidade em `DealDetailPage.tsx`. Sem link (só o id cru) se a unidade não estiver mais no cache de `useUnits()` (ex: soft-deleted). */
function UnitLink({ unitId, unitSku }: { unitId: string; unitSku: string | undefined }) {
  return (
    <Link to={`${pageUrl('Units')}/${unitId}`} className="font-medium text-brand hover:underline">
      {unitSku ?? unitId}
    </Link>
  );
}

/**
 * Tradução de `original-project/src/pages/FinanceCheckup.jsx` +
 * `src/components/finance/financeCheckup.jsx` — a chamada
 * `executeFinanceCheckup`/`formatCheckupReport` (loop sequencial de leitura
 * client-side) vira uma única chamada a `run_finance_checkup` (RPC
 * `plpgsql` transacional, ver `supabase/migrations/0068_finance_checkup_rpc.sql`),
 * que já devolve o relatório pronto (contagens + itens) em vez da tela
 * montar isso a partir de queries soltas.
 *
 * Gate de acesso: `tenantRole === 'admin'`, mesmo critério de
 * `user.role === "admin"` do original — mas aqui é defesa em profundidade,
 * não a autorização real (a RPC verifica `tenant_role = 'admin'` de novo,
 * internamente, antes de ler ou escrever qualquer coisa — ver comentário de
 * topo da migration). Mensagem "Acesso negado" segue o mesmo vocabulário
 * visual já usado em outra tela admin-only do projeto (`Shield` + "Apenas
 * administradores podem..." — ver `UsersTab.tsx`), aqui em página inteira em
 * vez de inline num card, porque a tela inteira (não só uma aba) é
 * exclusiva de admin.
 *
 * Itens de cada categoria são renderizados com campos nomeados (não
 * `JSON.stringify` cru como no original) — cada categoria tem sua própria
 * forma (ver `FinanceCheckup*Item` em `types.ts`), e todo item com
 * `unit_id` ganha link para a unidade (`UnitLink`).
 */
export function FinanceCheckupPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const runCheckup = useRunFinanceCheckup();
  const { data: units } = useUnits();

  const [report, setReport] = useState<FinanceCheckupReport | null>(null);
  const [mode, setMode] = useState<'dryrun' | 'apply' | null>(null);
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<CheckupCategoryKey>>(new Set());

  const unitSkuById = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of units ?? []) map.set(unit.id, unit.sku);
    return map;
  }, [units]);

  const totalIssues = report
    ? Object.values(report.summary).reduce((sum, count) => sum + count, 0)
    : 0;

  function toggleCategory(key: CheckupCategoryKey) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleRun(dryRun: boolean) {
    setMode(dryRun ? 'dryrun' : 'apply');
    runCheckup.mutate(dryRun, {
      onSuccess: (data) => {
        setReport(data);
        setExpandedCategories(new Set());
        if (!dryRun) {
          toast.success('Correções aplicadas com sucesso.');
        }
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : 'Erro ao executar o checkup financeiro.');
      },
    });
  }

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
          description="Apenas administradores podem acessar o Checkup Financeiro."
        />
      </div>
    );
  }

  const isRunningDryRun = runCheckup.isPending && mode === 'dryrun';
  const isRunningApply = runCheckup.isPending && mode === 'apply';
  const showApplyButton = Boolean(report) && mode === 'dryrun' && totalIssues > 0;

  return (
    <div>
      <PageHeader title="Checkup Financeiro" subtitle="Detecção e correção automática de inconsistências financeiras" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Executar Checkup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="brand" onClick={() => handleRun(true)} disabled={runCheckup.isPending}>
              <PlayCircle className="h-4 w-4" />
              {isRunningDryRun ? 'Analisando...' : 'Rodar em Modo Simulação'}
            </Button>

            {showApplyButton && (
              <Button variant="destructive" onClick={() => setIsApplyConfirmOpen(true)} disabled={runCheckup.isPending}>
                <RefreshCw className="h-4 w-4" />
                {isRunningApply ? 'Corrigindo...' : 'Aplicar Correções'}
              </Button>
            )}

            {runCheckup.isPending && (
              <span className="text-sm text-muted-foreground">Processando... isso pode levar alguns segundos.</span>
            )}
          </div>

          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Modo Simulação (dry run):</strong> apenas analisa e reporta problemas, sem alterar nenhum dado.
              <br />
              <strong>Aplicar Correções:</strong> executa as correções de verdade (mescla de carteiras, remoção de
              parcelas duplicadas, ajuste de campos) — pede confirmação antes de rodar, por escrever em dado
              financeiro real.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {report && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {totalIssues === 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Nenhum Problema Encontrado
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    {totalIssues} Problema{totalIssues > 1 ? 's' : ''} Detectado{totalIssues > 1 ? 's' : ''}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                {report.corrections_applied ? 'Correções aplicadas em' : 'Simulação executada em'}{' '}
                {new Date(report.executed_at).toLocaleString('pt-BR')}.
              </p>
              {totalIssues === 0 && (
                <p>Todos os dados financeiros estão consistentes — não há duplicidades nem inconsistências.</p>
              )}
              {report.corrections_applied && totalIssues > 0 && (
                <p className="text-green-700">
                  As {totalIssues} inconsistência{totalIssues > 1 ? 's' : ''} detectada{totalIssues > 1 ? 's' : ''} acima
                  {totalIssues > 1 ? ' foram corrigidas' : ' foi corrigida'} nesta execução.
                </p>
              )}
            </CardContent>
          </Card>

          {CATEGORY_ORDER.map((key) => {
            const count = report.summary[key];
            const isExpanded = expandedCategories.has(key);

            return (
              <Card key={key} className="mb-4">
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => count > 0 && toggleCategory(key)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {count > 0 && (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                      {CATEGORY_LABELS[key]}
                    </CardTitle>
                    <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{count} encontrado{count !== 1 ? 's' : ''}</Badge>
                  </div>
                </CardHeader>

                {count > 0 && isExpanded && (
                  <CardContent className="space-y-3">
                    {key === 'duplicate_wallets' &&
                      report.details.duplicate_wallets.map((item) => (
                        <div key={item.duplicate_account_id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — carteira{' '}
                            <span className="font-mono text-xs">{item.duplicate_account_id}</span> mesclada em{' '}
                            <span className="font-mono text-xs">{item.primary_account_id}</span>
                          </p>
                          <p className="text-muted-foreground">{item.installments_moved} parcela(s) migrada(s)</p>
                        </div>
                      ))}

                    {key === 'duplicate_installments' &&
                      report.details.duplicate_installments.map((item) => (
                        <div key={item.duplicate_installment_id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — parcela{' '}
                            <span className="font-mono text-xs">{item.duplicate_installment_id}</span> removida (mantida{' '}
                            <span className="font-mono text-xs">{item.primary_installment_id}</span>)
                          </p>
                          <p className="text-muted-foreground">
                            {item.tipo} · vencimento {formatDate(item.vencimento)} · {formatCurrency(item.valor_previsto)}
                            {item.descricao ? ` · ${item.descricao}` : ''}
                          </p>
                        </div>
                      ))}

                    {key === 'missing_payment_date' &&
                      report.details.missing_payment_date.map((item) => (
                        <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — parcela{' '}
                            <span className="font-mono text-xs">{item.id}</span>
                          </p>
                          <p className="text-muted-foreground">
                            vencimento {formatDate(item.vencimento)} · status {item.status}
                          </p>
                        </div>
                      ))}

                    {key === 'zero_valor_pago_on_paid' &&
                      report.details.zero_valor_pago_on_paid.map((item) => (
                        <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — parcela{' '}
                            <span className="font-mono text-xs">{item.id}</span>
                          </p>
                          <p className="text-muted-foreground">
                            vencimento {formatDate(item.vencimento)} · valor previsto {formatCurrency(item.valor_previsto)}
                          </p>
                        </div>
                      ))}

                    {key === 'nonzero_valor_pago_on_unpaid' &&
                      report.details.nonzero_valor_pago_on_unpaid.map((item) => (
                        <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — parcela{' '}
                            <span className="font-mono text-xs">{item.id}</span>
                          </p>
                          <p className="text-muted-foreground">
                            vencimento {formatDate(item.vencimento)} · status {item.status} · valor pago{' '}
                            {formatCurrency(item.valor_pago)}
                          </p>
                        </div>
                      ))}

                    {key === 'overdue_not_marked' &&
                      report.details.overdue_not_marked.map((item) => (
                        <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                          <p>
                            Unidade <UnitLink unitId={item.unit_id} unitSku={unitSkuById.get(item.unit_id)} /> — parcela{' '}
                            <span className="font-mono text-xs">{item.id}</span>
                          </p>
                          <p className="text-muted-foreground">
                            vencimento {formatDate(item.vencimento)} · status atual {item.status}
                          </p>
                        </div>
                      ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </>
      )}

      <AlertDialog open={isApplyConfirmOpen} onOpenChange={setIsApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar correções financeiras?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação altera dados financeiros reais: mescla carteiras duplicadas, remove parcelas duplicadas e
              corrige campos inconsistentes ({totalIssues} inconsistência{totalIssues !== 1 ? 's' : ''} detectada
              {totalIssues !== 1 ? 's' : ''} na última simulação). Não pode ser desfeita automaticamente. Deseja
              continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApply} className="bg-destructive hover:bg-destructive/90">
              Aplicar Correções
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
