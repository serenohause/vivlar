import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Client } from '@/features/clients/types';
import type { Deal } from '@/features/deals/types';
import { MaintenancePhotoThumbnail } from '@/features/maintenance/components/MaintenancePhotoThumbnail';
import { MAINTENANCE_PRIORITY_CONFIG, MAINTENANCE_PRIORITY_FILTER_ORDER } from '@/features/maintenance/constants';
import { useCreateMaintenanceRequest, useUploadMaintenancePhoto } from '@/features/maintenance/hooks';
import { maintenanceRequestFormSchema, type MaintenanceRequestFormInput } from '@/features/maintenance/schemas';
import { MAINTENANCE_CATEGORY_OPTIONS } from '@/features/maintenance/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';

// Mesma checagem client-side já aplicada no upload de foto de item de
// vistoria (`ChecklistItemCard.tsx`) e no upload de documento
// (`DocumentFormDialog.tsx`) -- `accept="image/*"` do input é só dica de
// UI, o bucket `maintenance-photos` já valida no servidor
// (`allowed_mime_types`/`file_size_limit`, `0038_maintenance_requests_storage.sql`),
// mas replicar aqui evita a viagem de rede para descobrir o erro.
const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_PHOTO_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, mesmo limite do bucket

const emptyForm: MaintenanceRequestFormInput = {
  client_id: '',
  unit_id: '',
  title: '',
  description: '',
  category: 'Outros',
  priority: 'media',
};

interface MaintenanceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Necessário só fora de um contexto travado (ver `lockedContext`) — cliente, e as unidades/negócios usados para filtrar "unidades vendidas para o cliente selecionado" (fiel a `clientUnits`, `AdminMaintenance.jsx`). */
  clients?: Client[];
  units?: Unit[];
  projects?: Project[];
  deals?: Deal[];
  /**
   * Contexto travado (a partir de `UnitDetailPage`): quando presente, os
   * campos Cliente/Unidade não aparecem no formulário — o chamado nasce
   * automaticamente vinculado a esta unidade e ao cliente com negócio
   * `vendido` para ela (resolvido pela própria página antes de abrir o
   * dialog, já que só existe um cliente possível nesse contexto).
   */
  lockedContext?: {
    project_id: string;
    unit_id: string;
    client_id: string;
    label?: string;
  };
}

/**
 * Dialog "Nova Solicitação de Manutenção" — tradução do dialog de criação
 * de `original-project/src/pages/AdminMaintenance.jsx` (`handleCreateSubmit`),
 * com upload real de fotos via Supabase Storage (bucket `maintenance-photos`).
 * Reutilizado em `MaintenanceListPage` (sem `lockedContext`, cliente/unidade
 * escolhidos no formulário, unidade filtrada pelas negociações `vendido` do
 * cliente selecionado) e em `UnitDetailPage` (com `lockedContext`).
 *
 * Sem "Data Sugerida" (`suggested_date`) -- ver decisão documentada em
 * `useCreateMaintenanceRequest`, `hooks.ts`.
 */
export function MaintenanceFormDialog({ open, onOpenChange, clients, units, projects, deals, lockedContext }: MaintenanceFormDialogProps) {
  const [formData, setFormData] = useState<MaintenanceRequestFormInput>(emptyForm);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createRequest = useCreateMaintenanceRequest();
  const uploadPhoto = useUploadMaintenancePhoto();

  useEffect(() => {
    if (open) {
      setFormData(
        lockedContext ? { ...emptyForm, client_id: lockedContext.client_id, unit_id: lockedContext.unit_id } : emptyForm
      );
      setPhotos([]);
      setError(null);
    }
  }, [open, lockedContext]);

  function setField<K extends keyof MaintenanceRequestFormInput>(field: K, value: MaintenanceRequestFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  // Unidades vendidas ("sales_stage" = "vendido") para o cliente selecionado
  // -- fiel a `clientUnits` (`AdminMaintenance.jsx` linhas 218-227).
  const soldUnitsForClient = (units ?? []).filter((unit) => {
    if (!formData.client_id) return false;
    return (deals ?? []).some(
      (deal) => deal.client_id === formData.client_id && deal.unit_id === unit.id && deal.sales_stage === 'vendido' && !deal.is_deleted
    );
  });

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    for (const file of files) {
      if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.type)) {
        toast.error(`"${file.name}": tipo de arquivo não permitido. Envie JPG ou PNG.`);
        continue;
      }
      if (file.size > MAX_PHOTO_FILE_SIZE_BYTES) {
        toast.error(`"${file.name}": arquivo muito grande. O limite é 20MB.`);
        continue;
      }

      try {
        const path = await uploadPhoto.mutateAsync(file);
        setPhotos((current) => [...current, path]);
      } catch {
        toast.error(`Erro ao enviar "${file.name}".`);
      }
    }
  }

  function handleRemovePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = maintenanceRequestFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createRequest.mutate(
      { ...parsed.data, photos },
      {
        onSuccess: () => {
          toast.success('Solicitação criada com sucesso!');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  const canSubmit = Boolean(formData.client_id) && Boolean(formData.unit_id) && !uploadPhoto.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Solicitação de Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {lockedContext ? (
              lockedContext.label && (
                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{lockedContext.label}</div>
              )
            ) : (
              <>
                <div>
                  <Label>Cliente *</Label>
                  <Select value={formData.client_id} onValueChange={(value) => setFormData({ ...formData, client_id: value, unit_id: '' })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {(clients ?? []).map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Unidade *</Label>
                  <Select value={formData.unit_id} onValueChange={(value) => setField('unit_id', value)} disabled={!formData.client_id}>
                    <SelectTrigger>
                      <SelectValue placeholder={!formData.client_id ? 'Selecione um cliente primeiro' : 'Selecione a unidade'} />
                    </SelectTrigger>
                    <SelectContent>
                      {soldUnitsForClient.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">Cliente não possui unidades vendidas</div>
                      ) : (
                        soldUnitsForClient.map((unit) => {
                          const project = (projects ?? []).find((p) => p.id === unit.project_id);
                          return (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.sku} - {project?.name ?? ''}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="maintenance-title">Título *</Label>
              <Input
                id="maintenance-title"
                value={formData.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Ex: Vazamento no banheiro"
              />
            </div>

            <div>
              <Label htmlFor="maintenance-description">Descrição *</Label>
              <Textarea
                id="maintenance-description"
                value={formData.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Descreva o problema com detalhes..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria *</Label>
                <Select value={formData.category} onValueChange={(value) => setField('category', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Prioridade *</Label>
                <Select value={formData.priority} onValueChange={(value) => setField('priority', value as MaintenanceRequestFormInput['priority'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_PRIORITY_FILTER_ORDER.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {MAINTENANCE_PRIORITY_CONFIG[priority].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Fotos (Opcional)</Label>
              <div className="mt-2">
                <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 hover:border-brand">
                  <div className="text-center">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Clique para adicionar fotos (opcional)</p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png"
                    onChange={handlePhotoChange}
                    className="hidden"
                    disabled={uploadPhoto.isPending}
                  />
                </label>
              </div>

              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((path, index) => (
                    <MaintenancePhotoThumbnail key={path} path={path} onDelete={() => handleRemovePhoto(index)} />
                  ))}
                </div>
              )}
            </div>

            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={!canSubmit || createRequest.isPending}>
              {createRequest.isPending ? 'Criando...' : 'Criar Solicitação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
