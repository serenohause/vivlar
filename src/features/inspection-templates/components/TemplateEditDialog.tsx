import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateInspectionTemplate } from '@/features/inspection-templates/hooks';
import { templateFormSchema, type TemplateFormInput } from '@/features/inspection-templates/schemas';
import type { InspectionTemplate } from '@/features/inspection-templates/types';

function formFromTemplate(template: InspectionTemplate): TemplateFormInput {
  return { name: template.name, description: template.description ?? '' };
}

interface TemplateEditDialogProps {
  template: InspectionTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo "Editar Template" (nome/descrição, sem `is_active`) — tradução do
 * `showEditModal` de `TemplateDetail.jsx`. `is_active` só é editável na aba
 * "Configurações" (ver `TemplateSettingsCard`), fiel ao original — os dois
 * pontos de edição usam o mesmo `updateTemplateMutation`/`useUpdateInspectionTemplate`.
 */
export function TemplateEditDialog({ template, open, onOpenChange }: TemplateEditDialogProps) {
  const [formData, setFormData] = useState<TemplateFormInput>(formFromTemplate(template));
  const [error, setError] = useState<string | null>(null);

  const updateTemplate = useUpdateInspectionTemplate(template.id);

  useEffect(() => {
    if (open) {
      setFormData(formFromTemplate(template));
      setError(null);
    }
  }, [open, template]);

  function setField<K extends keyof TemplateFormInput>(field: K, value: TemplateFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = templateFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    updateTemplate.mutate(
      { name: parsed.data.name, description: parsed.data.description || null },
      {
        onSuccess: () => {
          toast.success('Template atualizado!');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Template</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-template-name">Nome *</Label>
              <Input id="edit-template-name" value={formData.name} onChange={(e) => setField('name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-template-description">Descrição</Label>
              <Input id="edit-template-description" value={formData.description ?? ''} onChange={(e) => setField('description', e.target.value)} />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={updateTemplate.isPending}>
              {updateTemplate.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
