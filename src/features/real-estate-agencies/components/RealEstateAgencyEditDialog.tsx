import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RealEstateAgencyForm } from '@/features/real-estate-agencies/components/RealEstateAgencyForm';
import { useUpdateRealEstateAgency } from '@/features/real-estate-agencies/hooks';
import type { RealEstateAgencyMutationPayload } from '@/features/real-estate-agencies/schemas';
import type { RealEstateAgency } from '@/features/real-estate-agencies/types';

interface RealEstateAgencyEditDialogProps {
  agency: RealEstateAgency;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de edição — reutilizado tanto na lista (ícone de lápis em cada
 * linha, igual ao original) quanto no detalhe (botão "Editar"). Mesmo
 * padrão de `ClientEditDialog`/`TerrainEditDialog`: o original usa o mesmo
 * dialog para criar e editar, aqui a criação vira página própria
 * (`RealEstateAgencyFormPage`) e a edição fica só neste dialog.
 */
export function RealEstateAgencyEditDialog({ agency, open, onOpenChange }: RealEstateAgencyEditDialogProps) {
  const updateAgency = useUpdateRealEstateAgency(agency.id);

  function handleSubmit(data: RealEstateAgencyMutationPayload) {
    updateAgency.mutate(data, {
      onSuccess: () => {
        toast.success('Imobiliária atualizada com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar imobiliária.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Imobiliária</DialogTitle>
        </DialogHeader>
        <RealEstateAgencyForm
          agency={agency}
          onSubmit={handleSubmit}
          isSubmitting={updateAgency.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
