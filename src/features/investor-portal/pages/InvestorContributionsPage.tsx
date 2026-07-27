import { useState } from 'react';
import { DollarSign, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { InvestorNotLinkedState } from '@/features/investor-portal/components/InvestorNotLinkedState';
import { useMyInvestor } from '@/features/investor-portal/hooks';
import { CONTRIBUTION_STATUS_CONFIG, CONTRIBUTION_TYPE_LABELS, formatCurrency } from '@/features/investors/constants';
import { useInvestmentContributions } from '@/features/investors/hooks';
import type { InvestmentContributionStatus } from '@/features/investors/types';
import { useProjects } from '@/features/projects/hooks';

/**
 * Tradução de `original-project/src/pages/InvestorContributions.jsx` —
 * "Meus Aportes", só leitura (o original não tem nenhuma mutation nesta
 * tela — sem criar/editar/excluir, diferente de `InvestmentContributionsListPage`,
 * a versão admin desta mesma tabela). Colunas/estilo de tabela e
 * busca/filtro reaproveitados de `InvestmentContributionsListPage` (sem a
 * coluna "Investidor" — sempre o próprio usuário logado — e sem a coluna
 * "Ações"); o card de totais ("Total Aportado"/"Número de Aportes") é fiel
 * ao original.
 *
 * `useInvestmentContributions()` é a MESMA query do lado admin — a RLS
 * (`0055_rls_investor_portal.sql`) já devolve só os PRÓPRIOS aportes do
 * investidor autenticado, sem precisar filtrar por `investor_id` aqui
 * (mesma simplificação do resto do Portal do Investidor).
 */
export function InvestorContributionsPage() {
  const { data: investor, isLoading: isLoadingInvestor, isError: isErrorInvestor, refetch: refetchInvestor } = useMyInvestor();
  const { data: contributions, isLoading: isLoadingContributions, isError: isErrorContributions, refetch: refetchContributions } =
    useInvestmentContributions();
  const { data: projects } = useProjects();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvestmentContributionStatus | 'all'>('all');

  const isLoading = isLoadingInvestor || (Boolean(investor) && isLoadingContributions);
  const isError = isErrorInvestor || isErrorContributions;

  function refetchAll() {
    void refetchInvestor();
    void refetchContributions();
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={refetchAll} />;
  if (!investor) return <InvestorNotLinkedState />;

  const allProjects = projects ?? [];
  const myContributions = (contributions ?? []).filter((c) => !c.is_deleted);

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function projectCode(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.code ?? '';
  }

  const totalAportado = myContributions.filter((c) => c.status === 'CONFIRMADO').reduce((sum, c) => sum + c.valor, 0);
  const numAportes = myContributions.filter((c) => c.status === 'CONFIRMADO').length;

  const filteredContributions = myContributions
    .filter((c) => {
      const term = search.toLowerCase();
      const matchesSearch = projectName(c.project_id).toLowerCase().includes(term) || projectCode(c.project_id).toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="Meus Aportes" subtitle="Histórico de investimentos realizados" />

      {myContributions.length > 0 && (
        <Card className="border-0 bg-gradient-to-r from-blue-50 to-slate-50 shadow-sm">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-sm text-slate-600">Total Aportado</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalAportado)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-slate-600">Número de Aportes</p>
                <p className="text-2xl font-bold text-foreground">{numAportes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {myContributions.length === 0 ? (
        <EmptyState icon={DollarSign} title="Nenhum aporte registrado" description="Você não realizou nenhum aporte ainda" />
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar por projeto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvestmentContributionStatus | 'all')}>
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(CONTRIBUTION_STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContributions.map((contribution) => (
                    <TableRow key={contribution.id}>
                      <TableCell className="text-sm text-muted-foreground">{new Date(contribution.data).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{projectName(contribution.project_id)}</p>
                        <p className="text-sm text-muted-foreground">{projectCode(contribution.project_id)}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(contribution.valor)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CONTRIBUTION_TYPE_LABELS[contribution.tipo]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${CONTRIBUTION_STATUS_CONFIG[contribution.status].color} text-white`}>
                          {CONTRIBUTION_STATUS_CONFIG[contribution.status].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
