import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORY_SUGGESTIONS, SEVERITY_CONFIG } from '@/features/inspection-templates/constants';
import { useCreateTemplateItem, useUpdateTemplateItem } from '@/features/inspection-templates/hooks';
import { templateItemFormSchema, type TemplateItemFormInput } from '@/features/inspection-templates/schemas';
import { INSPECTION_SEVERITY_VALUES, type InspectionTemplateItem } from '@/features/inspection-templates/types';

const emptyForm: TemplateItemFormInput = {
  category: '',
  title: '',
  instructions: '',
  severity_default: 'media',
  requires_photo: false,
};

function formFromItem(item: InspectionTemplateItem): TemplateItemFormInput {
  return {
    category: item.category,
    title: item.title,
    instructions: item.instructions ?? '',
    severity_default: item.severity_default,
    requires_photo: item.requires_photo,
  };
}

interface TemplateItemFormDialogProps {
  templateId: string;
  /** `null` = criação de um novo item; presente = edição — mesmo dialog para os dois casos, fiel ao `showItemModal`/`editingItem` de `TemplateDetail.jsx`. */
  item: InspectionTemplateItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Diálogo "Novo/Editar Item" de checklist — tradução do `showItemModal` de `original-project/src/pages/TemplateDetail.jsx`. */
export function TemplateItemFormDialog({ templateId, item, open, onOpenChange }: TemplateItemFormDialogProps) {
  const [formData, setFormData] = useState<TemplateItemFormInput>(item ? formFromItem(item) : emptyForm);
  const [error, setError] = useState<string | null>(null);

  const createItem = useCreateTemplateItem(templateId);
  const updateItem = useUpdateTemplateItem(templateId);
  const isPending = createItem.isPending || updateItem.isPending;

  useEffect(() => {
    if (open) {
      setFormData(item ? formFromItem(item) : emptyForm);
      setError(null);
    }
  }, [open, item]);

  function setField<K extends keyof TemplateItemFormInput>(field: K, value: TemplateItemFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = templateItemFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    const payload = {
      category: parsed.data.category,
      title: parsed.data.title,
      instructions: parsed.data.instructions || null,
      severity_default: parsed.data.severity_default,
      requires_photo: parsed.data.requires_photo,
    };

    const onSettled = {
      onSuccess: () => {
        toast.success(item ? 'Item atualizado!' : 'Item criado!');
        handleClose();
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    };

    if (item) {
      updateItem.mutate({ id: item.id, data: payload }, onSettled);
    } else {
      createItem.mutate(payload, onSettled);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar Item' : 'Novo Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Categoria *</Label>
              <Select value={formData.category} onValueChange={(value) => setField('category', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_SUGGESTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="item-title">Título *</Label>
              <Input id="item-title" value={formData.title} onChange={(e) => setField('title', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="item-instructions">Instruções</Label>
              <Textarea
                id="item-instructions"
                value={formData.instructions ?? ''}
                onChange={(e) => setField('instructions', e.target.value)}
                rows={3}
                placeholder="Instruções para o vistoriador..."
              />
            </div>
            <div>
              <Label>Severidade Padrão *</Label>
              <Select value={formData.severity_default} onValueChange={(value) => setField('severity_default', value as TemplateItemFormInput['severity_default'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a severidade" />
                </SelectTrigger>
                <SelectContent>
                  {INSPECTION_SEVERITY_VALUES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {SEVERITY_CONFIG[severity].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label>Foto Obrigatória</Label>
                <p className="text-sm text-muted-foreground">Exigir foto para este item na vistoria</p>
              </div>
              <Switch checked={formData.requires_photo} onCheckedChange={(checked) => setField('requires_photo', checked)} />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
