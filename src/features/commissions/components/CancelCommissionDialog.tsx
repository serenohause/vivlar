import { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCancelCommission } from '@/features/commissions/hooks';

interface CancelCommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string;
}

/** Tradução do diálogo "Cancelar Comissão" de `CommissionDetail.jsx` (`isCancelDialogOpen`/`cancelMutation`). */
export function CancelCommissionDialog({ open, onOpenChange, commissionId }: CancelCommissionDialogProps) {
  const [reason, setReason] = useState('');
  const cancelCommission = useCancelCommission(commissionId);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  function handleConfirm() {
    cancelCommission.mutate(reason, {
      onSuccess: () => {
        toast.success('Comissão cancelada.');
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar Comissão</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>Esta ação irá cancelar esta comissão.</p>
              <div>
                <Label>Motivo do Cancelamento *</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo..." className="mt-2" rows={3} />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={cancelCommission.isPending || !reason.trim()} className="bg-destructive hover:bg-destructive/90">
            {cancelCommission.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
