import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContributionForm } from '@/features/investors/components/ContributionForm';
import { useCreateInvestmentContribution } from '@/features/investors/hooks';
import type { InvestmentContributionMutationPayload } from '@/features/investors/schemas';
import type { Investor } from '@/features/investors/types';
import type { Project } from '@/features/projects/types';

interface ContributionCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investors: Investor[];
  projects: Project[];
  lockedProjectId?: string;
}

/** Diálogo "Novo Aporte" — tradução do dialog de criação de `original-project/src/pages/InvestmentContributions.jsx`. */
export function ContributionCreateDialog({ open, onOpenChange, investors, projects, lockedProjectId }: ContributionCreateDialogProps) {
  const createContribution = useCreateInvestmentContribution();

  function handleSubmit(data: InvestmentContributionMutationPayload) {
    createContribution.mutate(data, {
      onSuccess: () => {
        toast.success('Aporte criado com sucesso!');
        onOpenChange(false);
      },
      onError: () => toast.error('Erro ao criar aporte.'),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Aporte</DialogTitle>
        </DialogHeader>
        <ContributionForm
          investors={investors}
          projects={projects}
          lockedProjectId={lockedProjectId}
          onSubmit={handleSubmit}
          isSubmitting={createContribution.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
