import { useMemo } from 'react';
import { Trophy } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBrokers } from '@/features/brokers/hooks';
import type { Broker } from '@/features/brokers/types';
import { useDeals } from '@/features/deals/hooks';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    value
  );
}

interface BrokerPerformance {
  broker: Broker;
  totalDeals: number;
  sold: number;
  totalValue: number;
  conversionRate: string;
}

/**
 * Tradução de `original-project/src/components/dashboard/TeamPerformance.jsx`
 * — ranking dos até 5 corretores com maior valor total vendido
 * (`deals.sales_stage = 'vendido'`, soma `final_sale_value ?? expected_sale_value`).
 * Reaproveita `useBrokers`/`useDeals` já existentes (sem duplicar query).
 * Só renderiza se houver pelo menos 1 corretor com pelo menos 1 negócio
 * (`performance.length > 0` depois do filtro) — igual ao original
 * (`brokers.length > 0 && <TeamPerformance .../>` em `Dashboard.jsx`), só
 * que a checagem migrou para dentro do componente porque aqui ele decide
 * sozinho se deve se renderizar.
 */
export function TeamPerformance() {
  const { data: brokers, isLoading: loadingBrokers } = useBrokers();
  const { data: deals, isLoading: loadingDeals } = useDeals();

  const isLoading = loadingBrokers || loadingDeals;

  const performance = useMemo<BrokerPerformance[]>(() => {
    if (!brokers || !deals) return [];

    return brokers
      .map((broker) => {
        const brokerDeals = deals.filter((d) => d.broker_id === broker.id);
        const soldDeals = brokerDeals.filter((d) => d.sales_stage === 'vendido');
        const totalValue = soldDeals.reduce((sum, d) => sum + (d.final_sale_value ?? d.expected_sale_value ?? 0), 0);

        return {
          broker,
          totalDeals: brokerDeals.length,
          sold: soldDeals.length,
          totalValue,
          conversionRate: brokerDeals.length > 0 ? ((soldDeals.length / brokerDeals.length) * 100).toFixed(1) : '0',
        };
      })
      .filter((item) => item.totalDeals > 0)
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [brokers, deals]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Performance da Equipe
            <Trophy className="h-5 w-5 text-yellow-500" />
          </CardTitle>
        </CardHeader>
        <CardContent className="animate-pulse space-y-3">
          <div className="h-14 rounded-lg bg-muted" />
          <div className="h-14 rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (performance.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Performance da Equipe
          <Trophy className="h-5 w-5 text-yellow-500" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {performance.slice(0, 5).map((item, index) => (
            <div
              key={item.broker.id}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar>
                    <AvatarFallback className="bg-brand text-brand-foreground dark:bg-brand-dark">
                      {item.broker.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {index === 0 && (
                    <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500">
                      <Trophy className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">{item.broker.name}</p>
                  <Badge variant="secondary" className="text-xs">
                    {item.sold} venda(s) • {item.conversionRate}%
                  </Badge>
                </div>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{formatCurrency(item.totalValue)}</p>
                <p className="text-xs text-muted-foreground">{item.totalDeals} deal(s)</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
