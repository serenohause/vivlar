import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FINANCING_STATUS_CONFIG, formatCurrency, INSTALLMENT_STATUS_CONFIG, INSTALLMENT_TYPE_LABELS } from '@/features/finance/constants';
import { useFinancingProcesses, usePaymentInstallments } from '@/features/finance/hooks';
import type { FinanceAccount } from '@/features/finance/types';
import { computeAccountTotals } from '@/features/finance/utils';
import type { Unit } from '@/features/units/types';

interface ClientFinanceAccountCardProps {
  account: FinanceAccount;
  unit: Unit | undefined;
}

/**
 * Um bloco "Resumo + Parcelas + Financiamento" da carteira financeira do
 * cliente — tradução do `accounts.map(...)` de `ClientFinance.jsx`
 * (original), extraído em componente próprio porque cada carteira precisa
 * das próprias `usePaymentInstallments`/`useFinancingProcesses` (hooks não
 * podem ser chamados dentro de um `.map()` no componente pai — regra dos
 * hooks do React).
 *
 * Mesmos cálculos do lado admin (`FinanceAccountDetailPage`, via
 * `computeAccountTotals`) — "Saldo em Aberto" usa `totalEmAberto` (parcelas
 * ainda não pagas, excluindo canceladas), não `valor_venda_total - totalPago`
 * (fiel ao original, que já fazia essa mesma conta a partir das parcelas).
 * Bloco "Financiamento" só aparece se existir ao menos um
 * `financing_process` para a conta — mostra só o mais recente (`[0]`,
 * `financing_processes` já vem ordenado por `created_at desc`), fiel a
 * `financing.filter(...)[0]` no original (cardinalidade não é 1:1 de
 * propósito, ver `FinancingProcess` em `features/finance/types.ts`).
 */
export function ClientFinanceAccountCard({ account, unit }: ClientFinanceAccountCardProps) {
  const { data: installments, isLoading: isLoadingInstallments } = usePaymentInstallments(account.id);
  const { data: financingProcesses, isLoading: isLoadingFinancing } = useFinancingProcesses(account.id);

  const allInstallments = installments ?? [];
  const totals = useMemo(() => computeAccountTotals(allInstallments), [allInstallments]);
  const financing = (financingProcesses ?? [])[0];

  if (isLoadingInstallments || isLoadingFinancing) {
    return <LoadingInline />;
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Resumo Financeiro - {unit?.sku ?? '—'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-4">
            <div>
              <p className="mb-1 text-sm text-slate-500">Valor da Venda</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(account.valor_venda_total)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-slate-500">Total Pago</p>
              <p className="text-lg font-semibold text-green-600">{formatCurrency(totals.totalPago)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-slate-500">Saldo em Aberto</p>
              <p className="text-lg font-semibold text-orange-600">{formatCurrency(totals.totalEmAberto)}</p>
            </div>
            <div>
              <p className="mb-1 text-sm text-slate-500">% Quitado</p>
              <p className="text-lg font-semibold text-blue-600">{totals.percentualQuitado.toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Parcelas</CardTitle>
        </CardHeader>
        <CardContent>
          {allInstallments.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <p>Nenhuma parcela cadastrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allInstallments.map((installment) => (
                    <TableRow key={installment.id}>
                      <TableCell>{INSTALLMENT_TYPE_LABELS[installment.tipo]}</TableCell>
                      <TableCell>{installment.descricao || '—'}</TableCell>
                      <TableCell>{new Date(installment.vencimento).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(installment.valor_previsto)}</TableCell>
                      <TableCell>
                        <Badge className={`${INSTALLMENT_STATUS_CONFIG[installment.status].color} text-white`}>
                          {INSTALLMENT_STATUS_CONFIG[installment.status].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {financing && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Financiamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="mb-1 text-sm text-slate-500">Banco</p>
                <p className="font-semibold">{financing.banco || '—'}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-slate-500">Status</p>
                <Badge className={`${FINANCING_STATUS_CONFIG[financing.status].color} text-white`}>
                  {FINANCING_STATUS_CONFIG[financing.status].label}
                </Badge>
              </div>
              {financing.valor_aprovado != null && (
                <div>
                  <p className="mb-1 text-sm text-slate-500">Valor Aprovado</p>
                  <p className="font-semibold text-green-600">{formatCurrency(financing.valor_aprovado)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
