import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Edit2, Eye, Home, Plus, Search, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useProjects } from '@/features/projects/hooks';
import { UnitEditDialog } from '@/features/units/components/UnitEditDialog';
import { UnitForm } from '@/features/units/components/UnitForm';
import { UnitAdminStatusBadge } from '@/features/units/components/UnitAdminStatusBadge';
import { UnitStatusBadge } from '@/features/units/components/UnitStatusBadge';
import { ADMIN_STATUS_OPTIONS, formatCurrency, UNIT_STATUS_OPTIONS } from '@/features/units/constants';
import { useCreateUnit, useSoftDeleteUnit, useUnits } from '@/features/units/hooks';
import type { UnitMutationPayload } from '@/features/units/schemas';
import type { Unit, UnitAdminStatus, UnitStatus } from '@/features/units/types';
import { pageUrl } from '@/lib/page-url';

/**
 * Tradução de `original-project/src/pages/Units.jsx`, sem o botão
 * "Comparativo" (`UnitsComparison`, tela própria fora de escopo desta
 * leva) e sem as checagens de perfil (`canEdit`/`isAdmin` do original,
 * `app_profile` — este app ainda não tem esse conceito; RLS já restringe
 * quem chega em `admin`/`comercial`/`administrativo` do tenant, ver
 * 0010_rls_catalog.sql). Filtro por projeto aceita `?project=<id>` na URL
 * (usado pelo link "Ver Todas" de `ProjectDetailPage`).
 */
export function UnitsListPage() {
  const { data: units, isLoading, isError, refetch } = useUnits();
  const { data: projects } = useProjects();

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState(searchParams.get('project') ?? 'all');
  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | 'all'>('all');
  const [selectedAdminStatus, setSelectedAdminStatus] = useState<UnitAdminStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Unit | null>(null);

  const createUnit = useCreateUnit();
  const deleteUnit = useSoftDeleteUnit();

  const all = units ?? [];
  const allProjects = projects ?? [];

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of allProjects) map.set(project.id, project.name);
    return map;
  }, [allProjects]);

  function handleProjectFilterChange(value: string) {
    setSelectedProject(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('project');
    } else {
      next.set('project', value);
    }
    setSearchParams(next, { replace: true });
  }

  const filteredUnits = useMemo(() => {
    const term = search.toLowerCase();
    return all.filter((unit) => {
      const matchesSearch = unit.sku?.toLowerCase().includes(term) || unit.bloco?.toLowerCase().includes(term);
      const matchesProject = selectedProject === 'all' || unit.project_id === selectedProject;
      const matchesStatus = selectedStatus === 'all' || unit.status === selectedStatus;
      const matchesAdminStatus = selectedAdminStatus === 'all' || unit.admin_status === selectedAdminStatus;
      return matchesSearch && matchesProject && matchesStatus && matchesAdminStatus;
    });
  }, [all, search, selectedProject, selectedStatus, selectedAdminStatus]);

  function handleCreateSubmit(data: UnitMutationPayload) {
    createUnit.mutate(data, {
      onSuccess: () => {
        toast.success('Unidade criada com sucesso!');
        setShowCreateDialog(false);
      },
      onError: () => {
        toast.error('Erro ao criar unidade.');
      },
    });
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    deleteUnit.mutate(deleteConfirm.id, {
      onSuccess: () => {
        toast.success('Unidade excluída com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Erro ao excluir unidade.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Unidades (SKU)"
        subtitle="Gestão de estoque de unidades"
        actions={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="brand">
                <Plus className="mr-2 h-4 w-4" />
                Nova Unidade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Unidade</DialogTitle>
              </DialogHeader>
              <UnitForm
                projects={allProjects}
                defaultProjectId={selectedProject !== 'all' ? selectedProject : undefined}
                onSubmit={handleCreateSubmit}
                isSubmitting={createUnit.isPending}
                submitLabel="Criar"
                onCancel={() => setShowCreateDialog(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU ou bloco..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedProject} onValueChange={handleProjectFilterChange}>
          <SelectTrigger className="w-full md:w-48">
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
        <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as UnitStatus | 'all')}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {UNIT_STATUS_OPTIONS.map(([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedAdminStatus}
          onValueChange={(value) => setSelectedAdminStatus(value as UnitAdminStatus | 'all')}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Status Admin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status Admin</SelectItem>
            {ADMIN_STATUS_OPTIONS.map(([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{filteredUnits.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Disponíveis</p>
            <p className="text-2xl font-bold text-green-600">
              {filteredUnits.filter((u) => u.status === 'disponivel').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Reservadas</p>
            <p className="text-2xl font-bold text-amber-500">
              {filteredUnits.filter((u) => u.status === 'reservada').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vendidas</p>
            <p className="text-2xl font-bold text-blue-600">
              {filteredUnits.filter((u) => u.status === 'vendida').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Estados: carregando / erro / vazio / lista */}
      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredUnits.length === 0 ? (
        <EmptyState
          icon={Home}
          title="Nenhuma unidade encontrada"
          description="Comece cadastrando sua primeira unidade"
          action={() => setShowCreateDialog(true)}
          actionLabel="Criar Unidade"
        />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Empreendimento</TableHead>
                  <TableHead className="hidden md:table-cell">Bloco</TableHead>
                  <TableHead className="hidden lg:table-cell">Tipologia</TableHead>
                  <TableHead className="hidden lg:table-cell">Área (m²)</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status Comercial</TableHead>
                  <TableHead>Status Admin</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnits.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">{unit.sku}</TableCell>
                    <TableCell>{projectsById.get(unit.project_id) ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{unit.bloco || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{unit.tipologia || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {unit.area_m2 ? `${unit.area_m2.toFixed(2)} m²` : '—'}
                    </TableCell>
                    <TableCell>{formatCurrency(unit.list_price)}</TableCell>
                    <TableCell>
                      <UnitStatusBadge status={unit.status} />
                    </TableCell>
                    <TableCell>
                      <UnitAdminStatusBadge status={unit.admin_status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`${pageUrl('Units')}/${unit.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => setEditingUnit(unit)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(unit)}
                          className="text-destructive hover:text-destructive"
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

      {editingUnit && (
        <UnitEditDialog
          unit={editingUnit}
          projects={allProjects}
          open={Boolean(editingUnit)}
          onOpenChange={(open) => !open && setEditingUnit(null)}
        />
      )}

      {/* Confirmação de Exclusão */}
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Unidade</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir a unidade &quot;{deleteConfirm?.sku}&quot;?</p>
              <p className="text-sm">Esta ação remove a unidade da listagem ativa, mas mantém o histórico.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
