import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle2, DollarSign, Lock, Plus, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { useBroker } from '@/features/brokers/hooks';
import { useClient } from '@/features/clients/hooks';
import { AdjustmentFormDialog } from '@/features/commissions/components/AdjustmentFormDialog';
import { AdjustmentsCard } from '@/features/commissions/components/AdjustmentsCard';
import { CancelCommissionDialog } from '@/features/commissions/components/CancelCommissionDialog';
import { CommissionStatusBadge } from '@/features/commissions/components/CommissionStatusBadge';
import { FinalizeCommissionDialog } from '@/features/commissions/components/FinalizeCommissionDialog';
import { PaymentFormDialog } from '@/features/commissions/components/PaymentFormDialog';
import { PaymentsCard } from '@/features/commissions/components/PaymentsCard';
import { ScheduleCommissionDialog } from '@/features/commissions/components/ScheduleCommissionDialog';
import { formatCurrency } from '@/features/commissions/constants';
import { useCommission, useCommissionAdjustments, useCommissionPayments } from '@/features/commissions/hooks';
import { computeCommissionTotals } from '@/features/commissions/utils';
import { useDeal } from '@/features/deals/hooks';
import { useProject } from '@/features/projects/hooks';
import { useUnit } from '@/features/units/hooks';
import { pageUrl } from '@/lib/page-url';

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR');
}

/**
 * Tradução de `original-project/src/pages/CommissionDetail.jsx`. Sem a
 * checagem `hasAccess`/"Acesso Negado" do original: RLS já restringe
 * `commissions` a admin/comercial/administrativo — o frontend trata o erro
 * de acesso via `ErrorState`, não reimplementa a autorização (CLAUDE.md).
 * `canFinalize` continua exigindo `tenantRole === 'admin'` (regra de
 * negócio do original, `isAdmin`), separada da checagem de acesso à
 * página.
 */
export function CommissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantRole } = useAuth();

  const { data: commission, isLoading, isError, refetch } = useCommission(id);
  const { data: adjustments } = useCommissionAdjustments(id);
  const { data: payments } = useCommissionPayments(id);

  const { data: broker } = useBroker(commission?.broker_id);
  const { data: deal } = useDeal(commission?.deal_id);
  const { data: client } = useClient(deal?.client_id);
  const { data: project } = useProject(commission?.project_id);
  const { data: unit } = useUnit(commission?.unit_id);

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const allAdjustments = adjustments ?? [];
  const allPayments = payments ?? [];

  const totals = useMemo(
    () => (commission ? computeCommissionTotals(commission, allAdjustments, allPayments) : { totalAjustes: 0, totalComissao: 0, totalPago: 0, saldo: 0 }),
    [commission, allAdjustments, allPayments]
  );

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  if (!commission) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">Comissão não encontrada</p>
        <Button onClick={() => navigate(pageUrl('Commissions'))}>Voltar</Button>
      </div>
    );
  }

  const isAdmin = tenantRole === 'admin';
  const canManage = !commission.is_finalizada;
  const canFinalize = isAdmin && !commission.is_finalizada && totals.saldo <= 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Comissão #${commission.id.slice(0, 8)}`}
        subtitle="Detalhes do pagamento"
        backTo="Commissions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {commission.is_finalizada && (
              <Badge className="bg-slate-600 text-white">
                <Lock className="mr-1 h-3 w-3" />
                Finalizada em {formatDate(commission.finalized_at)}
              </Badge>
            )}
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setIsScheduleDialogOpen(true)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Agendar
                </Button>
                <Button variant="outline" onClick={() => setIsAdjustmentDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajuste
                </Button>
                <Button onClick={() => setIsPaymentDialogOpen(true)} disabled={totals.saldo <= 0} className="bg-green-600 text-white hover:bg-green-700">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Registrar Pagamento
                </Button>
              </>
            )}
            {canFinalize && (
              <Button onClick={() => setIsFinalizeDialogOpen(true)} variant="brand">
                <Lock className="mr-2 h-4 w-4" />
                Finalizar Pagamento
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => setIsCancelDialogOpen(true)} className="border-red-200 text-red-600 hover:bg-red-50">
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            )}
          </div>
        }
      />

      {totals.saldo < -0.01 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">Inconsistência Detectada: Saldo Negativo</p>
                <p className="mt-1 text-sm text-amber-700">
                  O total de pagamentos excede o valor da comissão. Revise e exclua/edite pagamentos incorretos para corrigir.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Resumo Financeiro */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <DollarSign className="h-5 w-5" />
              Resumo Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Base:</span>
              <span className="font-medium">{formatCurrency(commission.base_value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Ajustes:</span>
              <span className={`font-medium ${totals.totalAjustes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totals.totalAjustes >= 0 ? '+' : ''}
                {formatCurrency(totals.totalAjustes)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">Total Comissão:</span>
              <span className="font-bold text-brand">{formatCurrency(totals.totalComissao)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Total Pago:</span>
              <span className="font-medium">{formatCurrency(totals.totalPago)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="font-semibold">Saldo:</span>
              <span className={`text-lg font-bold ${totals.saldo < -0.01 ? 'text-red-600' : totals.saldo > 0.01 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCurrency(totals.saldo)}
              </span>
            </div>
            <div className="pt-2">
              <CommissionStatusBadge status={commission.status} />
            </div>
          </CardContent>
        </Card>

        {/* Informações da Venda */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Informações da Venda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Corretor</p>
                  <p className="text-lg font-medium">{broker?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{client?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Projeto</p>
                  <p className="font-medium">{project?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unidade</p>
                  <p className="font-medium">{unit?.sku ?? '—'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Travada</p>
                  <p className="font-medium">{commission.rate ? `${(commission.rate * 100).toFixed(2)}%` : '—'}</p>
                </div>
                {commission.due_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimento</p>
                    <p className="font-medium">{formatDate(commission.due_date)}</p>
                  </div>
                )}
                {commission.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Observações</p>
                    <p className="text-sm">{commission.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <PaymentsCard commissionId={commission.id} payments={allPayments} saldo={totals.saldo} canManage={canManage} />

        <AdjustmentsCard adjustments={allAdjustments} />
      </div>

      <PaymentFormDialog
        open={isPaymentDialogOpen}
        onOpenChange={setIsPaymentDialogOpen}
        commissionId={commission.id}
        saldoDisponivel={totals.saldo}
      />

      <ScheduleCommissionDialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen} commissionId={commission.id} />

      <AdjustmentFormDialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen} commissionId={commission.id} />

      <FinalizeCommissionDialog
        open={isFinalizeDialogOpen}
        onOpenChange={setIsFinalizeDialogOpen}
        commissionId={commission.id}
        totalComissao={totals.totalComissao}
        totalPago={totals.totalPago}
        saldo={totals.saldo}
      />

      <CancelCommissionDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen} commissionId={commission.id} />
    </div>
  );
}
