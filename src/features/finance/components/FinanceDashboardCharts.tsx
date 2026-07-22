import { formatCurrency } from '@/features/finance/constants';
import type { MonthlyDefaultPoint, MonthlyRevenuePoint, PaymentMixPoint, RevenueByProjectPoint } from '@/features/finance/utils';

/**
 * Gráficos de `FinanceDashboardPage` — tradução dos 4 gráficos `recharts` de
 * `original-project/src/pages/FinanceDashboard.jsx` para CSS puro. `recharts`
 * não está instalado neste projeto e não foi adicionado só para esta tela
 * (confirmado antes de codar) — mesma decisão/estilo já usada em
 * `features/dashboard/components/SalesFunnel.tsx` (barras simples, sem lib
 * de gráfico) para o funil de vendas do Dashboard Executivo.
 */

function ChartEmptyState() {
  return <p className="py-12 text-center text-sm text-muted-foreground">Sem dados no período selecionado.</p>;
}

/** Tradução do `<LineChart>` "Receita Mensal" (previsto vs. recebido) — aqui, colunas duplas por mês. */
export function MonthlyRevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.previsto, d.recebido)));
  const hasData = data.some((d) => d.previsto > 0 || d.recebido > 0);

  if (!hasData) return <ChartEmptyState />;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Previsto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Recebido
        </span>
      </div>
      <div className="flex h-56 items-end gap-2 overflow-x-auto">
        {data.map((point) => (
          <div key={point.mes} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
            <div className="flex h-44 items-end gap-0.5" title={`Previsto: ${formatCurrency(point.previsto)} · Recebido: ${formatCurrency(point.recebido)}`}>
              <div
                className="w-2.5 rounded-t-sm bg-slate-400 transition-all"
                style={{ height: `${(point.previsto / maxValue) * 100}%` }}
              />
              <div
                className="w-2.5 rounded-t-sm bg-green-500 transition-all"
                style={{ height: `${(point.recebido / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{point.mes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tradução do `<BarChart>` "Receita por Projeto" — barras horizontais, mesmo estilo de `SalesFunnel`. */
export function RevenueByProjectChart({ data }: { data: RevenueByProjectPoint[] }) {
  if (data.length === 0) return <ChartEmptyState />;

  const maxValue = Math.max(1, ...data.map((d) => d.valor));

  return (
    <div className="space-y-3">
      {data.map((point) => (
        <div key={point.projeto}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{point.projeto}</span>
            <span className="text-muted-foreground">{formatCurrency(point.valor)}</span>
          </div>
          <div className="relative h-6 overflow-hidden rounded-md bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-blue-500 transition-all duration-500"
              style={{ width: `${(point.valor / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tradução do `<PieChart>` "Formas de Pagamento" — barras horizontais com % do total (fiel às cores do original), em vez de pizza. */
export function PaymentMixChart({ data }: { data: PaymentMixPoint[] }) {
  if (data.length === 0) return <ChartEmptyState />;

  const total = data.reduce((sum, d) => sum + d.valor, 0);

  return (
    <div className="space-y-3">
      {data.map((point) => {
        const percent = total > 0 ? (point.valor / total) * 100 : 0;
        return (
          <div key={point.forma}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: point.color }} />
                {point.forma}
              </span>
              <span className="text-muted-foreground">
                {formatCurrency(point.valor)} ({percent.toFixed(0)}%)
              </span>
            </div>
            <div className="relative h-6 overflow-hidden rounded-md bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                style={{ width: `${percent}%`, backgroundColor: point.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Tradução do `<LineChart>` "Taxa de Inadimplência (%)" — colunas por mês, 0-100%. */
export function MonthlyDefaultRateChart({ data }: { data: MonthlyDefaultPoint[] }) {
  const hasData = data.some((d) => d.taxa > 0);
  if (!hasData) return <ChartEmptyState />;

  return (
    <div className="flex h-48 items-end gap-2 overflow-x-auto">
      {data.map((point) => (
        <div key={point.mes} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
          <div className="flex h-36 w-full items-end justify-center" title={`${point.taxa.toFixed(2)}%`}>
            <div className="w-3 rounded-t-sm bg-red-500 transition-all" style={{ height: `${Math.min(100, point.taxa)}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{point.mes}</span>
        </div>
      ))}
    </div>
  );
}
