import { useState } from 'react';
import { CheckCircle2, Download, MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/features/commissions/constants';
import { PaymentFormDialog } from '@/features/commissions/components/PaymentFormDialog';
import { useSoftDeletePayment } from '@/features/commissions/hooks';
import type { CommissionPayment } from '@/features/commissions/types';

interface PaymentsCardProps {
  commissionId: string;
  payments: CommissionPayment[];
  /** Saldo atual da comissão (base_value + ajustes - total_pago) — usado para calcular o saldo disponível ao editar cada pagamento (saldo + valor do próprio pagamento). */
  saldo: number;
  canManage: boolean;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR');
}

function formatDateTime(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

/**
 * Tradução do card "Pagamentos Registrados" de `CommissionDetail.jsx` —
 * inclui os fluxos "Editar"/"Excluir" (dropdown por item), mesmo padrão de
 * `ParcelasTable` (módulo Financeiro): dialogs de edição/exclusão
 * gerenciados aqui, dentro do card, em vez de na página.
 */
export function PaymentsCard({ commissionId, payments, saldo, canManage }: PaymentsCardProps) {
  const [editTarget, setEditTarget] = useState<CommissionPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommissionPayment | null>(null);

  const softDeletePayment = useSoftDeletePayment(commissionId);

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    softDeletePayment.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Pagamento excluído com sucesso.');
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  if (payments.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="h-5 w-5" />
          Pagamentos Registrados ({payments.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-start justify-between rounded-lg border p-4">
              <div className="flex-1 space-y-1">
                <p className="text-lg font-medium text-green-600">{formatCurrency(payment.valor_pago)}</p>
                <p className="text-sm text-muted-foreground">
                  {payment.payment_method} • {formatDate(payment.data_pagamento)}
                </p>
                {payment.payment_reference && <p className="text-xs text-muted-foreground">Ref: {payment.payment_reference}</p>}
                {payment.observacoes && <p className="mt-1 text-xs text-muted-foreground">{payment.observacoes}</p>}
                <p className="text-xs text-muted-foreground/70">{formatDateTime(payment.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {payment.comprovante_url && (
                  <a
                    href={payment.comprovante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand/80"
                    title="Ver comprovante"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTarget(payment)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteTarget(payment)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <PaymentFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        commissionId={commissionId}
        payment={editTarget}
        saldoDisponivel={saldo + (editTarget?.valor_pago ?? 0)}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pagamento?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir este pagamento?</p>
              {deleteTarget && (
                <div className="rounded bg-muted p-3">
                  <p className="text-sm font-medium text-foreground">Valor: {formatCurrency(deleteTarget.valor_pago)}</p>
                  <p className="text-sm text-muted-foreground">Data: {formatDate(deleteTarget.data_pagamento)}</p>
                  <p className="text-sm text-muted-foreground">Método: {deleteTarget.payment_method}</p>
                </div>
              )}
              <p className="text-sm text-amber-600">Esta ação irá recalcular o saldo da comissão.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={softDeletePayment.isPending} className="bg-destructive hover:bg-destructive/90">
              {softDeletePayment.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
