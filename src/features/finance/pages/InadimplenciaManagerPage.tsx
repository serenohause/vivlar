import { useMemo } from 'react';
import { AlertTriangle, Clock, DollarSign } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useClients } from '@/features/clients/hooks';
import { formatCurrency } from '@/features/finance/constants';
import { useOverdueInstallments } from '@/features/finance/hooks';
import { CobrancaActions } from '@/features/finance/components/CobrancaActions';
import { UltimaAcaoCobranca } from '@/features/finance/components/UltimaAcaoCobranca';
import { getDiasAtraso, groupOverdueByAging } from '@/features/finance/utils';
import { useUnits } from '@/features/units/hooks';

/** Cor do badge "dias de atraso" — tradução das classes condicionais do `<Badge variant="destructive">` de `InadimplenciaManager.jsx`. */
function diasAtrasoBadgeClass(dias: number): string {
  if (dias > 30) return 'bg-red-700';
  if (dias > 15) return 'bg-red-600';
  if (dias > 7) return 'bg-orange-600';
  return 'bg-yellow-600';
}

/**
 * Tradução de `original-project/src/pages/InadimplenciaManager.jsx` —
 * "Gestão de Inadimplência". Sem o botão "Executar Automação"
 * (`executarAutomacaoMutation` -> `inadimplenciaAutomation`) nem o
 * escalonamento automático por trás dele: fora de escopo nesta leva,
 * confirmado com o usuário — só o registro manual de ações de cobrança
 * (ver `CobrancaActions`).
 */
export function InadimplenciaManagerPage() {
  const { data: overdueInstallments, isLoading: isLoadingInstallments, isError: isErrorInstallments, refetch } = useOverdueInstallments();
  const { data: clients } = useClients();
  const { data: units } = useUnits();

  const allClients = clients ?? [];
  const allUnits = units ?? [];
  const atrasadas = overdueInstallments ?? [];

  const porFaixa = useMemo(() => groupOverdueByAging(atrasadas), [atrasadas]);

  const ordenadas = useMemo(() => [...atrasadas].sort((a, b) => getDiasAtraso(b) - getDiasAtraso(a)), [atrasadas]);

  function getClient(installmentClientId: string) {
    return allClients.find((c) => c.id === installmentClientId);
  }

  function getUnitSku(unitId: string) {
    return allUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  if (isLoadingInstallments) {
    return <LoadingInline />;
  }

  if (isErrorInstallments) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Gestão de Inadimplência" subtitle="Controle e ações manuais de cobrança" backTo="Finance" />

      {/* KPIs por faixa de atraso */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">1-7 dias</div>
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">{porFaixa['1-7'].length}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(porFaixa['1-7'].reduce((sum, i) => sum + i.valor_previsto, 0))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">8-15 dias</div>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-orange-600">{porFaixa['8-15'].length}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(porFaixa['8-15'].reduce((sum, i) => sum + i.valor_previsto, 0))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">16-30 dias</div>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-600">{porFaixa['16-30'].length}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(porFaixa['16-30'].reduce((sum, i) => sum + i.valor_previsto, 0))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">30+ dias</div>
              <DollarSign className="h-4 w-4 text-red-700" />
            </div>
            <div className="text-2xl font-bold text-red-700">{porFaixa['30+'].length}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(porFaixa['30+'].reduce((sum, i) => sum + i.valor_previsto, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Inadimplentes */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Parcelas em Atraso</CardTitle>
        </CardHeader>
        <CardContent>
          {ordenadas.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="Nenhuma parcela em atraso" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Dias Atraso</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Última Ação</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenadas.map((installment) => (
                    <TableRow key={installment.id}>
                      <TableCell className="font-medium">{getClient(installment.client_id)?.name ?? '—'}</TableCell>
                      <TableCell>{getUnitSku(installment.unit_id)}</TableCell>
                      <TableCell>{new Date(installment.vencimento).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge className={`${diasAtrasoBadgeClass(getDiasAtraso(installment))} text-white`}>
                          {getDiasAtraso(installment)} dias
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(installment.valor_previsto)}</TableCell>
                      <TableCell>
                        <UltimaAcaoCobranca installmentId={installment.id} />
                      </TableCell>
                      <TableCell>
                        <CobrancaActions installmentId={installment.id} client={getClient(installment.client_id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
