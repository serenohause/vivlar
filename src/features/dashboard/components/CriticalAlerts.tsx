import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock, FileWarning, type LucideIcon, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDeals } from '@/features/deals/hooks';
import { useDocuments } from '@/features/documents/hooks';
import { formatCurrency } from '@/features/finance/constants';
import { useOverdueInstallments } from '@/features/finance/hooks';
import { pageUrl } from '@/lib/page-url';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type AlertColor = 'red' | 'orange';

interface CriticalAlert {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionPage: string;
  color: AlertColor;
}

/**
 * Tradução de `original-project/src/components/dashboard/CriticalAlerts.jsx`
 * — 3 alertas independentes, cada um só aparece se `count > 0`; se nenhum
 * alerta se aplica, o card inteiro some (`return null`, fiel ao original).
 * Reaproveita hooks já existentes por feature em vez de refazer as 3
 * queries cruas do original (`PaymentInstallment.list()`/`Deal.list()`/
 * `Document.list()`):
 * - parcelas atrasadas: `useOverdueInstallments` já deriva `em_atraso` a
 *   partir de `vencimento` (`computeInstallmentDisplayStatus`), mesmo
 *   critério de `computeInstallmentComputedStatus` do original.
 * - negócios sem atividade 14+ dias: nosso schema TEM `deals.last_activity_date`
 *   (`features/deals/types.ts`) — usado direto, com fallback para
 *   `created_at` só quando nunca houve nenhuma atividade registrada desde a
 *   criação (mesmo papel do fallback `created_date` do original, que
 *   existia porque aquele campo podia faltar).
 * - documentos pendentes 30+ dias: `documents.status = 'pendente'` comparado
 *   com `created_at` (`documents.received_at` marcaria o recebimento, não a
 *   abertura do pedido — `created_at` é o campo fiel ao `created_date` do
 *   original).
 */
export function CriticalAlerts() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: overdueInstallments, isLoading: loadingInstallments } = useOverdueInstallments();
  const { data: deals, isLoading: loadingDeals } = useDeals();
  const { data: documents, isLoading: loadingDocuments } = useDocuments();

  const isLoading = loadingInstallments || loadingDeals || loadingDocuments;

  const alerts = useMemo<CriticalAlert[]>(() => {
    if (!overdueInstallments || !deals || !documents) return [];

    const result: CriticalAlert[] = [];
    const now = Date.now();

    if (overdueInstallments.length > 0) {
      const total = overdueInstallments.reduce((sum, i) => sum + (i.valor_previsto || 0), 0);
      result.push({
        id: 'overdue-installments',
        icon: AlertTriangle,
        title: `${overdueInstallments.length} parcela(s) atrasada(s)`,
        subtitle: `Total: ${formatCurrency(total)}`,
        actionPage: pageUrl('InadimplenciaManager'),
        color: 'red',
      });
    }

    const stagnantDeals = deals.filter((d) => {
      if (['vendido', 'perdido', 'distratado'].includes(d.sales_stage)) return false;
      const lastActivity = new Date(d.last_activity_date ?? d.created_at).getTime();
      return (now - lastActivity) / MS_PER_DAY >= 14;
    });

    if (stagnantDeals.length > 0) {
      result.push({
        id: 'stagnant-deals',
        icon: Clock,
        title: `${stagnantDeals.length} negócio(s) sem atividade há 14+ dias`,
        subtitle: 'Risco de perda',
        actionPage: pageUrl('CRM'),
        color: 'orange',
      });
    }

    const pendingDocs = documents.filter(
      (d) => d.status === 'pendente' && (now - new Date(d.created_at).getTime()) / MS_PER_DAY >= 30
    );

    if (pendingDocs.length > 0) {
      result.push({
        id: 'pending-docs',
        icon: FileWarning,
        title: `${pendingDocs.length} documento(s) pendente(s) há 30+ dias`,
        subtitle: 'Requer atenção urgente',
        actionPage: pageUrl('Documents'),
        color: 'red',
      });
    }

    return result;
  }, [overdueInstallments, deals, documents]);

  const visibleAlerts = alerts.filter((alert) => !dismissed.has(alert.id));

  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-muted">
        <CardContent className="animate-pulse pt-6">
          <div className="h-5 w-56 rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (visibleAlerts.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-red-500">
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <h3 className="text-lg font-semibold text-foreground">Alertas Críticos ({visibleAlerts.length})</h3>
          </div>
          <Badge variant="destructive">Requer Atenção</Badge>
        </div>

        <div className="space-y-3">
          {visibleAlerts.map((alert) => {
            const Icon = alert.icon;
            return (
              <div
                key={alert.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  alert.color === 'red'
                    ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                    : 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950'
                }`}
              >
                <div className="flex flex-1 items-center gap-3">
                  <Icon
                    className={`h-5 w-5 ${alert.color === 'red' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}
                  />
                  <div>
                    <p className="font-medium text-foreground">{alert.title}</p>
                    <p className="text-sm text-muted-foreground">{alert.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={alert.actionPage}>
                    <Button size="sm" variant="outline">
                      Ver
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
