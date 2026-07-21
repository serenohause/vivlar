import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrokerForm } from '@/features/brokers/components/BrokerForm';
import { useUpdateBroker } from '@/features/brokers/hooks';
import type { BrokerMutationPayload } from '@/features/brokers/schemas';
import type { Broker } from '@/features/brokers/types';
import { useRealEstateAgencies } from '@/features/real-estate-agencies/hooks';

interface BrokerEditDialogProps {
  broker: Broker;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de edição — reutilizado tanto na lista (ícone de lápis em cada
 * linha, igual ao original) quanto no detalhe (botão "Editar"). Mesmo
 * padrão de `ClientEditDialog`: o original usa o mesmo dialog para criar e
 * editar, aqui a criação vira página própria (`BrokerFormPage`) e a edição
 * fica só neste dialog.
 */
export function BrokerEditDialog({ broker, open, onOpenChange }: BrokerEditDialogProps) {
  const updateBroker = useUpdateBroker(broker.id);
  const { data: agencies } = useRealEstateAgencies();

  function handleSubmit(data: BrokerMutationPayload) {
    updateBroker.mutate(data, {
      onSuccess: () => {
        toast.success('Corretor atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar corretor.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Corretor</DialogTitle>
        </DialogHeader>
        <BrokerForm
          broker={broker}
          agencies={agencies ?? []}
          onSubmit={handleSubmit}
          isSubmitting={updateBroker.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
