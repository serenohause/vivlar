import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientForm } from '@/features/clients/components/ClientForm';
import { useUpdateClient } from '@/features/clients/hooks';
import type { ClientMutationPayload } from '@/features/clients/schemas';
import type { Client } from '@/features/clients/types';

interface ClientEditDialogProps {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de edição — reutilizado tanto na lista (ícone de lápis em cada
 * linha, igual ao original) quanto no detalhe (botão "Editar"). Mesmo
 * padrão de `TerrainEditDialog`/`UnitEditDialog`: o original usa o mesmo
 * dialog para criar e editar, aqui a criação vira página própria
 * (`ClientFormPage`) e a edição fica só neste dialog.
 */
export function ClientEditDialog({ client, open, onOpenChange }: ClientEditDialogProps) {
  const updateClient = useUpdateClient(client.id);

  function handleSubmit(data: ClientMutationPayload) {
    updateClient.mutate(data, {
      onSuccess: () => {
        toast.success('Cliente atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar cliente.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
        </DialogHeader>
        <ClientForm
          client={client}
          onSubmit={handleSubmit}
          isSubmitting={updateClient.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
