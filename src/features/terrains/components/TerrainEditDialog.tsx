import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TerrainForm } from '@/features/terrains/components/TerrainForm';
import { useUpdateTerrain } from '@/features/terrains/hooks';
import type { TerrainMutationPayload } from '@/features/terrains/schemas';
import type { Terrain } from '@/features/terrains/types';

interface TerrainEditDialogProps {
  terrain: Terrain;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog de edição — reutilizado tanto na lista (ícone de lápis em cada
 * linha, igual ao original) quanto no detalhe (botão "Editar", que no
 * original só trocava o rótulo do botão sem abrir nenhum formulário —
 * lacuna sinalizada no relatório final; resolvida aqui reaproveitando o
 * mesmo formulário/linguagem visual do dialog de criação, em vez de um
 * estilo de edição inline à parte).
 */
export function TerrainEditDialog({ terrain, open, onOpenChange }: TerrainEditDialogProps) {
  const updateTerrain = useUpdateTerrain(terrain.id);

  function handleSubmit(data: TerrainMutationPayload) {
    updateTerrain.mutate(data, {
      onSuccess: () => {
        toast.success('Terreno atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar terreno.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Terreno</DialogTitle>
        </DialogHeader>
        <TerrainForm
          terrain={terrain}
          onSubmit={handleSubmit}
          isSubmitting={updateTerrain.isPending}
          submitLabel="Atualizar Terreno"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
