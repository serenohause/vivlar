import { useState } from 'react';
import { DollarSign, Edit2, Eye, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { ContributionCreateDialog } from '@/features/investors/components/ContributionCreateDialog';
import { ContributionEditDialog } from '@/features/investors/components/ContributionEditDialog';
import { CONTRIBUTION_STATUS_CONFIG, CONTRIBUTION_TYPE_LABELS, formatCurrency } from '@/features/investors/constants';
import { useInvestmentContributions, useInvestors, useSoftDeleteInvestmentContribution } from '@/features/investors/hooks';
import type { InvestmentContribution, InvestmentContributionStatus } from '@/features/investors/types';
import { useProjects } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestmentContributions.jsx` —
 * lista de aportes (CRUD). Criar/editar/excluir restritos a `admin`, mesmo
 * critério de `InvestorsListPage` (ver racional em `0045_rls_investors.sql`).
 */
export function InvestmentContributionsListPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: contributions, isLoading, isError, refetch } = useInvestmentContributions();
  const { data: investors } = useInvestors();
  const { data: projects } = useProjects();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvestmentContributionStatus | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingContribution, setEditingContribution] = useState<InvestmentContribution | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<InvestmentContribution | null>(null);

  const softDelete = useSoftDeleteInvestmentContribution();

  const allContributions = contributions ?? [];
  const allInvestors = investors ?? [];
  const allProjects = projects ?? [];

  function investorName(investorId: string | null): string {
    if (!investorId) return 'Sem investidor';
    return allInvestors.find((i) => i.id === investorId)?.nome ?? '—';
  }

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  const filteredContributions = allContributions.filter((c) => {
    const term = search.toLowerCase();
    const matchesSearch = investorName(c.investor_id).toLowerCase().includes(term) || projectName(c.project_id).toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Aporte excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir aporte.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aportes"
        subtitle="Contribuições de investidores"
        actions={
          isAdmin && (
            <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Aporte
            </Button>
          )
        }
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por investidor ou projeto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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

      {filteredContributions.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="Nenhum aporte encontrado"
          description="Comece adicionando um novo aporte"
          action={isAdmin ? () => setIsCreateOpen(true) : undefined}
          actionLabel={isAdmin ? 'Novo Aporte' : undefined}
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Investidor</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContributions.map((contribution) => (
                  <TableRow key={contribution.id}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(contribution.data).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{investorName(contribution.investor_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{projectName(contribution.project_id)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(contribution.valor)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{CONTRIBUTION_TYPE_LABELS[contribution.tipo]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${CONTRIBUTION_STATUS_CONFIG[contribution.status].color} text-white`}>
                        {CONTRIBUTION_STATUS_CONFIG[contribution.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`${pageUrl('InvestmentContributions')}/${contribution.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setEditingContribution(contribution)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Excluir"
                              onClick={() => setDeleteConfirm(contribution)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {isAdmin && <ContributionCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} investors={allInvestors} projects={allProjects} />}

      {isAdmin && editingContribution && (
        <ContributionEditDialog
          contribution={editingContribution}
          open={Boolean(editingContribution)}
          onOpenChange={(open) => !open && setEditingContribution(null)}
          investors={allInvestors}
          projects={allProjects}
        />
      )}

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Aporte?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este aporte de {formatCurrency(deleteConfirm?.valor)}? Esta ação remove o
              aporte das listagens (exclusão lógica).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90" disabled={softDelete.isPending}>
              {softDelete.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
