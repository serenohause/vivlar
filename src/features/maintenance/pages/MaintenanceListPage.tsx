import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Eye, FileDown, Plus, Search, Trash2, Wrench } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatsCard } from '@/components/shared/StatsCard';
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
import { exportMaintenanceReportToPdf, type MaintenanceReportMode } from '@/features/maintenance/utils/maintenance-report-pdf';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/AdminMaintenance.jsx` — lista de
 * chamados de manutenção pós-entrega, com KPIs, filtros, tabela, dialog de
 * criação e geração de relatório em PDF. Diferenças documentadas em relação
 * ao original:
 *
 * - Coluna "Criado Por" mostra "Cliente"/"Operador"/"—", sem o nome do
 *   operador embaixo (frontend não tem diretório de nome/e-mail de outros
 *   usuários do tenant — mesma limitação já documentada na coluna
 *   "Responsável" abaixo). O comentário anterior deste arquivo dizia que
 *   essa distinção "não se aplica" por falta de portal do cliente — isso
 *   estava desatualizado: o Portal do Cliente (módulo 11) já existe e já
 *   cria chamados de verdade (`ClientMaintenanceCreateDialog`, grava
 *   `created_by_user_id`).
 * - Relatório PDF (`exportMaintenanceReportToPdf`, `utils/maintenance-report-pdf.ts`)
 *   mostra só o e-mail de quem gerou (`useAuth().user?.email`) em vez de
 *   "nome (email)" do original — mesma limitação de nome de usuário citada
 *   acima.
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
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportMode, setExportMode] = useState<MaintenanceReportMode>('resumo');
  const [isExporting, setIsExporting] = useState(false);

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

  /**
   * Badge "Cliente"/"Operador" da coluna "Criado Por" — mesma checagem do
   * original (`clients.find(c => c.user_id === request.created_by_user_id)`),
   * sem o nome do operador embaixo (ver comentário de topo do arquivo).
   */
  function createdByBadge(request: MaintenanceRequest) {
    const createdByClient = allClients.find((c) => c.user_id === request.created_by_user_id);
    if (createdByClient) {
      return (
        <Badge variant="outline" className="border-pink-200 bg-pink-50 text-pink-700">
          Cliente
        </Badge>
      );
    }
    if (request.created_by_user_id) {
      return (
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
          Operador
        </Badge>
      );
    }
    return <span className="text-muted-foreground">—</span>;
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

  async function handleExportReport() {
    setIsExporting(true);
    try {
      await exportMaintenanceReportToPdf({
        requests: filteredRequests,
        mode: exportMode,
        filters: {
          status: statusFilter,
          category: categoryFilter,
          priority: priorityFilter,
          project: projectFilter,
          projectName: projectFilter !== 'all' ? projectName(projectFilter) : null,
          search,
        },
        generatedByEmail: user?.email ?? '—',
        generatedAt: new Date().toISOString(),
        getters: {
          getClientName: clientName,
          getProjectName: projectName,
          getUnitSKU: unitSku,
          getResponsibleName: responsibleLabel,
          clients: allClients,
        },
      });

      toast.success('Relatório PDF exportado com sucesso!');
      setShowExportDialog(false);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Manutenção"
        subtitle="Solicitações de manutenção dos clientes"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowExportDialog(true)} disabled={filteredRequests.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              Gerar Relatório
            </Button>
            <Button variant="brand" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Solicitação
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatsCard title="Abertos" value={openCount} icon={Wrench} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <StatsCard title="Agendados" value={scheduledCount} icon={Wrench} iconBg="bg-purple-100" iconColor="text-purple-600" />
        <StatsCard title="Em Andamento" value={inProgressCount} icon={Wrench} iconBg="bg-amber-100" iconColor="text-amber-600" />
        <StatsCard
          title="Aguardando Cliente"
          value={waitingClientCount}
          icon={Wrench}
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
        />
        <StatsCard title="Resolvidos (30d)" value={resolvedCount} icon={Wrench} iconBg="bg-green-100" iconColor="text-green-600" />
        <StatsCard title="Cancelados (30d)" value={cancelledCount} icon={Wrench} iconBg="bg-slate-100" iconColor="text-slate-600" />
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
                  <TableHead>Criado Por</TableHead>
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
                    <TableCell>{createdByBadge(request)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {request.scheduled_date ? new Date(request.scheduled_date).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{responsibleLabel(request.responsible_user_id)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`${pageUrl('AdminMaintenance')}/${request.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="mr-1 h-4 w-4" />
                            Ver
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

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Relatório de Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Selecione o tipo de relatório que deseja gerar:</p>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <input
                  type="radio"
                  name="exportMode"
                  value="resumo"
                  checked={exportMode === 'resumo'}
                  onChange={() => setExportMode('resumo')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-foreground">PDF Resumo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tabela com informações principais das solicitações</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <input
                  type="radio"
                  name="exportMode"
                  value="completo"
                  checked={exportMode === 'completo'}
                  onChange={() => setExportMode('completo')}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-foreground">PDF Completo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tabela + detalhes completos de cada solicitação + fotos/anexos</p>
                </div>
              </label>
            </div>

            {filteredRequests.length > 50 && exportMode === 'completo' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  ⚠️ Relatório grande ({filteredRequests.length} solicitações). Pode levar alguns segundos para gerar.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowExportDialog(false)} disabled={isExporting}>
              Cancelar
            </Button>
            <Button onClick={handleExportReport} variant="brand" disabled={isExporting}>
              {isExporting ? 'Gerando...' : 'Gerar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Excluir Solicitação?
            </AlertDialogTitle>
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
