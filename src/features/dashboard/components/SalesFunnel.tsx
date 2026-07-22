import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeals } from '@/features/deals/hooks';
import type { Deal, DealSalesStage } from '@/features/deals/types';
import { pageUrl } from '@/lib/page-url';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    value
  );
}

const FUNNEL_STAGES: { stage: DealSalesStage; label: string; color: string }[] = [
  { stage: 'lead', label: 'Lead', color: '#64748b' },
  { stage: 'qualificado', label: 'Qualificado', color: '#3b82f6' },
  { stage: 'proposta', label: 'Proposta', color: '#8b5cf6' },
  { stage: 'vendido', label: 'Vendido', color: '#22c55e' },
];

function stageValue(deals: Deal[]): number {
  return deals.reduce((sum, d) => sum + (d.final_sale_value ?? d.expected_sale_value ?? 0), 0);
}

/**
 * Tradução de `original-project/src/components/dashboard/SalesFunnelChart.jsx`
 * (barras simples, sem lib de gráfico). Uma diferença deliberada: o
 * original calculava o valor de cada estágio como `count * 300000` — um
 * placeholder inventado, não dado real (nem no código-fonte original é
 * receita de verdade). Aqui somamos `final_sale_value`/`expected_sale_value`
 * de verdade dos negócios de cada estágio, seguindo a mesma decisão já
 * tomada para o gráfico de receita (estado honesto em vez de número fake).
 */
export function SalesFunnel() {
  const { data: deals, isLoading } = useDeals();
  const navigate = useNavigate();

  if (isLoading || !deals) {
    return null;
  }

  const stages = FUNNEL_STAGES.map(({ stage, label, color }) => {
    const stageDeals = deals.filter((d) => d.sales_stage === stage && d.is_active);
    return { stage, label, color, count: stageDeals.length, value: stageValue(stageDeals) };
  });

  const totalValue = stages.reduce((sum, s) => sum + s.value, 0);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  if (stages.every((s) => s.count === 0)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Funil de Vendas</CardTitle>
          <div className="text-sm text-muted-foreground">
            Pipeline: <span className="font-semibold text-foreground">{formatCurrency(totalValue)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((s) => {
            const widthPercent = (s.count / maxCount) * 100;
            return (
              <div key={s.stage} className="cursor-pointer" onClick={() => navigate(pageUrl('CRM'))}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{s.count} deals</span>
                    <span className="font-medium text-foreground">{formatCurrency(s.value)}</span>
                  </div>
                </div>
                <div className="relative h-10 overflow-hidden rounded-lg bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                    style={{ width: `${widthPercent}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
