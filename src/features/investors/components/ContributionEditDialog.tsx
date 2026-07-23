import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContributionForm } from '@/features/investors/components/ContributionForm';
import { useUpdateInvestmentContribution } from '@/features/investors/hooks';
import type { InvestmentContributionMutationPayload } from '@/features/investors/schemas';
import type { InvestmentContribution, Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

interface ContributionEditDialogProps {
  contribution: InvestmentContribution;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investors: Investor[];
  projects: Project[];
}

/** Diálogo "Editar Aporte". */
export function ContributionEditDialog({ contribution, open, onOpenChange, investors, projects }: ContributionEditDialogProps) {
  const updateContribution = useUpdateInvestmentContribution(contribution.id);

  function handleSubmit(data: InvestmentContributionMutationPayload) {
    updateContribution.mutate(data, {
      onSuccess: () => {
        toast.success('Aporte atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao atualizar aporte.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Aporte</DialogTitle>
        </DialogHeader>
        <ContributionForm
          contribution={contribution}
          investors={investors}
          projects={projects}
          onSubmit={handleSubmit}
          isSubmitting={updateContribution.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
