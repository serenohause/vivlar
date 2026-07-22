import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, DollarSign, Eye, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useClients } from '@/features/clients/hooks';
import { formatCurrency } from '@/features/finance/constants';
import { useAllPaymentInstallments, useFinanceAccounts } from '@/features/finance/hooks';
import type { FinanceAccount, FinanceAccountStatus } from '@/features/finance/types';
import { computeAccountTotals, computeInstallmentDisplayStatus, computeRecebidoNoMes } from '@/features/finance/utils';
import { FinanceAccountStatusBadge } from '@/features/finance/components/FinanceAccountStatusBadge';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

type AtrasoFilter = 'all' | 'sim' | 'nao';

/**
 * Tradução de `original-project/src/pages/Finance.jsx` — lista "Contas a
 * Receber" agrupada por unidade (uma unidade pode ter mais de uma
 * `finance_account` ao longo do tempo — distrato + nova venda, ver
 * comentário em `0019_finance_accounts.sql` — a linha usa a carteira "ativa"
 * como referência, ou a primeira, mesmo critério do original). Sem
 * alternância lista/kanban (não existe no original) e sem `PullToRefresh`
 * (React Query já refaz a query ao focar a aba).
 */
export function FinanceListPage() {
  const { data: accounts, isLoading: isLoadingAccounts, isError: isErrorAccounts, refetch: refetchAccounts } = useFinanceAccounts();
  const { data: allInstallments, isLoading: isLoadingInstallments, isError: isErrorInstallments } = useAllPaymentInstallments();
  const { data: units } = useUnits();
  const { data: clients } = useClients();
  const { data: projects } = useProjects();

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<FinanceAccountStatus | 'all'>('all');
  const [atrasoFilter, setAtrasoFilter] = useState<AtrasoFilter>('all');

  const isLoading = isLoadingAccounts || isLoadingInstallments;
  const isError = isErrorAccounts || isErrorInstallments;

  const allAccounts = accounts ?? [];
  const allUnits = units ?? [];
  const allClients = clients ?? [];
  const allProjects = projects ?? [];
  // Parcelas canceladas continuam na lista bruta (`is_deleted = false`),
  // mesmo padrão de `Finance.jsx` (`installments = allInstallments.filter(i
  // => !i.is_deleted && i.status !== "CANCELADO")`) — excluídas aqui, antes
  // de qualquer cálculo de KPI/agrupamento.
  const validInstallments = useMemo(() => (allInstallments ?? []).filter((i) => i.status !== 'cancelado'), [allInstallments]);

  const totalRecebidoMes = useMemo(() => computeRecebidoNoMes(validInstallments), [validInstallments]);
  const globalTotals = useMemo(() => computeAccountTotals(validInstallments), [validInstallments]);

  const unitsWithFinance = useMemo(() => {
    const byUnit = new Map<string, FinanceAccount[]>();
    for (const account of allAccounts) {
      const list = byUnit.get(account.unit_id) ?? [];
      list.push(account);
      byUnit.set(account.unit_id, list);
    }

    return Array.from(byUnit.entries()).map(([unitId, unitAccounts]) => {
      const unit = allUnits.find((u) => u.id === unitId);
      const primaryAccount = unitAccounts.find((a) => a.status === 'ativa') ?? unitAccounts[0];
      const client = allClients.find((c) => c.id === primaryAccount.client_id);
      const project = allProjects.find((p) => p.id === primaryAccount.project_id);
      const unitInstallments = validInstallments.filter((i) => i.unit_id === unitId);
      const totals = computeAccountTotals(unitInstallments);
      const hasAtraso = unitInstallments.some((i) => computeInstallmentDisplayStatus(i) === 'em_atraso');

      return { unitId, unit, client, project, primaryAccount, totals, hasAtraso };
    });
  }, [allAccounts, allUnits, allClients, allProjects, validInstallments]);

  const filteredUnits = unitsWithFinance.filter((row) => {
    const matchesSearch =
      search === '' ||
      row.unit?.sku?.toLowerCase().includes(search.toLowerCase()) ||
      row.client?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesProject = projectFilter === 'all' || row.project?.id === projectFilter;
    const matchesStatus = statusFilter === 'all' || row.primaryAccount.status === statusFilter;
    const matchesAtraso = atrasoFilter === 'all' || (atrasoFilter === 'sim' && row.hasAtraso) || (atrasoFilter === 'nao' && !row.hasAtraso);
    return matchesSearch && matchesProject && matchesStatus && matchesAtraso;
  });

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetchAccounts()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Financeiro" subtitle="Contas a receber — acompanhamento de pagamentos" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Recebido (Mês)</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRecebidoMes)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Em Aberto</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(globalTotals.totalEmAberto)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Atrasado</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(globalTotals.totalAtrasado)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex items-start justify-between pt-6">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Parcelas em Atraso</p>
              <p className="text-2xl font-bold text-foreground">{globalTotals.qtdAtrasadas}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Input placeholder="Buscar unidade ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Projetos</SelectItem>
                {allProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FinanceAccountStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={atrasoFilter} onValueChange={(value) => setAtrasoFilter(value as AtrasoFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Atraso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sim">Com Atraso</SelectItem>
                <SelectItem value="nao">Sem Atraso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {filteredUnits.length === 0 ? (
            <EmptyState icon={DollarSign} title="Nenhuma carteira financeira encontrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">Total Venda</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Em Aberto</TableHead>
                  <TableHead className="text-right">Atrasado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnits.map((row) => (
                  <TableRow key={row.unitId}>
                    <TableCell className="font-medium">{row.unit?.sku ?? '—'}</TableCell>
                    <TableCell>{row.client?.name ?? '—'}</TableCell>
                    <TableCell>{row.project?.name ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.primaryAccount.valor_venda_total)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatCurrency(row.totals.totalPago)}</TableCell>
                    <TableCell className="text-right text-orange-600">{formatCurrency(row.totals.totalEmAberto)}</TableCell>
                    <TableCell className="text-right font-medium text-red-600">{formatCurrency(row.totals.totalAtrasado)}</TableCell>
                    <TableCell>
                      <FinanceAccountStatusBadge status={row.primaryAccount.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`${pageUrl('Finance')}/${row.primaryAccount.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="mr-1 h-4 w-4" />
                          Ver
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
