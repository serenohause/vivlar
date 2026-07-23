import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Plus, Search, Trash2 } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { useClients } from '@/features/clients/hooks';
import { InspectionStatusBadge } from '@/features/inspections/components/InspectionStatusBadge';
import { INSPECTION_STATUS_CONFIG, INSPECTION_STATUS_FILTER_ORDER } from '@/features/inspections/constants';
import { useInspections, useSoftDeleteInspection } from '@/features/inspections/hooks';
import type { Inspection, InspectionStatus } from '@/features/inspections/types';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

// Ordem de prioridade na listagem -- fiel a `statusPriority` de
// `Inspections.jsx` (ativas primeiro, concluídas depois, rascunho por
// último).
const STATUS_PRIORITY: Record<InspectionStatus, number> = {
  em_vistoria: 1,
  enviado_ao_cliente: 2,
  reinspecao: 3,
  reprovado: 4,
  aprovado: 5,
  concluido: 6,
  rascunho: 7,
};

/**
 * Tradução de `original-project/src/pages/Inspections.jsx` — lista de
 * vistorias, com busca/filtros de projeto e status, e ações de linha
 * (ver/excluir). Sem o botão de "Gerar PDF" por linha (fora de escopo desta
 * leva, ver `docs`/relatório final) nem a checagem de acesso do original
 * (RLS já restringe `inspections` a admin/comercial/administrativo,
 * `0036_rls_inspections.sql` — o frontend trata erro via `ErrorState`).
 * "Vistoriador" mostra o e-mail do usuário logado quando ele é o inspetor
 * da linha, `—` caso contrário: diferente do original (`getInspectorName`,
 * via `User.list()`), este app não tem um diretório de usuários do tenant
 * consultável pelo frontend (`tenant_users` não expõe nome/e-mail — ver
 * `0001_tenants_and_tenant_users.sql`).
 */
export function InspectionsListPage() {
  const { user } = useAuth();
  const { data: inspections, isLoading, isError, refetch } = useInspections();
  const { data: units } = useUnits();
  const { data: projects } = useProjects();
  const { data: clients } = useClients();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InspectionStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<Inspection | null>(null);

  const softDelete = useSoftDeleteInspection();

  const allInspections = inspections ?? [];
  const allUnits = units ?? [];
  const allProjects = projects ?? [];
  const allClients = clients ?? [];

  function unitName(unitId: string): string {
    return allUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function clientName(clientId: string | null): string {
    if (!clientId) return '—';
    return allClients.find((c) => c.id === clientId)?.name ?? '—';
  }

  function inspectorName(inspectorUserId: string | null): string {
    if (!inspectorUserId) return '—';
    return inspectorUserId === user?.id ? (user?.email ?? '—') : '—';
  }

  const filteredInspections = allInspections
    .filter((inspection) => {
      const search_ = search.toLowerCase();
      const matchesSearch =
        unitName(inspection.unit_id).toLowerCase().includes(search_) ||
        projectName(inspection.project_id).toLowerCase().includes(search_) ||
        clientName(inspection.client_id).toLowerCase().includes(search_);
      const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
      const matchesProject = projectFilter === 'all' || inspection.project_id === projectFilter;
      return matchesSearch && matchesStatus && matchesProject;
    })
    .sort((a, b) => {
      const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDelete.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Vistoria excluída com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir vistoria.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vistorias"
        subtitle="Gestão de vistorias de entrega"
        actions={
          <Link to={pageUrl('CreateInspection')}>
            <Button variant="brand">
              <Plus className="mr-2 h-4 w-4" />
              Nova Vistoria
            </Button>
          </Link>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por unidade, projeto ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full lg:w-48">
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
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InspectionStatus | 'all')}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {INSPECTION_STATUS_FILTER_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {INSPECTION_STATUS_CONFIG[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {filteredInspections.length === 0 ? (
        <EmptyState
          title="Nenhuma vistoria encontrada"
          description="Comece criando uma nova vistoria"
          action={() => {
            window.location.href = pageUrl('CreateInspection');
          }}
          actionLabel="Nova Vistoria"
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vistoriador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">% Conformidade</TableHead>
                  <TableHead className="text-center">NC + Pendentes</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{projectName(inspection.project_id)}</TableCell>
                    <TableCell className="font-medium text-foreground">{unitName(inspection.unit_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{clientName(inspection.client_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inspectorName(inspection.inspector_user_id)}</TableCell>
                    <TableCell>
                      <InspectionStatusBadge status={inspection.status} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inspection.score_conformity_percent.toFixed(1)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="border-amber-600 text-amber-600">
                        {inspection.totals_nonconform + inspection.totals_pending}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link to={`${pageUrl('Inspections')}/${inspection.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Excluir"
                          onClick={() => setDeleteConfirm(inspection)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Vistoria</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir esta vistoria? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
