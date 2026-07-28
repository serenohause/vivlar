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
import { ReturnCreateDialog } from '@/features/investors/components/ReturnCreateDialog';
import { ReturnEditDialog } from '@/features/investors/components/ReturnEditDialog';
import { formatCurrency, RETURN_STATUS_CONFIG, RETURN_TYPE_CONFIG } from '@/features/investors/constants';
import { useInvestmentReturns, useInvestors, useSoftDeleteInvestmentReturn } from '@/features/investors/hooks';
import type { InvestmentReturn, InvestmentReturnStatus, InvestmentReturnType } from '@/features/investors/types';
import { useProjects } from '@/features/projects/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/InvestmentReturns.jsx` — lista de
 * retornos (CRUD). Sem o card/alerta de "retornos legados sem
 * classificação" nem a migração automática (`migrateInvestmentReturns`) do
 * original: não existe dado legado nesta plataforma nova, `return_type` é
 * `not null` desde o primeiro registro (ver `0044_investment_returns.sql`).
 * Criar/editar/excluir restritos a `admin`, mesmo critério de
 * `InvestorsListPage`.
 */
export function InvestmentReturnsListPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: returns, isLoading, isError, refetch } = useInvestmentReturns();
  const { data: investors } = useInvestors();
  const { data: projects } = useProjects();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvestmentReturnStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<InvestmentReturnType | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<InvestmentReturn | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<InvestmentReturn | null>(null);

  const softDelete = useSoftDeleteInvestmentReturn();

  const allReturns = returns ?? [];
  const allInvestors = investors ?? [];
  const allProjects = projects ?? [];

  function investorName(investorId: string | null): string {
    if (!investorId) return 'Sem investidor';
    return allInvestors.find((i) => i.id === investorId)?.nome ?? '—';
  }

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  const filteredReturns = allReturns.filter((r) => {
    const term = search.toLowerCase();
    const matchesSearch = investorName(r.investor_id).toLowerCase().includes(term) || projectName(r.project_id).toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesType = typeFilter === 'all' || r.return_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Retorno excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir retorno.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retornos"
        subtitle="Distribuições aos investidores"
        actions={
          isAdmin && (
            <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Retorno
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

      {filteredReturns.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="Nenhum retorno encontrado"
          description="Comece adicionando um novo retorno"
          action={isAdmin ? () => setIsCreateOpen(true) : undefined}
          actionLabel={isAdmin ? 'Novo Retorno' : undefined}
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo de Retorno</TableHead>
                  <TableHead>Investidor</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell className="text-sm text-muted-foreground">{new Date(ret.data).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <Badge className={`${RETURN_TYPE_CONFIG[ret.return_type].color} text-white`}>{RETURN_TYPE_CONFIG[ret.return_type].label}</Badge>
                    </TableCell>
                    <TableCell>{investorName(ret.investor_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{projectName(ret.project_id)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(ret.valor)}</TableCell>
                    <TableCell>
                      <Badge className={`${RETURN_STATUS_CONFIG[ret.status].color} text-white`}>{RETURN_STATUS_CONFIG[ret.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`${pageUrl('InvestmentReturns')}/${ret.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {isAdmin && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setEditingReturn(ret)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Excluir"
                              onClick={() => setDeleteConfirm(ret)}
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

      {isAdmin && <ReturnCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} investors={allInvestors} projects={allProjects} />}

      {isAdmin && editingReturn && (
        <ReturnEditDialog
          investmentReturn={editingReturn}
          open={Boolean(editingReturn)}
          onOpenChange={(open) => !open && setEditingReturn(null)}
          investors={allInvestors}
          projects={allProjects}
        />
      )}

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Retorno?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este retorno de {formatCurrency(deleteConfirm?.valor)}? Esta ação remove o
              retorno das listagens (exclusão lógica).
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
