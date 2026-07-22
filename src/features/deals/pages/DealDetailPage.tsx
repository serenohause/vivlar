import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Home,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
} from 'lucide-react';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Label } from '@/components/ui/label';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/shared/PageHeader';
import { useBroker } from '@/features/brokers/hooks';
import { useClient } from '@/features/clients/hooks';
import { formatCPF } from '@/features/clients/constants';
import { useDealActivities, useDealStatusTransitions, useUpdateActivityStatus } from '@/features/deals/activities-hooks';
import { CreateActivityDialog } from '@/features/deals/components/CreateActivityDialog';
import { DealStageBadge } from '@/features/deals/components/DealStageBadge';
import {
  ACTIVITY_STATUS_COLOR,
  ACTIVITY_TYPE_LABELS,
  ALL_SALES_STAGES,
  DEAL_SALES_STAGE_LABELS,
  KANBAN_STAGES,
  formatCurrency,
} from '@/features/deals/constants';
import { useDeal, useSoftDeleteDeal, useUpdateDealStage } from '@/features/deals/hooks';
import type { DealSalesStage } from '@/features/deals/types';
import { useProject } from '@/features/projects/hooks';
import { UnitAdminStatusBadge } from '@/features/units/components/UnitAdminStatusBadge';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Tradução de `original-project/src/pages/DealDetail.jsx`. Aba "Documentos"
 * NÃO portada (depende de `documents`, módulo futuro) — sobraram só
 * "Atividades" e "Timeline", combinado com o usuário. Sem criação de
 * `Commission`/convite de usuário cliente/notificação Teams ao mudar de
 * estágio (fora de escopo desta leva — ver `useUpdateDealStage`).
 */
export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: deal, isLoading, isError, refetch } = useDeal(id);
  const { data: client } = useClient(deal?.client_id);
  const { data: project } = useProject(deal?.project_id);
  const { data: unit } = useUnit(deal?.unit_id ?? undefined);
  const { data: broker } = useBroker(deal?.broker_id ?? undefined);
  const { data: activities } = useDealActivities(id);
  const { data: transitions } = useDealStatusTransitions(id);

  const [isStageDialogOpen, setIsStageDialogOpen] = useState(false);
  const [isActivityDialogOpen, setIsActivityDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedStage, setSelectedStage] = useState<DealSalesStage | ''>('');
  const [stageNote, setStageNote] = useState('');

  const updateStage = useUpdateDealStage();
  const updateActivityStatus = useUpdateActivityStatus(id ?? '');
  const softDeleteDeal = useSoftDeleteDeal();

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!deal) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Negociação não encontrada</p>
        <Button onClick={() => navigate(pageUrl('CRM'))}>Voltar</Button>
      </div>
    );
  }

  const isTerminal = deal.sales_stage === 'vendido' || deal.sales_stage === 'perdido' || deal.sales_stage === 'distratado';
  const dealActivities = activities ?? [];
  const sortedTransitions = transitions ?? [];

  function handleStageChange() {
    if (!selectedStage || !deal) return;
    updateStage.mutate(
      { deal, toStage: selectedStage, note: stageNote },
      {
        onSuccess: () => {
          toast.success('Estágio atualizado com sucesso!');
          setIsStageDialogOpen(false);
          setSelectedStage('');
          setStageNote('');
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  function handleConfirmDelete() {
    if (!deal) return;
    softDeleteDeal.mutate(deal, {
      onSuccess: () => {
        toast.success('Negociação excluída com sucesso!');
        navigate(pageUrl('CRM'));
      },
      onError: () => toast.error('Erro ao excluir negociação.'),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={client?.name ?? 'Carregando...'}
        subtitle={project?.name ?? ''}
        backTo="CRM"
        actions={
          <Button
            variant="outline"
            onClick={() => setDeleteConfirm(true)}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir Negociação
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status da Negociação */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Status da Negociação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {(deal.sales_stage === 'perdido' || deal.sales_stage === 'distratado'
                ? [...KANBAN_STAGES, deal.sales_stage]
                : KANBAN_STAGES
              ).map((stage) => {
                const isCurrent = stage === deal.sales_stage;
                const isCompleted =
                  KANBAN_STAGES.includes(deal.sales_stage) && KANBAN_STAGES.indexOf(stage) < KANBAN_STAGES.indexOf(deal.sales_stage);
                return (
                  <div
                    key={stage}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      isCurrent ? 'bg-brand text-brand-foreground' : isCompleted ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isCompleted && <CheckCircle className="h-4 w-4" />}
                    <span className="text-sm font-medium">{DEAL_SALES_STAGE_LABELS[stage]}</span>
                  </div>
                );
              })}
            </div>

            {!isTerminal && (
              <Button variant="brand" onClick={() => setIsStageDialogOpen(true)}>
                Alterar Estágio
              </Button>
            )}

            <div className="mt-6 grid gap-6 border-t pt-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Projeto</p>
                    <p className="font-medium">{project?.name ?? '—'}</p>
                  </div>
                </div>
                {unit && (
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Unidade</p>
                      <Link to={`${pageUrl('Units')}/${unit.id}`} className="font-medium text-brand hover:underline">
                        {unit.sku}
                      </Link>
                    </div>
                  </div>
                )}
                {broker && (
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Corretor</p>
                      <p className="font-medium">{broker.name}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Esperado</p>
                    <p className="font-medium">{formatCurrency(deal.expected_sale_value)}</p>
                  </div>
                </div>
                {deal.final_sale_value != null && (
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Final</p>
                      <p className="font-medium text-green-600">{formatCurrency(deal.final_sale_value)}</p>
                    </div>
                  </div>
                )}
                {deal.reserved_until && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Reserva até</p>
                      <p className="font-medium">{new Date(deal.reserved_until).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cliente */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            {client ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand">
                    <span className="font-semibold text-brand-foreground">{getInitials(client.name)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{client.name}</p>
                    <p className="text-sm text-muted-foreground">{formatCPF(client.cpf)}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {client.email}
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {client.address}
                    </div>
                  )}
                </div>
                <Link to={`${pageUrl('Clients')}/${client.id}`}>
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    Ver Perfil Completo
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                <User className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p>Carregando...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {unit && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Status Administrativo da Unidade:</span>
                <UnitAdminStatusBadge status={unit.admin_status} />
              </div>
              <Link to={`${pageUrl('Units')}/${unit.id}`}>
                <Button variant="ghost" size="sm" className="text-brand">
                  Ver Unidade →
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="activities" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activities">Atividades</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="activities">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold">Atividades</CardTitle>
              <Button size="sm" variant="brand" onClick={() => setIsActivityDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Atividade
              </Button>
            </CardHeader>
            <CardContent>
              {dealActivities.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
                  <p>Nenhuma atividade cadastrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dealActivities.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between rounded-lg bg-muted p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${ACTIVITY_STATUS_COLOR[activity.status]}`} />
                        <div>
                          <p className="font-medium text-foreground">{activity.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {ACTIVITY_TYPE_LABELS[activity.type]}
                            </Badge>
                            {activity.due_date && <span>Vence: {new Date(activity.due_date).toLocaleDateString('pt-BR')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activity.status === 'aberta' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600"
                            onClick={() => updateActivityStatus.mutate({ id: activity.id, status: 'concluida' })}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Concluir
                          </Button>
                        )}
                        <Badge className={ACTIVITY_STATUS_COLOR[activity.status]}>{activity.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Histórico de Transições</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedTransitions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="mx-auto mb-2 h-12 w-12 text-muted-foreground/50" />
                  <p>Nenhuma transição registrada</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute bottom-0 left-4 top-0 w-0.5 bg-muted" />
                  <div className="space-y-6">
                    {sortedTransitions.map((transition) => (
                      <div key={transition.id} className="relative pl-10">
                        <div className="absolute left-2.5 h-3 w-3 rounded-full bg-brand" />
                        <div className="rounded-lg bg-muted p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {transition.transition_type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(transition.created_at).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {transition.from_status && (
                              <>
                                <DealStageBadge stage={transition.from_status as DealSalesStage} size="sm" />
                                <span className="text-muted-foreground">→</span>
                              </>
                            )}
                            <DealStageBadge stage={transition.to_status as DealSalesStage} size="sm" />
                          </div>
                          {transition.note && <p className="mt-2 text-sm text-muted-foreground">{transition.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alterar Estágio */}
      <Dialog open={isStageDialogOpen} onOpenChange={setIsStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Estágio da Negociação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Novo Estágio</Label>
              <Select value={selectedStage} onValueChange={(value) => setSelectedStage(value as DealSalesStage)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o novo estágio" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SALES_STAGES.filter((s) => s !== deal.sales_stage).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {DEAL_SALES_STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedStage === 'perdido' && (
              <div>
                <Label>Motivo da Perda</Label>
                <Textarea value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Descreva o motivo..." />
              </div>
            )}
            {selectedStage && selectedStage !== 'perdido' && (
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Adicione uma observação..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsStageDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="brand" onClick={handleStageChange} disabled={!selectedStage || updateStage.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateActivityDialog
        open={isActivityDialogOpen}
        onOpenChange={setIsActivityDialogOpen}
        dealId={deal.id}
        clientId={deal.client_id}
        unitId={deal.unit_id}
      />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir esta negociação?</p>
              <p className="font-medium text-foreground">Cliente: {client?.name}</p>
              <p className="text-sm text-muted-foreground">
                Esta ação remove a negociação do CRM e dos indicadores. A unidade vinculada voltará a ficar disponível para vendas.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700" disabled={softDeleteDeal.isPending}>
              {softDeleteDeal.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
