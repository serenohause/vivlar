import { Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { FINANCE_EVENT_TYPE_LABELS } from '@/features/finance/constants';
import type { FinanceEvent } from '@/features/finance/types';

/**
 * Tradução da aba "Timeline" de `original-project/src/pages/FinanceDetail.jsx`
 * (lista simples de `finance_events`, mais recente primeiro — `useFinanceEvents`
 * já ordena por `created_at desc`). Não usa
 * `original-project/src/components/finance/FinanceTimeline.jsx`: aquele
 * componente é do modelo legado (`status_financeiro` de `VendaFinanceira`,
 * um stepper de etapas fixas), incompatível com o log write-once de eventos
 * do schema atual — mesma decisão já registrada em `docs/ARCHITECTURE.md`
 * sobre `VendaFinanceira` não ter sido portado.
 */
export function FinanceTimeline({ events }: { events: FinanceEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Clock className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
        <p>Nenhum evento registrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className="flex gap-4 rounded-lg bg-muted p-4">
          <div className="flex-1">
            <p className="font-medium text-foreground">{event.descricao}</p>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(event.created_at).toLocaleString('pt-BR')}</p>
          </div>
          <Badge variant="outline">{FINANCE_EVENT_TYPE_LABELS[event.tipo_evento]}</Badge>
        </div>
      ))}
    </div>
  );
}
