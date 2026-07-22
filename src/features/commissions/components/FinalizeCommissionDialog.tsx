import { Lock } from 'lucide-react';
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
import { formatCurrency } from '@/features/commissions/constants';
import { useFinalizeCommission } from '@/features/commissions/hooks';

interface FinalizeCommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string;
  totalComissao: number;
  totalPago: number;
  saldo: number;
}

/** Tradução do diálogo "Finalizar Comissão" de `CommissionDetail.jsx` (`isFinalizeDialogOpen`/`finalizeMutation`). */
export function FinalizeCommissionDialog({ open, onOpenChange, commissionId, totalComissao, totalPago, saldo }: FinalizeCommissionDialogProps) {
  const finalizeCommission = useFinalizeCommission(commissionId);

  function handleConfirm() {
    finalizeCommission.mutate(undefined, {
      onSuccess: () => {
        toast.success('Comissão finalizada com sucesso.');
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand" />
            Finalizar Comissão
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Ao finalizar, esta comissão ficará <strong>travada</strong> e não poderá mais ser editada.
              </p>
              <div className="mt-3 rounded bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Resumo:</p>
                <p className="text-sm text-muted-foreground">Total Comissão: {formatCurrency(totalComissao)}</p>
                <p className="text-sm text-muted-foreground">Total Pago: {formatCurrency(totalPago)}</p>
                <p className="text-sm font-semibold text-green-600">Saldo: {formatCurrency(saldo)}</p>
              </div>
              <p className="mt-3 text-sm text-amber-600">Esta ação não pode ser desfeita.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={finalizeCommission.isPending} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {finalizeCommission.isPending ? 'Finalizando...' : 'Confirmar Finalização'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
