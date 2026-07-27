import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Wrench, X } from 'lucide-react';
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
import { LoadingInline } from '@/components/ui/loading-inline';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { ClientMaintenanceCreateDialog } from '@/features/client-portal/components/ClientMaintenanceCreateDialog';
import { useMyClient } from '@/features/client-portal/hooks';
import { MaintenancePriorityBadge } from '@/features/maintenance/components/MaintenancePriorityBadge';
import { MaintenanceStatusBadge } from '@/features/maintenance/components/MaintenanceStatusBadge';
import { useCancelMaintenanceRequest, useMaintenanceRequests } from '@/features/maintenance/hooks';
import type { MaintenanceRequest } from '@/features/maintenance/types';
import { useProjects } from '@/features/projects/hooks';
import { useUnits } from '@/features/units/hooks';

/**
 * Tradução de `original-project/src/pages/ClientMaintenance.jsx` — terceira
 * tela do Portal do Cliente ("Minhas Manutenções"): lista dos PRÓPRIOS
 * chamados, dialog de criação e cancelamento.
 *
 * `useMaintenanceRequests()` é a MESMA query do lado admin/operador
 * (`MaintenanceListPage`) — a RLS (`maintenance_requests_select_tenant_client_own`,
 * `0053_rls_client_portal_access.sql`, via `client_owns_client_record()`)
 * já devolve só os chamados do cliente autenticado, mesma simplificação de
 * `ClientUnitPage`/`ClientFinancePage`.
 *
 * SEM link "ver detalhe" nesta rodada (simplificação deliberada, ver
 * relatório da tarefa): a tela de detalhe existente (`MaintenanceDetailPage`,
 * rota `/admin-maintenance/:id`) já esconde os controles internos
 * (Atualizar/Excluir) para quem não é `admin`/`comercial`/`administrativo`,
 * então tecnicamente é segura para o cliente acessar — mas o link "Voltar"
 * dela aponta para a lista ADMIN (`AdminMaintenance`), rota fora de
 * `CLIENT_ALLOWED_PAGES` (`features/dashboard/navigation.ts`): o cliente
 * seria redirecionado de volta para "Minha Unidade" ao clicar em voltar, uma
 * navegação confusa. A própria tabela abaixo já cobre status/prioridade/
 * agendamento/cancelamento sem precisar de uma tela de detalhe separada.
 *
 * Cancelamento (`useCancelMaintenanceRequest`) só aparece para chamados
 * `status === 'aberto'`, espelhando a MESMA regra que a RLS/trigger do banco
 * já impõem (`0053_rls_client_portal_access.sql`) — não é só cosmético,
 * qualquer tentativa fora dessa transição seria rejeitada pelo banco de
 * qualquer forma.
 */
export function ClientMaintenancePage() {
  const [searchParams] = useSearchParams();
  const preselectedUnitId = searchParams.get('unit') ?? undefined;

  const { data: client, isLoading: isLoadingClient, isError: isErrorClient, refetch: refetchClient } = useMyClient();
  const { data: units, isLoading: isLoadingUnits, isError: isErrorUnits, refetch: refetchUnits } = useUnits();
  const { data: projects } = useProjects();
  const {
    data: requests,
    isLoading: isLoadingRequests,
    isError: isErrorRequests,
    refetch: refetchRequests,
  } = useMaintenanceRequests();

  const [showCreateDialog, setShowCreateDialog] = useState(Boolean(preselectedUnitId));
  const [cancelConfirm, setCancelConfirm] = useState<MaintenanceRequest | null>(null);

  const cancelRequest = useCancelMaintenanceRequest();

  const isLoading = isLoadingClient || (Boolean(client) && (isLoadingUnits || isLoadingRequests));
  const isError = isErrorClient || isErrorUnits || isErrorRequests;

  const myUnits = units ?? [];
  const myRequests = requests ?? [];
  const allProjects = projects ?? [];

  function unitSku(unitId: string): string {
    return myUnits.find((u) => u.id === unitId)?.sku ?? '—';
  }

  function projectName(projectId: string): string {
    return allProjects.find((p) => p.id === projectId)?.name ?? '—';
  }

  function handleConfirmCancel() {
    if (!cancelConfirm) return;
    cancelRequest.mutate(cancelConfirm.id, {
      onSuccess: () => {
        toast.success('Solicitação cancelada com sucesso');
        setCancelConfirm(null);
      },
      onError: () => toast.error('Erro ao cancelar solicitação.'),
    });
  }

  if (isLoading) return <LoadingInline />;
  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetchClient();
          void refetchUnits();
          void refetchRequests();
        }}
      />
    );
  }

  if (!client) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="max-w-md border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
            <h3 className="mb-2 text-lg font-semibold">Perfil não vinculado</h3>
            <p className="text-slate-600">
              Você ainda não possui um perfil de cliente vinculado. Entre em contato com a Vivlar para mais informações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (myUnits.length === 0) {
    return (
      <div>
        <PageHeader title="Minhas Manutenções" subtitle="Solicitações de manutenção" />
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
            <h3 className="mb-2 text-lg font-semibold">Nenhuma unidade vinculada</h3>
            <p className="text-slate-600">
              Você ainda não possui uma unidade ativa vinculada ao seu perfil. Não é possível abrir solicitações de manutenção.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas Manutenções"
        subtitle="Acompanhe suas solicitações de manutenção"
        actions={
          <Button variant="brand" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Solicitação
          </Button>
        }
      />

      {myRequests.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Nenhuma solicitação ainda"
          description="Crie sua primeira solicitação de manutenção"
          action={() => setShowCreateDialog(true)}
          actionLabel="Nova Solicitação"
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
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Agendamento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{new Date(request.opened_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{projectName(request.project_id)}</TableCell>
                    <TableCell className="font-medium">{unitSku(request.unit_id)}</TableCell>
                    <TableCell>{request.title}</TableCell>
                    <TableCell>{request.category}</TableCell>
                    <TableCell>
                      <MaintenancePriorityBadge priority={request.priority} />
                    </TableCell>
                    <TableCell>
                      <MaintenanceStatusBadge status={request.status} />
                    </TableCell>
                    <TableCell>{request.scheduled_date ? new Date(request.scheduled_date).toLocaleDateString('pt-BR') : '—'}</TableCell>
                    <TableCell className="text-right">
                      {request.status === 'aberto' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          title="Cancelar"
                          onClick={() => setCancelConfirm(request)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ClientMaintenanceCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        clientId={client.id}
        units={myUnits}
        projects={allProjects}
        preselectedUnitId={preselectedUnitId}
      />

      <AlertDialog open={Boolean(cancelConfirm)} onOpenChange={(open) => !open && setCancelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Solicitação?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Tem certeza que deseja cancelar esta solicitação?</span>
              <span className="block font-medium text-foreground">{cancelConfirm?.title}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive hover:bg-destructive/90" disabled={cancelRequest.isPending}>
              {cancelRequest.isPending ? 'Cancelando...' : 'Cancelar Solicitação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
