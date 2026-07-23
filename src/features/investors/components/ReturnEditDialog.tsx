import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReturnForm } from '@/features/investors/components/ReturnForm';
import { useUpdateInvestmentReturn } from '@/features/investors/hooks';
import type { InvestmentReturnMutationPayload } from '@/features/investors/schemas';
import type { InvestmentReturn, Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

interface ReturnEditDialogProps {
  investmentReturn: InvestmentReturn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investors: Investor[];
  projects: Project[];
}

/** Diálogo "Editar Retorno". */
export function ReturnEditDialog({ investmentReturn, open, onOpenChange, investors, projects }: ReturnEditDialogProps) {
  const updateReturn = useUpdateInvestmentReturn(investmentReturn.id);

  function handleSubmit(data: InvestmentReturnMutationPayload) {
    updateReturn.mutate(data, {
      onSuccess: () => {
        toast.success('Retorno atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao atualizar retorno.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Retorno</DialogTitle>
        </DialogHeader>
        <ReturnForm
          investmentReturn={investmentReturn}
          investors={investors}
          projects={projects}
          onSubmit={handleSubmit}
          isSubmitting={updateReturn.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
