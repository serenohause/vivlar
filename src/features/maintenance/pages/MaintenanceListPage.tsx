import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Search, Trash2, Wrench } from 'lucide-react';
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
import { useClients } from '@/features/clients/hooks';
import { useDeals } from '@/features/deals/hooks';
import { MaintenanceFormDialog } from '@/features/maintenance/components/MaintenanceFormDialog';
import { MaintenancePriorityBadge } from '@/features/maintenance/components/MaintenancePriorityBadge';
import { MaintenanceStatusBadge } from '@/features/maintenance/components/MaintenanceStatusBadge';
import { MAINTENANCE_PRIORITY_FILTER_ORDER, MAINTENANCE_STATUS_FILTER_ORDER } from '@/features/maintenance/constants';
import { useMaintenanceRequests, useSoftDeleteMaintenanceRequest } from '@/features/maintenance/hooks';
import { MAINTENANCE_CATEGORY_OPTIONS } from '@/features/maintenance/types';
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/features/maintenance/types';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/AdminMaintenance.jsx` — lista de
 * chamados de manutenção pós-entrega, com KPIs, filtros, tabela e dialog de
 * criação. Diferenças documentadas em relação ao original:
 *
 * - Sem geração de PDF (`FileDown`/dialog de exportação) — fora de escopo
 *   desta leva, registrado como débito técnico.
 * - Sem coluna "Criado Por" distinguindo cliente/operador: sem portal do
 *   cliente no projeto ainda, todo chamado nasce de um operador interno
 *   (`client_id` é só referência de para quem é o chamado, ver comentário
 *   no topo de `0037_maintenance_requests.sql`) — a distinção do original
 *   não se aplica.
 * - Coluna "Responsável" mostra o e-mail do usuário logado quando ele é o
 *   responsável da linha, "—" caso contrário — mesma limitação já
 *   documentada em `InspectionsListPage` (`tenant_users` não expõe nome/
 *   e-mail de outros usuários do tenant ao frontend).
 * - Exclusão restrita a `tenantRole === 'admin'` na UI (mesmo critério de
 *   `isAdmin` no original) — RLS permite update/soft-delete a
 *   admin/comercial/administrativo (defesa em profundidade menos
 *   restritiva que esta checagem de UI, ver `0039_rls_maintenance_requests.sql`).
 */
export function MaintenanceListPage() {
  const { user, tenantRole } = useAuth();
  const { data: requests, isLoading, isError, refetch } = useMaintenanceRequests();
  const { data: units } = useUnits();
  const { data: projects } = useProjects();
  const { data: clients } = useClients();
  const { data: deals } = useDeals();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<MaintenancePriority | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MaintenanceRequest | null>(null);

  const softDelete = useSoftDeleteMaintenanceRequest();

  const allRequests = requests ?? [];
  const allUnits = units ?? [];
  const allProjects = projects ?? [];
  const allClients = clients ?? [];

  function unitSku(unitId: string): string {
    return allUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function clientName(clientId: string): string {
    return allClients.find((c) => c.id === clientId)?.name ?? '—';
  }

  function responsibleLabel(responsibleUserId: string | null): string {
    if (!responsibleUserId) return '—';
    return responsibleUserId === user?.id ? (user?.email ?? '—') : '—';
  }

  const filteredRequests = allRequests.filter((request) => {
    const search_ = search.toLowerCase();
    const matchesSearch =
      request.title.toLowerCase().includes(search_) ||
      clientName(request.client_id).toLowerCase().includes(search_) ||
      unitSku(request.unit_id).toLowerCase().includes(search_);
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || request.category === categoryFilter;
    const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;
    const matchesProject = projectFilter === 'all' || request.project_id === projectFilter;
    return matchesSearch && matchesStatus && matchesCategory && matchesPriority && matchesProject;
  });

  // KPIs -- fiel a `AdminMaintenance.jsx` (linhas 270-285).
  const openCount = allRequests.filter((r) => r.status === 'aberto').length;
  const scheduledCount = allRequests.filter((r) => r.status === 'agendado').length;
  const inProgressCount = allRequests.filter((r) => r.status === 'em_andamento').length;
  const waitingClientCount = allRequests.filter((r) => r.status === 'aguardando_cliente').length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const resolvedCount = allRequests.filter((r) => r.status === 'resolvido' && new Date(r.created_at) >= thirtyDaysAgo).length;
  const cancelledCount = allRequests.filter((r) => r.status === 'cancelado' && new Date(r.created_at) >= thirtyDaysAgo).length;

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Solicitação excluída com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir solicitação.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Manutenção"
        subtitle="Solicitações de manutenção dos clientes"
        actions={
          <Button variant="brand" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Solicitação
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Abertos', value: openCount, textClass: 'text-blue-600' },
          { label: 'Agendados', value: scheduledCount, textClass: 'text-purple-600' },
          { label: 'Em Andamento', value: inProgressCount, textClass: 'text-amber-600' },
          { label: 'Aguardando Cliente', value: waitingClientCount, textClass: 'text-orange-600' },
          { label: 'Resolvidos (30d)', value: resolvedCount, textClass: 'text-green-600' },
          { label: 'Cancelados (30d)', value: cancelledCount, textClass: 'text-slate-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className={`text-2xl font-bold ${stat.textClass}`}>{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MaintenanceStatus | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              {MAINTENANCE_STATUS_FILTER_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === 'aberto' && 'Aberto'}
                  {status === 'agendado' && 'Agendado'}
                  {status === 'em_andamento' && 'Em Andamento'}
                  {status === 'aguardando_cliente' && 'Aguardando Cliente'}
                  {status === 'resolvido' && 'Resolvido'}
                  {status === 'cancelado' && 'Cancelado'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Categorias</SelectItem>
              {MAINTENANCE_CATEGORY_OPTIONS.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as MaintenancePriority | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Prioridades</SelectItem>
              {MAINTENANCE_PRIORITY_FILTER_ORDER.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority === 'baixa' && 'Baixa'}
                  {priority === 'media' && 'Média'}
                  {priority === 'alta' && 'Alta'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Projetos</SelectItem>
              {allProjects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {filteredRequests.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Nenhuma solicitação encontrada"
          description="Comece criando uma nova solicitação de manutenção"
          action={() => setShowCreateDialog(true)}
          actionLabel="Nova Solicitação"
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Abertura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendamento</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm text-muted-foreground">{new Date(request.opened_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{clientName(request.client_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{projectName(request.project_id)}</TableCell>
                    <TableCell className="font-medium text-foreground">{unitSku(request.unit_id)}</TableCell>
                    <TableCell>{request.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{request.category}</TableCell>
                    <TableCell>
                      <MaintenancePriorityBadge priority={request.priority} />
                    </TableCell>
                    <TableCell>
                      <MaintenanceStatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {request.scheduled_date ? new Date(request.scheduled_date).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{responsibleLabel(request.responsible_user_id)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`${pageUrl('AdminMaintenance')}/${request.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {tenantRole === 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                            title="Excluir"
                            onClick={() => setDeleteConfirm(request)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <MaintenanceFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        clients={allClients}
        units={allUnits}
        projects={allProjects}
        deals={deals ?? []}
      />

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Solicitação?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Tem certeza que deseja excluir esta solicitação?</span>
              <span className="block font-medium text-foreground">{deleteConfirm?.title}</span>
              <span className="block text-sm text-muted-foreground">
                Essa ação remove a solicitação das listagens (exclusão lógica). Você pode restaurar apenas via suporte/admin.
              </span>
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
