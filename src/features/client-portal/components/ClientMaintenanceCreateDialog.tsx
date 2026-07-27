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
import { clientMaintenanceRequestFormSchema, type ClientMaintenanceRequestFormInput } from '@/features/client-portal/schemas';
import { MaintenancePhotoThumbnail } from '@/features/maintenance/components/MaintenancePhotoThumbnail';
import { MAINTENANCE_PRIORITY_CONFIG, MAINTENANCE_PRIORITY_FILTER_ORDER } from '@/features/maintenance/constants';
import { useCreateMaintenanceRequest, useUploadMaintenancePhoto } from '@/features/maintenance/hooks';
import { MAINTENANCE_CATEGORY_OPTIONS } from '@/features/maintenance/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';

// Mesma checagem client-side já aplicada em `MaintenanceFormDialog.tsx`
// (lado admin) — o bucket `maintenance-photos` já valida no servidor
// (`allowed_mime_types`/`file_size_limit`, `0038_maintenance_requests_storage.sql`),
// replicado aqui só para evitar a viagem de rede até descobrir o erro.
const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_PHOTO_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, mesmo limite do bucket

const emptyForm: ClientMaintenanceRequestFormInput = {
  unit_id: '',
  title: '',
  description: '',
  category: 'Outros',
  priority: 'media',
  suggested_date: '',
};

interface ClientMaintenanceCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Unidades do PRÓPRIO cliente (já filtradas pela RLS em `useUnits()`, ver `ClientMaintenancePage`) — únicas opções do `<Select>`. */
  units: Unit[];
  projects: Project[];
  /** Unidade pré-selecionada via `?unit=<id>` na URL — fiel a `preselectedUnit`/`ClientMaintenance?unit=<id>` (`ClientUnit.jsx` -> `ClientMaintenance.jsx`, original). */
  preselectedUnitId?: string;
}

/**
 * Dialog "Nova Solicitação de Manutenção" do Portal do Cliente — tradução
 * do dialog de criação de `original-project/src/pages/ClientMaintenance.jsx`,
 * com upload real de fotos via Supabase Storage (bucket `maintenance-photos`,
 * mesmo padrão de `MaintenanceFormDialog.tsx`, lado admin/módulo 9).
 *
 * Diferenças em relação ao dialog do lado admin (`MaintenanceFormDialog`):
 * - Sem seleção de cliente (implícito — o próprio `clientId` do usuário
 *   autenticado, injetado pela página, nunca escolhido em formulário).
 * - Unidade restrita às do PRÓPRIO cliente (`units`, já filtrada pela RLS —
 *   nenhuma "lista de todos os clientes" é buscada aqui).
 * - Campo "Data Sugerida" (`suggested_date`), opcional — existe só neste
 *   formulário (ver comentário em `useCreateMaintenanceRequest`, `features/maintenance/hooks.ts`).
 * - Fotos são OBRIGATÓRIAS aqui (mínimo 1) — no lado admin são opcionais.
 *   Fiel a `ClientMaintenance.jsx` (`handleSubmit`: "É obrigatório anexar
 *   pelo menos 1 foto").
 *
 * ACHADO (reportado, não corrigido aqui — fora do escopo de frontend):
 * a RLS de `storage.objects` para o bucket `maintenance-photos`
 * (`0039_rls_maintenance_requests.sql`) só libera select/insert para
 * `tenant_role in ('admin', 'comercial', 'administrativo')` — o papel
 * `cliente` NUNCA foi incluído em nenhuma migration até `0053` (a própria
 * `0038` já sinalizava isso: "revisitar esta migration quando
 * ClientMaintenance.jsx for implementado" — é agora). Sem uma migration nova
 * de RLS liberando `cliente` neste bucket, o upload de foto abaixo falha em
 * runtime para todo usuário com `tenant_role = 'cliente'`. Ver relatório
 * desta tarefa.
 */
export function ClientMaintenanceCreateDialog({ open, onOpenChange, clientId, units, projects, preselectedUnitId }: ClientMaintenanceCreateDialogProps) {
  const [formData, setFormData] = useState<ClientMaintenanceRequestFormInput>(emptyForm);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createRequest = useCreateMaintenanceRequest();
  const uploadPhoto = useUploadMaintenancePhoto();

  useEffect(() => {
    if (open) {
      setFormData({ ...emptyForm, unit_id: preselectedUnitId ?? '' });
      setPhotos([]);
      setError(null);
    }
  }, [open, preselectedUnitId]);

  function setField<K extends keyof ClientMaintenanceRequestFormInput>(field: K, value: ClientMaintenanceRequestFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function projectNameOf(unit: Unit): string {
    return projects.find((p) => p.id === unit.project_id)?.name ?? '—';
  }

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

    const parsed = clientMaintenanceRequestFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    if (photos.length === 0) {
      setError('É obrigatório anexar pelo menos 1 foto do problema.');
      return;
    }

    createRequest.mutate(
      { ...parsed.data, client_id: clientId, photos },
      {
        onSuccess: () => {
          toast.success('Solicitação criada com sucesso!');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  const canSubmit = Boolean(formData.unit_id) && photos.length > 0 && !uploadPhoto.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Solicitação de Manutenção</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Unidade *</Label>
              <Select value={formData.unit_id} onValueChange={(value) => setField('unit_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.sku} - {projectNameOf(unit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="client-maintenance-title">Título *</Label>
              <Input
                id="client-maintenance-title"
                value={formData.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Ex: Vazamento no banheiro"
              />
            </div>

            <div>
              <Label htmlFor="client-maintenance-description">Descrição *</Label>
              <Textarea
                id="client-maintenance-description"
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
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setField('priority', value as ClientMaintenanceRequestFormInput['priority'])}
                >
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
              <Label htmlFor="client-maintenance-suggested-date">Data Sugerida (Opcional)</Label>
              <Input
                id="client-maintenance-suggested-date"
                type="date"
                value={formData.suggested_date}
                onChange={(e) => setField('suggested_date', e.target.value)}
              />
            </div>

            <div>
              <Label>Fotos * (Obrigatório — mínimo 1)</Label>
              <div className="mt-2">
                <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-4 hover:border-brand">
                  <div className="text-center">
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Clique para adicionar fotos</p>
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

              {photos.length === 0 && <p className="mt-1 text-xs text-destructive">* É obrigatório anexar pelo menos 1 foto do problema</p>}
            </div>

            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={!canSubmit || createRequest.isPending}>
              {createRequest.isPending ? 'Enviando...' : 'Enviar Solicitação'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
