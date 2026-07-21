import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ExternalLink,
  Eye,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProjectEditDialog } from '@/features/projects/components/ProjectEditDialog';
import { ProjectForm } from '@/features/projects/components/ProjectForm';
import { ProjectStatusBadge } from '@/features/projects/components/ProjectStatusBadge';
import { PROJECT_STATUS_OPTIONS } from '@/features/projects/constants';
import { useCreateProject, useProjects, useSoftDeleteProject, useUnitsStatsByProject } from '@/features/projects/hooks';
import type { ProjectMutationPayload } from '@/features/projects/schemas';
import type { Project, ProjectStatus } from '@/features/projects/types';
import { pageUrl } from '@/lib/page-url';

type SortKey = 'name' | 'status' | 'start_sales_at' | 'total_units';
type SortDirection = 'asc' | 'desc';

interface ProjectStats {
  total: number;
  vendidas: number;
  disponiveis: number;
}

const EMPTY_STATS: ProjectStats = { total: 0, vendidas: 0, disponiveis: 0 };

/**
 * Tradução de `original-project/src/pages/Projects.jsx`. `projectStats`
 * (total/vendidas/disponíveis por projeto) vem de `useUnitsStatsByProject`
 * — mesma ideia do original (busca todas as unidades do tenant e agrupa no
 * client), sem depender de UI própria de Unidades.
 */
export function ProjectsListPage() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const { data: unitsStats } = useUnitsStatsByProject();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<ProjectStatus | 'all'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ project: Project; unitCount: number } | null>(null);

  const createProject = useCreateProject();
  const deleteProject = useSoftDeleteProject();

  const all = projects ?? [];
  const units = unitsStats ?? [];

  const projectStats = useMemo(() => {
    const stats: Record<string, ProjectStats> = {};
    for (const project of all) {
      const projectUnits = units.filter((u) => u.project_id === project.id);
      stats[project.id] = {
        total: projectUnits.length,
        vendidas: projectUnits.filter((u) => u.status === 'vendida').length,
        disponiveis: projectUnits.filter((u) => u.status === 'disponivel').length,
      };
    }
    return stats;
  }, [all, units]);

  function handleSort(key: SortKey) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function getSortIcon(key: SortKey) {
    if (sortConfig.key !== key) return <ArrowUpDown className="ml-1 h-4 w-4 text-muted-foreground" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-1 h-4 w-4 text-foreground" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4 text-foreground" />
    );
  }

  const filteredProjects = useMemo(() => {
    const term = search.toLowerCase();
    const result = all.filter((project) => {
      const matchesSearch = project.name?.toLowerCase().includes(term) || project.code?.toLowerCase().includes(term);
      const matchesStatus = selectedStatus === 'all' || project.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortConfig.key) {
        case 'name':
          aVal = a.name?.toLowerCase() ?? '';
          bVal = b.name?.toLowerCase() ?? '';
          break;
        case 'status':
          aVal = a.status ?? '';
          bVal = b.status ?? '';
          break;
        case 'start_sales_at':
          aVal = a.start_sales_at ?? '';
          bVal = b.start_sales_at ?? '';
          break;
        case 'total_units':
          aVal = projectStats[a.id]?.total ?? 0;
          bVal = projectStats[b.id]?.total ?? 0;
          break;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [all, search, selectedStatus, sortConfig, projectStats]);

  const totals = {
    projects: filteredProjects.length,
    ativos: filteredProjects.filter((p) => ['planejamento', 'em_obras', 'em_vendas'].includes(p.status)).length,
    entregues: filteredProjects.filter((p) => p.status === 'entregue').length,
  };

  function handleCreateSubmit(data: ProjectMutationPayload) {
    createProject.mutate(data, {
      onSuccess: () => {
        toast.success('Projeto criado com sucesso!');
        setShowCreateDialog(false);
      },
      onError: () => {
        toast.error('Erro ao criar projeto.');
      },
    });
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    deleteProject.mutate(deleteConfirm.project.id, {
      onSuccess: () => {
        toast.success('Projeto excluído com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Erro ao excluir projeto.');
      },
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projetos"
        subtitle="Gerencie os empreendimentos"
        actions={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="brand">
                <Plus className="mr-2 h-4 w-4" />
                Novo Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Projeto</DialogTitle>
              </DialogHeader>
              <ProjectForm
                onSubmit={handleCreateSubmit}
                isSubmitting={createProject.isPending}
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
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as ProjectStatus | 'all')}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {PROJECT_STATUS_OPTIONS.map(([value, config]) => (
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
            <p className="text-sm text-muted-foreground">Total Projetos</p>
            <p className="text-2xl font-bold text-foreground">{totals.projects}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-green-600">{totals.ativos}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Entregues</p>
            <p className="text-2xl font-bold text-purple-600">{totals.entregues}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Unidades</p>
            <p className="text-2xl font-bold text-blue-600">{units.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Estados: carregando / erro / vazio / lista */}
      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum projeto encontrado"
          description="Comece criando seu primeiro projeto"
          action={() => setShowCreateDialog(true)}
          actionLabel="Criar Projeto"
        />
      ) : (
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Código</TableHead>
                  <TableHead>
                    <button onClick={() => handleSort('name')} className="flex items-center hover:text-foreground">
                      Nome {getSortIcon('name')}
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Endereço</TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort('total_units')}
                      className="flex w-full items-center justify-center hover:text-foreground"
                    >
                      Total {getSortIcon('total_units')}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">Vendidas</TableHead>
                  <TableHead className="text-center">Disponíveis</TableHead>
                  <TableHead>
                    <button onClick={() => handleSort('status')} className="flex items-center hover:text-foreground">
                      Status {getSortIcon('status')}
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button
                      onClick={() => handleSort('start_sales_at')}
                      className="flex items-center hover:text-foreground"
                    >
                      Início {getSortIcon('start_sales_at')}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => {
                  const stats = projectStats[project.id] ?? EMPTY_STATS;
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {project.code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                            <Building2 className="h-4 w-4 text-brand" />
                          </div>
                          <span className="font-medium text-foreground">{project.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">
                        {project.address || '—'}
                      </TableCell>
                      <TableCell className="text-center font-medium">{stats.total}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700">
                          {stats.vendidas}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-green-100 px-2 py-0.5 text-sm font-medium text-green-700">
                          {stats.disponiveis}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={project.status} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {project.start_sales_at ? new Date(project.start_sales_at).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`${pageUrl('Projects')}/${project.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            {project.slug && project.is_public && (
                              <DropdownMenuItem asChild>
                                <a href={`/p/${project.slug}`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Espelho de Vendas
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditingProject(project)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteConfirm({ project, unitCount: stats.total })}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingProject && (
        <ProjectEditDialog
          project={editingProject}
          open={Boolean(editingProject)}
          onOpenChange={(open) => !open && setEditingProject(null)}
        />
      )}

      {/* Confirmação de Exclusão */}
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {deleteConfirm && deleteConfirm.unitCount > 0 ? (
                <>
                  <p className="font-medium text-foreground">
                    Este empreendimento possui {deleteConfirm.unitCount} unidade(s) vinculada(s).
                  </p>
                  <p>As unidades não serão excluídas, mas o projeto deixará de aparecer na lista ativa.</p>
                  <p className="text-sm">Esta ação não pode ser desfeita. Deseja continuar?</p>
                </>
              ) : (
                <p>Tem certeza que deseja excluir &quot;{deleteConfirm?.project.name}&quot;? Esta ação não pode ser desfeita.</p>
              )}
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
