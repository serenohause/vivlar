import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Briefcase, Plus, Search } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/PageHeader';
import { useBrokers } from '@/features/brokers/hooks';
import { useClients } from '@/features/clients/hooks';
import { CreateActivityDialog } from '@/features/deals/components/CreateActivityDialog';
import { CreateDealDialog } from '@/features/deals/components/CreateDealDialog';
import { DealCard } from '@/features/deals/components/DealCard';
import { MarkDealLostDialog } from '@/features/deals/components/MarkDealLostDialog';
import { DEAL_SALES_STAGE_LABELS, KANBAN_STAGES, formatCurrency } from '@/features/deals/constants';
import { useDeals, useSoftDeleteDeal, useUpdateDealStage } from '@/features/deals/hooks';
import type { Deal, DealSalesStage } from '@/features/deals/types';
import { useProjects } from '@/features/projects/hooks';
import type { Project, ProjectStatus } from '@/features/projects/types';
import { useUnits } from '@/features/units/hooks';

type SortBy = 'recent' | 'oldest' | 'value_high' | 'value_low';

// Projetos disponíveis para nova oportunidade — mesmo filtro/ordem de
// `original-project/src/pages/CRM.jsx` (planejamento/em_vendas/em_obras,
// priorizando em_vendas).
const AVAILABLE_PROJECT_STATUSES: ProjectStatus[] = ['planejamento', 'em_vendas', 'em_obras'];
const PROJECT_STATUS_ORDER: Record<string, number> = { em_vendas: 1, em_obras: 2, planejamento: 3 };

function availableProjects(projects: Project[]): Project[] {
  return projects
    .filter((p) => AVAILABLE_PROJECT_STATUSES.includes(p.status))
    .sort((a, b) => (PROJECT_STATUS_ORDER[a.status] ?? 999) - (PROJECT_STATUS_ORDER[b.status] ?? 999));
}

function sortDeals(deals: Deal[], sortBy: SortBy): Deal[] {
  const sorted = [...deals];
  switch (sortBy) {
    case 'recent':
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    case 'value_high':
      return sorted.sort((a, b) => (b.expected_sale_value ?? 0) - (a.expected_sale_value ?? 0));
    case 'value_low':
      return sorted.sort((a, b) => (a.expected_sale_value ?? 0) - (b.expected_sale_value ?? 0));
    default:
      return sorted;
  }
}

/**
 * Tradução de `original-project/src/pages/CRM.jsx` — Kanban do funil de
 * vendas. Simplificações combinadas com o usuário (ver relatório final):
 * sem alternância lista/kanban, sem filtros de corretor/data/faixa de valor,
 * sem exportação CSV e sem o botão "Enviar para Teams" (integração
 * excluída do escopo). O drag-and-drop entre colunas usa
 * `@hello-pangea/dnd` (mesma lib listada como dependência no
 * `original-project`, embora não estivesse de fato conectada em nenhum
 * `.jsx` do projeto original — o menu "Mover para X" de cada card também
 * continua disponível, fiel ao original, para quem preferir não arrastar).
 */
export function CRMPage() {
  const { data: deals, isLoading, isError, refetch } = useDeals();
  const { data: clients } = useClients();
  const { data: projects } = useProjects();
  const { data: units } = useUnits();
  const { data: brokers } = useBrokers();

  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activityDeal, setActivityDeal] = useState<Deal | null>(null);
  const [lostDeal, setLostDeal] = useState<Deal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Deal | null>(null);

  const updateStage = useUpdateDealStage();
  const softDeleteDeal = useSoftDeleteDeal();

  const allDeals = deals ?? [];
  const allClients = clients ?? [];
  const allProjects = projects ?? [];
  const allUnits = units ?? [];
  const allBrokers = brokers ?? [];
  const projectOptions = useMemo(() => availableProjects(allProjects), [allProjects]);

  function clientName(clientId: string) {
    return allClients.find((c) => c.id === clientId)?.name ?? '—';
  }

  const filteredDeals = allDeals.filter((deal) => {
    const matchesSearch = clientName(deal.client_id).toLowerCase().includes(search.toLowerCase());
    const matchesProject = selectedProject === 'all' || deal.project_id === selectedProject;
    return matchesSearch && matchesProject;
  });

  const dealsByStage = useMemo(() => {
    const map = new Map<DealSalesStage, Deal[]>();
    for (const stage of KANBAN_STAGES) {
      const stageDeals = filteredDeals.filter((d) => {
        if (stage === 'vendido') return d.sales_stage === stage && d.is_active;
        return d.sales_stage === stage;
      });
      map.set(stage, sortDeals(stageDeals, sortBy));
    }
    return map;
  }, [filteredDeals, sortBy]);

  const metrics = useMemo(() => {
    const totalDeals = filteredDeals.length;
    const vendidos = filteredDeals.filter((d) => d.sales_stage === 'vendido' && d.is_active).length;
    const perdidos = filteredDeals.filter((d) => d.sales_stage === 'perdido' || d.sales_stage === 'distratado').length;
    const ativos = totalDeals - vendidos - perdidos;
    const conversionRate = totalDeals > 0 ? (vendidos / totalDeals) * 100 : 0;
    const lossRate = totalDeals > 0 ? (perdidos / totalDeals) * 100 : 0;
    const totalValue = filteredDeals
      .filter((d) => d.sales_stage === 'vendido' && d.is_active)
      .reduce((sum, d) => sum + (d.final_sale_value ?? d.expected_sale_value ?? 0), 0);
    const pipelineValue = filteredDeals
      .filter((d) => !['vendido', 'perdido', 'distratado'].includes(d.sales_stage))
      .reduce((sum, d) => sum + (d.expected_sale_value ?? 0), 0);

    return { totalDeals, vendidos, perdidos, ativos, conversionRate, lossRate, totalValue, pipelineValue };
  }, [filteredDeals]);

  function handleMoveStage(deal: Deal, toStage: DealSalesStage) {
    updateStage.mutate(
      { deal, toStage },
      {
        onSuccess: () => toast.success(`Negócio movido para ${DEAL_SALES_STAGE_LABELS[toStage]}.`),
        onError: (error) => toast.error(error.message),
      }
    );
  }

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const deal = allDeals.find((d) => d.id === draggableId);
    if (!deal) return;

    handleMoveStage(deal, destination.droppableId as DealSalesStage);
  }

  function handleConfirmLost(reason: string) {
    if (!lostDeal) return;
    updateStage.mutate(
      { deal: lostDeal, toStage: 'perdido', note: reason },
      {
        onSuccess: () => {
          toast.success('Negócio marcado como perdido.');
          setLostDeal(null);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    softDeleteDeal.mutate(deleteConfirm, {
      onSuccess: () => {
        toast.success('Negociação excluída com sucesso!');
        setDeleteConfirm(null);
      },
      onError: () => toast.error('Erro ao excluir negociação.'),
    });
  }

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        subtitle="Gestão do funil de vendas"
        actions={
          <Button variant="brand" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Oportunidade
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Projetos</SelectItem>
            {projectOptions.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="oldest">Mais antigos</SelectItem>
            <SelectItem value="value_high">Maior valor</SelectItem>
            <SelectItem value="value_low">Menor valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs do Funil */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Total de Deals</div>
            <div className="text-2xl font-bold">{metrics.totalDeals}</div>
            <div className="mt-1 text-xs text-muted-foreground">{metrics.ativos} ativos</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Vendidos</div>
            <div className="text-2xl font-bold text-green-600">{metrics.vendidos}</div>
            <div className="mt-1 text-xs text-green-500">{metrics.conversionRate.toFixed(1)}% conversão</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Perdidos</div>
            <div className="text-2xl font-bold text-red-600">{metrics.perdidos}</div>
            <div className="mt-1 text-xs text-red-500">{metrics.lossRate.toFixed(1)}% perda</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Vendas (R$)</div>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalValue)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Concluídas</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-1 text-sm text-muted-foreground">Pipeline (R$)</div>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(metrics.pipelineValue)}</div>
            <div className="mt-1 text-xs text-blue-500">Em negociação</div>
          </CardContent>
        </Card>
      </div>

      {filteredDeals.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nenhuma oportunidade encontrada"
          description="Comece criando sua primeira oportunidade de venda"
          action={() => setIsCreateOpen(true)}
          actionLabel="Criar Oportunidade"
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-max gap-4">
              {KANBAN_STAGES.map((stage) => {
                const stageDeals = dealsByStage.get(stage) ?? [];
                return (
                  <div key={stage} className="w-80 flex-shrink-0">
                    <div className="mb-3 rounded-xl bg-muted p-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{DEAL_SALES_STAGE_LABELS[stage]}</Badge>
                        <Badge variant="outline" className="text-xs">
                          {stageDeals.length}
                        </Badge>
                      </div>
                    </div>
                    <Droppable droppableId={stage}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[80px] space-y-3">
                          {stageDeals.map((deal, index) => (
                            <DealCard
                              key={deal.id}
                              deal={deal}
                              index={index}
                              client={allClients.find((c) => c.id === deal.client_id)}
                              project={allProjects.find((p) => p.id === deal.project_id)}
                              unit={allUnits.find((u) => u.id === deal.unit_id)}
                              broker={allBrokers.find((b) => b.id === deal.broker_id)}
                              onMoveStage={handleMoveStage}
                              onMarkLost={setLostDeal}
                              onDelete={setDeleteConfirm}
                              onRegisterActivity={setActivityDeal}
                            />
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}

      <CreateDealDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        clients={allClients}
        brokers={allBrokers}
        projects={projectOptions}
        units={allUnits}
        deals={allDeals}
      />

      {activityDeal && (
        <CreateActivityDialog
          open={Boolean(activityDeal)}
          onOpenChange={(open) => !open && setActivityDeal(null)}
          dealId={activityDeal.id}
          clientId={activityDeal.client_id}
          unitId={activityDeal.unit_id}
        />
      )}

      <MarkDealLostDialog
        open={Boolean(lostDeal)}
        onOpenChange={(open) => !open && setLostDeal(null)}
        onConfirm={handleConfirmLost}
        isPending={updateStage.isPending}
      />

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Negociação?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir esta negociação?</p>
              <p className="font-medium text-foreground">Cliente: {deleteConfirm && clientName(deleteConfirm.client_id)}</p>
              <p className="text-sm text-muted-foreground">
                Esta ação remove a negociação do CRM e dos indicadores. A unidade vinculada voltará a ficar disponível para vendas.
              </p>
            </AlertDialogDescription>
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
