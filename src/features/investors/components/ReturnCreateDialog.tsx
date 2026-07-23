import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReturnForm } from '@/features/investors/components/ReturnForm';
import { useCreateInvestmentReturn } from '@/features/investors/hooks';
import type { InvestmentReturnMutationPayload } from '@/features/investors/schemas';
import type { Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

interface ReturnCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investors: Investor[];
  projects: Project[];
  lockedProjectId?: string;
}

/** Diálogo "Novo Retorno" — tradução do dialog de criação de `original-project/src/pages/InvestmentReturns.jsx`. */
export function ReturnCreateDialog({ open, onOpenChange, investors, projects, lockedProjectId }: ReturnCreateDialogProps) {
  const createReturn = useCreateInvestmentReturn();

  function handleSubmit(data: InvestmentReturnMutationPayload) {
    createReturn.mutate(data, {
      onSuccess: () => {
        toast.success('Retorno criado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao criar retorno.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Retorno</DialogTitle>
        </DialogHeader>
        <ReturnForm
          investors={investors}
          projects={projects}
          lockedProjectId={lockedProjectId}
          onSubmit={handleSubmit}
          isSubmitting={createReturn.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
