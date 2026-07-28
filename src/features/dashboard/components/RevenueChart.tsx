import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/features/finance/constants';
import { useAllPaymentInstallments } from '@/features/finance/hooks';
import type { PaymentInstallment } from '@/features/finance/types';

interface MonthBucket {
  year: number;
  monthIndex: number;
  label: string;
}

/** Últimos 6 meses corridos (incluindo o atual), do mais antigo ao mais recente. */
function getLast6Months(today: Date = new Date()): MonthBucket[] {
  const months: MonthBucket[] = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    });
  }

  return months;
}

interface RevenuePoint {
  month: string;
  previsto: number;
  realizado: number;
}

/**
 * Realizado (por mês, via `data_pagamento`) vs. Previsto (por mês, via
 * `vencimento`, todas as parcelas não canceladas — independente de já
 * pagas) dos últimos 6 meses. Cálculo diferente de `calculateMonthlyRevenue`
 * (`features/finance/utils.ts`, usada por `FinanceDashboardPage`): lá as
 * duas séries olham `vencimento` (recebido = parcelas pagas com vencimento
 * no mês); aqui "Realizado" olha `data_pagamento` — o mês em que o dinheiro
 * de fato entrou, não o mês em que a parcela venceu. As duas leituras são
 * legítimas para perguntas diferentes; mantidas separadas em vez de
 * unificadas para não mudar o KPI já existente do Financeiro.
 */
function calculateRevenueData(installments: PaymentInstallment[], today: Date = new Date()): RevenuePoint[] {
  return getLast6Months(today).map((month) => {
    const previsto = installments
      .filter((i) => {
        if (i.status === 'cancelado') return false;
        const vencimento = new Date(i.vencimento);
        return vencimento.getMonth() === month.monthIndex && vencimento.getFullYear() === month.year;
      })
      .reduce((sum, i) => sum + (i.valor_previsto || 0), 0);

    const realizado = installments
      .filter((i) => {
        if (i.status !== 'pago' || !i.data_pagamento) return false;
        const dataPagamento = new Date(i.data_pagamento);
        return dataPagamento.getMonth() === month.monthIndex && dataPagamento.getFullYear() === month.year;
      })
      .reduce((sum, i) => sum + (i.valor_pago ?? i.valor_previsto ?? 0), 0);

    return { month: month.label, previsto, realizado };
  });
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(value);
}

/**
 * Tradução de `original-project/src/components/dashboard/RevenueChart.jsx`
 * com dado real no lugar de `Math.random()`. O original tinha 3 séries
 * (`realizado`/`previsto`/`projetado`), todas geradas aleatoriamente em
 * `Dashboard.jsx` (linhas 66-77) — sem nenhuma lógica de negócio por trás.
 * "Realizado" e "Previsto" agora vêm de `payment_installments` (ver
 * `calculateRevenueData` acima); "Projetado" foi deliberadamente deixada de
 * fora — não existe, no domínio deste projeto, uma metodologia real de
 * projeção de receita futura equivalente (uma soma ingênua de parcelas a
 * vencer não é "projeção", e inventar uma fórmula só para preencher a
 * terceira linha reproduziria o mesmo problema do original, dado fake
 * travestido de dado real).
 */
export function RevenueChart() {
  const { data: installments, isLoading } = useAllPaymentInstallments();

  const data = calculateRevenueData(installments ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receita Mensal — Realizado vs Previsto</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-75 animate-pulse rounded-lg bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={formatCompact} />
              <Tooltip
                formatter={(value) => formatCurrency(typeof value === 'number' ? value : Number(value))}
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />

              <Area type="monotone" dataKey="previsto" stroke="#94a3b8" fill="#e2e8f0" name="Previsto" />

              <Line
                type="monotone"
                dataKey="realizado"
                stroke="#22c55e"
                strokeWidth={3}
                name="Realizado"
                dot={{ fill: '#22c55e', r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
