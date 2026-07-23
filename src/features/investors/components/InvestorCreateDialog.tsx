import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InvestorForm } from '@/features/investors/components/InvestorForm';
import { useCreateInvestor } from '@/features/investors/hooks';
import type { InvestorMutationPayload } from '@/features/investors/schemas';

interface InvestorCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Diálogo "Novo Investidor" — tradução do dialog de criação de `original-project/src/pages/Investors.jsx`. */
export function InvestorCreateDialog({ open, onOpenChange }: InvestorCreateDialogProps) {
  const createInvestor = useCreateInvestor();

  function handleSubmit(data: InvestorMutationPayload) {
    createInvestor.mutate(data, {
      onSuccess: () => {
        toast.success('Investidor criado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao criar investidor.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Investidor</DialogTitle>
        </DialogHeader>
        <InvestorForm onSubmit={handleSubmit} isSubmitting={createInvestor.isPending} submitLabel="Salvar" onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
