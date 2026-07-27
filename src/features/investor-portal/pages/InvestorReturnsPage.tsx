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
import { formatCurrency, RETURN_STATUS_CONFIG, RETURN_TYPE_CONFIG } from '@/features/investors/constants';
import { useInvestmentReturns } from '@/features/investors/hooks';
import type { InvestmentReturnStatus, InvestmentReturnType } from '@/features/investors/types';
import { useProjects } from '@/features/projects/hooks';

/**
 * Tradução de `original-project/src/pages/InvestorReturns.jsx` — "Meus
 * Retornos", só leitura (mesmo critério de `InvestorContributionsPage`: o
 * original não tem nenhuma mutation nesta tela). Colunas/estilo de tabela e
 * busca/filtro reaproveitados de `InvestmentReturnsListPage` (sem a coluna
 * "Investidor" — sempre o próprio usuário logado — e sem a coluna "Ações");
 * o card de totais ("Total Recebido"/"Número de Retornos") é fiel ao
 * original.
 *
 * `useInvestmentReturns()` é a MESMA query do lado admin — a RLS
 * (`0055_rls_investor_portal.sql`) já devolve só os PRÓPRIOS retornos do
 * investidor autenticado, sem precisar filtrar por `investor_id` aqui.
 */
export function InvestorReturnsPage() {
  const { data: investor, isLoading: isLoadingInvestor, isError: isErrorInvestor, refetch: refetchInvestor } = useMyInvestor();
  const { data: returns, isLoading: isLoadingReturns, isError: isErrorReturns, refetch: refetchReturns } = useInvestmentReturns();
  const { data: projects } = useProjects();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvestmentReturnStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<InvestmentReturnType | 'all'>('all');

  const isLoading = isLoadingInvestor || (Boolean(investor) && isLoadingReturns);
  const isError = isErrorInvestor || isErrorReturns;

  function refetchAll() {
    void refetchInvestor();
    void refetchReturns();
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={refetchAll} />;
  if (!investor) return <InvestorNotLinkedState />;

  const allProjects = projects ?? [];
  const myReturns = (returns ?? []).filter((r) => !r.is_deleted);

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function projectCode(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.code ?? '';
  }

  const totalRecebido = myReturns.filter((r) => r.status === 'PAGO').reduce((sum, r) => sum + r.valor, 0);
  const numRetornos = myReturns.filter((r) => r.status === 'PAGO').length;

  const filteredReturns = myReturns
    .filter((r) => {
      const term = search.toLowerCase();
      const matchesSearch = projectName(r.project_id).toLowerCase().includes(term) || projectCode(r.project_id).toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesType = typeFilter === 'all' || r.return_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="Meus Retornos" subtitle="Dividendos e retornos recebidos" />

      {myReturns.length > 0 && (
        <Card className="border-0 bg-gradient-to-r from-green-50 to-slate-50 shadow-sm">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-sm text-slate-600">Total Recebido</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-slate-600">Número de Retornos</p>
                <p className="text-2xl font-bold text-foreground">{numRetornos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {myReturns.length === 0 ? (
        <EmptyState icon={DollarSign} title="Nenhum retorno registrado" description="Você não recebeu retornos ainda" />
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar por projeto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as InvestmentReturnType | 'all')}>
                  <SelectTrigger className="w-full lg:w-56">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    {Object.entries(RETURN_TYPE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvestmentReturnStatus | 'all')}>
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(RETURN_STATUS_CONFIG).map(([key, config]) => (
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
                    <TableHead>Tipo de Retorno</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell className="text-sm text-muted-foreground">{new Date(ret.data).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge className={`${RETURN_TYPE_CONFIG[ret.return_type].color} text-white`}>{RETURN_TYPE_CONFIG[ret.return_type].label}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{projectName(ret.project_id)}</p>
                        <p className="text-sm text-muted-foreground">{projectCode(ret.project_id)}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(ret.valor)}</TableCell>
                      <TableCell>
                        <Badge className={`${RETURN_STATUS_CONFIG[ret.status].color} text-white`}>{RETURN_STATUS_CONFIG[ret.status].label}</Badge>
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
