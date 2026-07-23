import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit2, Eye, Plus, Search, Trash2, Users } from 'lucide-react';
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
import { InvestorCreateDialog } from '@/features/investors/components/InvestorCreateDialog';
import { InvestorEditDialog } from '@/features/investors/components/InvestorEditDialog';
import { INVESTOR_STATUS_CONFIG, INVESTOR_TYPE_LABELS } from '@/features/investors/constants';
import { useInvestors, useSoftDeleteInvestor } from '@/features/investors/hooks';
import type { Investor, InvestorStatus } from '@/features/investors/types';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/Investors.jsx` — lista de
 * investidores (CRUD). Diferente do original (que libera criar/editar/
 * excluir para qualquer usuário logado, sem checagem de papel — o app
 * antigo não tinha controle de acesso por role): aqui só `admin` vê os
 * botões de criar/editar/excluir, fiel à decisão de RLS registrada em
 * `0045_rls_investors.sql` ("dados de dinheiro de terceiros... só admin
 * deveria conseguir gerenciar isso" — pedido explícito do usuário).
 * `comercial`/`administrativo` continuam enxergando a lista (leitura), sem
 * nenhuma ação de escrita.
 */
export function InvestorsListPage() {
  const { tenantRole } = useAuth();
  const { data: investors, isLoading, isError, refetch } = useInvestors();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvestorStatus | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Investor | null>(null);

  const softDelete = useSoftDeleteInvestor();
  const isAdmin = tenantRole === 'admin';

  const allInvestors = investors ?? [];

  const filteredInvestors = allInvestors.filter((investor) => {
    const matchesSearch =
      investor.nome.toLowerCase().includes(search.toLowerCase()) || Boolean(investor.documento?.includes(search));
    const matchesStatus = statusFilter === 'all' || investor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Investidor excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir investidor.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investidores"
        subtitle="Gestão de investidores"
        actions={
          isAdmin && (
            <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Investidor
            </Button>
          )
        }
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou documento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvestorStatus | 'all')}>
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ATIVO">Ativo</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredInvestors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum investidor encontrado"
          description="Comece adicionando um novo investidor"
          action={isAdmin ? () => setIsCreateOpen(true) : undefined}
          actionLabel={isAdmin ? 'Novo Investidor' : undefined}
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvestors.map((investor) => (
                  <TableRow key={investor.id}>
                    <TableCell className="font-medium text-foreground">{investor.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{investor.documento || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{INVESTOR_TYPE_LABELS[investor.tipo]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{investor.email || investor.telefone || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`${INVESTOR_STATUS_CONFIG[investor.status].color} text-white`}>
                        {INVESTOR_STATUS_CONFIG[investor.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`${pageUrl('Investors')}/${investor.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Editar"
                              onClick={() => setEditingInvestor(investor)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Excluir"
                              onClick={() => setDeleteConfirm(investor)}
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

      {isAdmin && <InvestorCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />}

      {isAdmin && editingInvestor && (
        <InvestorEditDialog investor={editingInvestor} open={Boolean(editingInvestor)} onOpenChange={(open) => !open && setEditingInvestor(null)} />
      )}

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Investidor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.nome}</strong>? Esta ação remove o investidor das
              listagens (exclusão lógica).
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
