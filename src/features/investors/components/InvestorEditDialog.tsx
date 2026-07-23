import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InvestorForm } from '@/features/investors/components/InvestorForm';
import { useUpdateInvestor } from '@/features/investors/hooks';
import type { InvestorMutationPayload } from '@/features/investors/schemas';
import type { Investor } from '@/features/investors/types';

interface InvestorEditDialogProps {
  investor: Investor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Diálogo "Editar Investidor" — reutilizado na lista (ícone de lápis) e no detalhe. */
export function InvestorEditDialog({ investor, open, onOpenChange }: InvestorEditDialogProps) {
  const updateInvestor = useUpdateInvestor(investor.id);

  function handleSubmit(data: InvestorMutationPayload) {
    updateInvestor.mutate(data, {
      onSuccess: () => {
        toast.success('Investidor atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao atualizar investidor.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Investidor</DialogTitle>
        </DialogHeader>
        <InvestorForm
          investor={investor}
          onSubmit={handleSubmit}
          isSubmitting={updateInvestor.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
