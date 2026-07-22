import { DollarSign, FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COMMISSION_ADJUSTMENT_CONFIG, formatCurrency } from '@/features/commissions/constants';
import type { CommissionAdjustment } from '@/features/commissions/types';

interface AdjustmentsCardProps {
  adjustments: CommissionAdjustment[];
}

function formatDateTime(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

/** Tradução do card "Ajustes" de `CommissionDetail.jsx`. */
export function AdjustmentsCard({ adjustments }: AdjustmentsCardProps) {
  return (
    <Card className="border-0 shadow-sm lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <DollarSign className="h-5 w-5" />
          Ajustes ({adjustments.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {adjustments.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum ajuste registrado</p>
        ) : (
          <div className="space-y-3">
            {adjustments.map((adjustment) => {
              const config = COMMISSION_ADJUSTMENT_CONFIG[adjustment.type];
              const Icon = config.icon;

              return (
                <div key={adjustment.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-1 h-5 w-5 ${config.color}`} />
                    <div className="flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        {config.label}
                        <span className={`font-bold ${config.color}`}>
                          {config.sign === -1 ? '-' : '+'}
                          {formatCurrency(adjustment.amount)}
                        </span>
                      </p>
                      {adjustment.reason && <p className="mt-1 text-sm text-muted-foreground">{adjustment.reason}</p>}
                      {adjustment.attachment_url && (
                        <a
                          href={adjustment.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          Ver anexo ({adjustment.attachment_name || 'arquivo'})
                        </a>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(adjustment.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
