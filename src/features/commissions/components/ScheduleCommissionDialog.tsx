import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScheduleCommission } from '@/features/commissions/hooks';
import { commissionScheduleFormSchema } from '@/features/commissions/schemas';

interface ScheduleCommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string;
}

/** Tradução do diálogo "Agendar Pagamento" de `CommissionDetail.jsx` (`isScheduleDialogOpen`/`scheduleMutation`). */
export function ScheduleCommissionDialog({ open, onOpenChange, commissionId }: ScheduleCommissionDialogProps) {
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scheduleCommission = useScheduleCommission(commissionId);

  useEffect(() => {
    if (open) {
      setDueDate('');
      setError(null);
    }
  }, [open]);

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = commissionScheduleFormSchema.safeParse({ due_date: dueDate });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    scheduleCommission.mutate(parsed.data.due_date, {
      onSuccess: () => {
        toast.success('Pagamento agendado.');
        handleClose();
      },
      onError: (mutationError) => setError(mutationError.message),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agendar Pagamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Data de Vencimento *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={scheduleCommission.isPending || !dueDate}>
              {scheduleCommission.isPending ? 'Salvando...' : 'Agendar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
