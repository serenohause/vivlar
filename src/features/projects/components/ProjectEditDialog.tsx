import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectForm } from '@/features/projects/components/ProjectForm';
import { useUpdateProject } from '@/features/projects/hooks';
import type { ProjectMutationPayload } from '@/features/projects/schemas';
import type { Project } from '@/features/projects/types';

interface ProjectEditDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dialog de edição — reutilizado tanto na lista quanto no detalhe, mesmo padrão de `TerrainEditDialog`. */
export function ProjectEditDialog({ project, open, onOpenChange }: ProjectEditDialogProps) {
  const updateProject = useUpdateProject(project.id);

  function handleSubmit(data: ProjectMutationPayload) {
    updateProject.mutate(data, {
      onSuccess: () => {
        toast.success('Projeto atualizado com sucesso!');
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Erro ao atualizar projeto.');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Projeto</DialogTitle>
        </DialogHeader>
        <ProjectForm
          project={project}
          onSubmit={handleSubmit}
          isSubmitting={updateProject.isPending}
          submitLabel="Salvar"
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
