import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Project } from '@/features/projects/types';
import { UnitForm } from '@/features/units/components/UnitForm';
import { useUpdateUnit } from '@/features/units/hooks';
import type { UnitMutationPayload } from '@/features/units/schemas';
import type { Unit } from '@/features/units/types';

interface UnitEditDialogProps {
  unit: Unit;
  projects: Project[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dialog de edição — reutilizado tanto na lista quanto no detalhe, mesmo padrão de `TerrainEditDialog`/`ProjectEditDialog`. */
export function UnitEditDialog({ unit, projects, open, onOpenChange }: UnitEditDialogProps) {
  const updateUnit = useUpdateUnit(unit.id);

  function handleSubmit(data: UnitMutationPayload) {
    updateUnit.mutate(data, {
      onSuccess: () => {
        toast.success('Unidade atualizada com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar unidade.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Unidade</DialogTitle>
        </DialogHeader>
        <UnitForm
          unit={unit}
          projects={projects}
          onSubmit={handleSubmit}
          isSubmitting={updateUnit.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
