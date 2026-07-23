import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, Edit, Image as ImageIcon, Trash2, User } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { useClient } from '@/features/clients/hooks';
import { MaintenancePhotoThumbnail } from '@/features/maintenance/components/MaintenancePhotoThumbnail';
import { MaintenancePriorityBadge } from '@/features/maintenance/components/MaintenancePriorityBadge';
import { MaintenanceStatusBadge } from '@/features/maintenance/components/MaintenanceStatusBadge';
import { MAINTENANCE_STATUS_CONFIG, MAINTENANCE_STATUS_FILTER_ORDER } from '@/features/maintenance/constants';
import { useMaintenanceRequest, useSoftDeleteMaintenanceRequest, useUpdateMaintenanceRequest } from '@/features/maintenance/hooks';
import { MAINTENANCE_TERMINAL_STATUSES } from '@/features/maintenance/types';
import type { MaintenanceStatus } from '@/features/maintenance/types';
import { useProject } from '@/features/projects/hooks';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

const NO_RESPONSIBLE = '__none__';

interface EditFormState {
  status: MaintenanceStatus;
  scheduled_date: string;
  responsible_user_id: string;
  operator_notes: string;
}

/**
 * Tradução de `original-project/src/pages/MaintenanceDetail.jsx` (lado
 * interno/operador) — informações completas do chamado, dialog de
 * atualização e exclusão. Diferenças documentadas em relação ao original:
 *
 * - Sem geração de PDF (`FileDown`/`exportMaintenanceRequestToPDF`) — fora
 *   de escopo desta leva, débito técnico.
 * - Sem criação de `Notification` ao mudar status/agendar (tabela não
 *   existe no projeto novo, mesmo critério já usado nos módulos
 *   anteriores).
 * - "Criado Por" não é exibido: sem portal do cliente, todo chamado nasce
 *   de um operador interno (a distinção cliente/operador do original não
 *   se aplica, ver comentário em `MaintenanceListPage`).
 * - Campo "Responsável" do dialog de edição só oferece "Nenhum" e "Eu
 *   (usuário logado)" como opções atribuíveis — mesma limitação já
 *   documentada em `InspectionsListPage` (sem diretório de usuários do
 *   tenant consultável pelo frontend). Se o chamado já tiver um responsável
 *   diferente do usuário logado (atribuído por outro operador), esse valor
 *   é preservado como uma opção extra somente informativa.
 *
 * REGRAS DE NEGÓCIO preservadas do original:
 * 1. Se o novo `status` for "Agendado" e `scheduled_date` estiver vazia, o
 *    submit é bloqueado com um toast de erro (`handleSubmit`,
 *    `MaintenanceDetail.jsx` linhas 178-182) — checagem no client, ANTES de
 *    chamar a mutation.
 * 2. `resolved_at` é carimbado automaticamente pelo hook
 *    (`useUpdateMaintenanceRequest`) quando o status transiciona PARA
 *    "Resolvido" — nunca um input manual.
 */
export function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, tenantRole } = useAuth();

  const { data: request, isLoading, isError, refetch } = useMaintenanceRequest(id);
  const { data: unit } = useUnit(request?.unit_id);
  const { data: project } = useProject(request?.project_id);
  const { data: client } = useClient(request?.client_id);

  const updateRequest = useUpdateMaintenanceRequest(id ?? '');
  const softDelete = useSoftDeleteMaintenanceRequest();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<EditFormState>({
    status: 'aberto',
    scheduled_date: '',
    responsible_user_id: NO_RESPONSIBLE,
    operator_notes: '',
  });

  if (isLoading) return <LoadingInline />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!request) {
    return (
      <EmptyState
        title="Solicitação não encontrada"
        description="A solicitação que você está procurando não existe ou foi excluída."
        action={() => navigate(pageUrl('AdminMaintenance'))}
        actionLabel="Voltar para Manutenções"
      />
    );
  }

  const canEdit = tenantRole === 'admin' || tenantRole === 'comercial' || tenantRole === 'administrativo';
  const isTerminal = MAINTENANCE_TERMINAL_STATUSES.includes(request.status);

  function handleOpenEdit() {
    if (!request) return;
    setFormError(null);
    setFormData({
      status: request.status,
      scheduled_date: request.scheduled_date ?? '',
      responsible_user_id: request.responsible_user_id ?? NO_RESPONSIBLE,
      operator_notes: request.operator_notes ?? '',
    });
    setIsEditDialogOpen(true);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!request) return;

    if (formData.status === 'agendado' && !formData.scheduled_date) {
      toast.error('Para agendar, é obrigatório definir a data');
      return;
    }

    updateRequest.mutate(
      {
        status: formData.status,
        scheduled_date: formData.scheduled_date || null,
        responsible_user_id: formData.responsible_user_id === NO_RESPONSIBLE ? null : formData.responsible_user_id,
        operator_notes: formData.operator_notes.trim() || null,
        currentStatus: request.status,
      },
      {
        onSuccess: () => {
          toast.success('Solicitação atualizada com sucesso');
          setIsEditDialogOpen(false);
        },
        onError: (error) => setFormError(error.message),
      }
    );
  }

  function handleConfirmDelete() {
    if (!id) return;
    softDelete.mutate(id, {
      onSuccess: () => {
        toast.success('Solicitação excluída com sucesso');
        navigate(pageUrl('AdminMaintenance'));
      },
      onError: () => toast.error('Erro ao excluir solicitação.'),
    });
  }

  const responsibleOptions: { value: string; label: string }[] = [{ value: NO_RESPONSIBLE, label: 'Nenhum' }];
  if (user?.id) responsibleOptions.push({ value: user.id, label: `Eu (${user.email ?? user.id})` });
  if (request.responsible_user_id && request.responsible_user_id !== user?.id) {
    responsibleOptions.push({ value: request.responsible_user_id, label: 'Outro colaborador' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
        <div className="flex items-center gap-3">
          <Link to={pageUrl('AdminMaintenance')}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{request.title}</h1>
              <MaintenanceStatusBadge status={request.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Solicitação #{request.id.slice(0, 8)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && !isTerminal && (
            <Button onClick={handleOpenEdit} variant="brand">
              <Edit className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          )}
          {tenantRole === 'admin' && (
            <Button
              onClick={() => setDeleteConfirm(true)}
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Informações da Solicitação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium text-foreground">{client?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Projeto</p>
                  <p className="font-medium text-foreground">{project?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Unidade</p>
                  <p className="font-medium text-foreground">{unit?.sku ?? '—'}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Data de Abertura</p>
                  <p className="font-medium text-foreground">{new Date(request.opened_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Categoria</p>
                  <Badge variant="outline">{request.category}</Badge>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Prioridade</p>
                  <MaintenancePriorityBadge priority={request.priority} />
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm text-muted-foreground">Descrição</p>
                <div className="rounded-lg bg-muted p-4">
                  <p className="whitespace-pre-wrap text-foreground">{request.description}</p>
                </div>
              </div>

              {request.photos.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Fotos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {request.photos.map((path) => (
                      <MaintenancePhotoThumbnail key={path} path={path} openOnClick />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {request.operator_notes && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Observações do Operador</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted p-4">
                  <p className="whitespace-pre-wrap text-foreground">{request.operator_notes}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Status Atual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center py-4">
                <Badge className={`${MAINTENANCE_STATUS_CONFIG[request.status].color} px-6 py-2 text-base text-white`}>
                  {MAINTENANCE_STATUS_CONFIG[request.status].label}
                </Badge>
              </div>

              {request.scheduled_date && (
                <div className="flex items-center gap-3 rounded-lg bg-purple-50 p-3">
                  <Calendar className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Agendado para</p>
                    <p className="font-medium text-foreground">{new Date(request.scheduled_date).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              )}

              {request.responsible_user_id && (
                <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                  <User className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Responsável</p>
                    <p className="font-medium text-foreground">
                      {request.responsible_user_id === user?.id ? (user?.email ?? 'Eu') : 'Outro colaborador'}
                    </p>
                  </div>
                </div>
              )}

              {request.resolved_at && (
                <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Resolvido em</p>
                    <p className="font-medium text-foreground">{new Date(request.resolved_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              )}

              {request.photos.length === 0 && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                  <p className="text-sm">Sem fotos anexadas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar Solicitação</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as MaintenanceStatus })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_STATUS_FILTER_ORDER.map((status) => (
                      <SelectItem key={status} value={status}>
                        {MAINTENANCE_STATUS_CONFIG[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="scheduled_date">Data Agendada</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
                {formData.status === 'agendado' && !formData.scheduled_date && (
                  <p className="mt-1 text-xs text-destructive">Obrigatório para status Agendado</p>
                )}
              </div>

              <div>
                <Label>Responsável</Label>
                <Select value={formData.responsible_user_id} onValueChange={(value) => setFormData({ ...formData, responsible_user_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsibleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="operator_notes">Observações do Operador</Label>
                <Textarea
                  id="operator_notes"
                  value={formData.operator_notes}
                  onChange={(e) => setFormData({ ...formData, operator_notes: e.target.value })}
                  rows={4}
                  placeholder="Adicione observações sobre o atendimento..."
                />
              </div>

              <FormError message={formError} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={updateRequest.isPending}>
                {updateRequest.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Solicitação?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Tem certeza que deseja excluir esta solicitação?</span>
              <span className="block font-medium text-foreground">{request.title}</span>
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
