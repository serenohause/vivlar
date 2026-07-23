import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateInspectionTemplate } from '@/features/inspection-templates/hooks';
import { templateFormSchema, type TemplateFormInput } from '@/features/inspection-templates/schemas';

const emptyForm: TemplateFormInput = { name: '', description: '' };

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Diálogo "Novo Template" — tradução do `showCreateModal` de `original-project/src/pages/Templates.jsx`. */
export function TemplateFormDialog({ open, onOpenChange }: TemplateFormDialogProps) {
  const [formData, setFormData] = useState<TemplateFormInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const createTemplate = useCreateInspectionTemplate();

  useEffect(() => {
    if (open) {
      setFormData(emptyForm);
      setError(null);
    }
  }, [open]);

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

    createTemplate.mutate(
      { name: parsed.data.name, description: parsed.data.description || null },
      {
        onSuccess: () => {
          toast.success('Template criado com sucesso!');
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
          <DialogTitle>Novo Template</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template-name">Nome *</Label>
              <Input
                id="template-name"
                value={formData.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Ex: Vistoria de Entrega Padrão"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Descrição</Label>
              <Input
                id="template-description"
                value={formData.description ?? ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Descrição do template..."
              />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createTemplate.isPending}>
              {createTemplate.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
