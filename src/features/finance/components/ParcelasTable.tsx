import { useState } from 'react';
import { CheckCircle2, MoreVertical, Pencil, XCircle } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, INSTALLMENT_TYPE_LABELS } from '@/features/finance/constants';
import { InstallmentFormDialog } from '@/features/finance/components/InstallmentFormDialog';
import { InstallmentStatusBadge } from '@/features/finance/components/InstallmentStatusBadge';
import { RegisterPaymentDialog } from '@/features/finance/components/RegisterPaymentDialog';
import { useCancelInstallment } from '@/features/finance/hooks';
import type { PaymentInstallment } from '@/features/finance/types';
import { computeInstallmentDisplayStatus } from '@/features/finance/utils';

interface ParcelasTableProps {
  financeAccountId: string;
  unitId: string;
  clientId: string;
  installments: PaymentInstallment[];
}

/**
 * Tradução da tabela de parcelas de
 * `original-project/src/pages/FinanceDetail.jsx` (aba "Parcelas") —
 * enriquecida com a coluna "Comprovante" de
 * `original-project/src/components/finance/ParcelasTable.jsx` (componente
 * do modelo legado `ParcelasEntrada`, não portado, mas reaproveitado aqui só
 * como referência visual para essa coluna — o dado real é
 * `payment_installments.comprovante_url`, preenchido via
 * `RegisterPaymentDialog`). Diferente do original, "Excluir" vira "Cancelar"
 * (`status: 'cancelado'`, não soft-delete) — a parcela cancelada continua
 * visível na tabela, ver comentário em `useCancelInstallment`.
 */
export function ParcelasTable({ financeAccountId, unitId, clientId, installments }: ParcelasTableProps) {
  const [paymentTarget, setPaymentTarget] = useState<PaymentInstallment | null>(null);
  const [editTarget, setEditTarget] = useState<PaymentInstallment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PaymentInstallment | null>(null);

  const cancelInstallment = useCancelInstallment(financeAccountId);

  function handleConfirmCancel() {
    if (!cancelTarget) return;
    cancelInstallment.mutate(cancelTarget.id, {
      onSuccess: () => {
        toast.success('Parcela cancelada.');
        setCancelTarget(null);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Button size="sm" variant="brand" onClick={() => setCreateOpen(true)}>
          Nova Parcela
        </Button>
      </div>

      {installments.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>Nenhuma parcela cadastrada</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Previsto</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Comprovante</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {installments.map((installment) => {
              const displayStatus = computeInstallmentDisplayStatus(installment);
              const canRegisterPayment = displayStatus !== 'pago' && displayStatus !== 'cancelado';
              const canEdit = installment.status !== 'cancelado';
              const canCancel = installment.status !== 'cancelado';

              return (
                <TableRow key={installment.id}>
                  <TableCell>{INSTALLMENT_TYPE_LABELS[installment.tipo]}</TableCell>
                  <TableCell>{installment.descricao || '—'}</TableCell>
                  <TableCell>{new Date(installment.vencimento).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="text-right">{formatCurrency(installment.valor_previsto)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(installment.valor_pago)}</TableCell>
                  <TableCell>
                    <InstallmentStatusBadge status={displayStatus} />
                  </TableCell>
                  <TableCell>
                    {installment.comprovante_url ? (
                      <a
                        href={installment.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand hover:underline"
                      >
                        Ver arquivo
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canRegisterPayment && (
                          <DropdownMenuItem onClick={() => setPaymentTarget(installment)}>
                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                            Registrar Pagamento
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onClick={() => setEditTarget(installment)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        {canCancel && (
                          <DropdownMenuItem onClick={() => setCancelTarget(installment)} className="text-red-600">
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancelar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <InstallmentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        financeAccountId={financeAccountId}
        unitId={unitId}
        clientId={clientId}
      />

      <InstallmentFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        financeAccountId={financeAccountId}
        unitId={unitId}
        clientId={clientId}
        installment={editTarget}
      />

      <RegisterPaymentDialog
        open={Boolean(paymentTarget)}
        onOpenChange={(open) => !open && setPaymentTarget(null)}
        financeAccountId={financeAccountId}
        installment={paymentTarget}
      />

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Parcela?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja cancelar esta parcela?</p>
              {cancelTarget && (
                <p className="font-medium text-foreground">
                  {INSTALLMENT_TYPE_LABELS[cancelTarget.tipo]} — {formatCurrency(cancelTarget.valor_previsto)}
                </p>
              )}
              <p className="text-sm text-muted-foreground">Ela continua visível no histórico, marcada como cancelada.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive hover:bg-destructive/90">
              Cancelar Parcela
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
