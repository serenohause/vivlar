import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, DollarSign, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useBrokers } from '@/features/brokers/hooks';
import { useClients } from '@/features/clients/hooks';
import { CommissionStatusBadge } from '@/features/commissions/components/CommissionStatusBadge';
import { COMMISSION_STATUS_CONFIG, formatCurrency } from '@/features/commissions/constants';
import { useAllCommissionPayments, useCommissions } from '@/features/commissions/hooks';
import type { CommissionStatus } from '@/features/commissions/types';
import { computeCommissionPagoNoMes } from '@/features/commissions/utils';
import { useDeals } from '@/features/deals/hooks';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/Commissions.jsx` — lista de
 * comissões com filtros (busca/corretor/projeto/status) e KPIs. Sem a
 * checagem `hasAccess`/"Acesso Negado" do original: RLS já restringe
 * `commissions` a admin/comercial/administrativo (0027_rls_comissoes.sql)
 * — o frontend trata o erro de acesso via `ErrorState`, não reimplementa a
 * autorização (CLAUDE.md).
 */
export function CommissionsListPage() {
  const { data: commissions, isLoading: isLoadingCommissions, isError: isErrorCommissions, refetch } = useCommissions();
  const { data: allPayments, isLoading: isLoadingPayments, isError: isErrorPayments } = useAllCommissionPayments();
  const { data: brokers } = useBrokers();
  const { data: projects } = useProjects();
  const { data: deals } = useDeals();
  const { data: units } = useUnits();
  const { data: clients } = useClients();

  const [search, setSearch] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'all'>('all');

  const isLoading = isLoadingCommissions || isLoadingPayments;
  const isError = isErrorCommissions || isErrorPayments;

  const allCommissions = commissions ?? [];
  const allBrokers = brokers ?? [];
  const allProjects = projects ?? [];
  const allDeals = deals ?? [];
  const allUnits = units ?? [];
  const allClients = clients ?? [];

  function getBrokerName(brokerId: string): string {
    return allBrokers.find((b) => b.id === brokerId)?.name ?? '—';
  }

  function getProjectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function getUnitSku(unitId: string): string {
    return allUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  function getClientName(dealId: string): string {
    const deal = allDeals.find((d) => d.id === dealId);
    if (!deal) return '—';
    return allClients.find((c) => c.id === deal.client_id)?.name ?? '—';
  }

  function formatDate(date: string | null): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR');
  }

  const filteredCommissions = allCommissions.filter((commission) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      search === '' ||
      getBrokerName(commission.broker_id).toLowerCase().includes(searchLower) ||
      getProjectName(commission.project_id).toLowerCase().includes(searchLower) ||
      getClientName(commission.deal_id).toLowerCase().includes(searchLower);

    const matchesBroker = brokerFilter === 'all' || commission.broker_id === brokerFilter;
    const matchesProject = projectFilter === 'all' || commission.project_id === projectFilter;
    const matchesStatus = statusFilter === 'all' || commission.status === statusFilter;

    return matchesSearch && matchesBroker && matchesProject && matchesStatus;
  });

  const totalAPagar = useMemo(
    () =>
      allCommissions
        .filter((c) => c.status === 'a_pagar' || c.status === 'agendado')
        .reduce((sum, c) => sum + (c.gross_value ?? c.base_value ?? 0), 0),
    [allCommissions]
  );

  // KPI "Pago no Mês": derivado de `commission_payments.data_pagamento`, não
  // de `commissions.paid_at` (campo órfão, sem write path no original — ver
  // nota em `features/commissions/types.ts`).
  const totalPagoMes = useMemo(() => computeCommissionPagoNoMes(allPayments ?? []), [allPayments]);

  const totalComissoes = useMemo(() => allCommissions.reduce((sum, c) => sum + (c.gross_value ?? c.base_value ?? 0), 0), [allCommissions]);

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Comissões" subtitle="Gestão de pagamentos de comissões" />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">A Pagar</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalAPagar)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pago no Mês</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPagoMes)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Comissões</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalComissoes)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />

            <Select value={brokerFilter} onValueChange={setBrokerFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os corretores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os corretores</SelectItem>
                {allBrokers.map((broker) => (
                  <SelectItem key={broker.id} value={broker.id}>
                    {broker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os projetos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {allProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CommissionStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(COMMISSION_STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      {filteredCommissions.length === 0 ? (
        <EmptyState icon={DollarSign} title="Nenhuma comissão encontrada" description="Comissões são geradas automaticamente ao vender uma unidade" />
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Valor Base</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell className="font-medium">{getBrokerName(commission.broker_id)}</TableCell>
                    <TableCell>{getClientName(commission.deal_id)}</TableCell>
                    <TableCell>{getProjectName(commission.project_id)}</TableCell>
                    <TableCell>{getUnitSku(commission.unit_id)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(commission.base_value)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(commission.gross_value ?? commission.base_value)}</TableCell>
                    <TableCell>
                      <CommissionStatusBadge status={commission.status} />
                    </TableCell>
                    <TableCell>{formatDate(commission.due_date)}</TableCell>
                    <TableCell className="text-right">
                      <Link to={`${pageUrl('Commissions')}/${commission.id}`}>
                        <Button variant="ghost" size="sm">
                          Ver Detalhes
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
