import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FileText, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DOC_TYPE_LABELS } from '@/features/documents/constants';
import { useUploadDocument } from '@/features/documents/hooks';
import { documentUploadFormSchema, type DocumentUploadFormInput } from '@/features/documents/schemas';
import type { DocumentType } from '@/features/documents/types';
import type { Project } from '@/features/projects/types';
import type { Unit } from '@/features/units/types';

// Achado de auditoria de segurança (severidade média): `accept` do
// `<input type="file">` é só uma dica de UI do seletor do SO, não impede
// selecionar outro tipo ("todos os arquivos") nem limita tamanho — sem
// isso, nada barrava upload de tipo/tamanho arbitrário antes de chegar no
// bucket. Mesmos limites espelhados no bucket via `allowed_mime_types`/
// `file_size_limit` (ver migration de storage), defesa em profundidade.
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

const emptyForm: DocumentUploadFormInput = {
  project_id: '',
  unit_id: '',
  doc_type: 'outros',
  title: '',
  issued_at: '',
  notes: '',
};

interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lista de projetos/unidades para os `<Select>` — só necessário fora de um contexto travado (ver `lockedContext`). */
  projects?: Project[];
  units?: Unit[];
  /**
   * Contexto travado (a partir de `UnitDetailPage`/`DealDetailPage`): quando
   * presente, os campos Projeto/Unidade não aparecem no formulário — o
   * documento nasce automaticamente vinculado a este projeto/unidade/negócio,
   * sem o usuário poder trocar (fiel ao `unit_id`/`project_id` fixo passado
   * por essas telas no original, `UnitDetail.jsx`/`DealDetail.jsx`).
   */
  lockedContext?: {
    project_id: string;
    unit_id?: string | null;
    deal_id?: string | null;
    label?: string;
  };
}

/**
 * Diálogo "Novo Documento" — tradução do dialog de criação de
 * `original-project/src/pages/Documents.jsx` (`handleSubmit` no caminho de
 * criação), com upload real de arquivo via Supabase Storage (ver
 * `useUploadDocument`, `features/documents/hooks.ts`). Reutilizado em
 * `DocumentsListPage` (sem `lockedContext`, projeto/unidade escolhidos no
 * formulário) e em `UnitDetailPage`/`DealDetailPage` (com `lockedContext`).
 */
export function DocumentFormDialog({ open, onOpenChange, projects, units, lockedContext }: DocumentFormDialogProps) {
  const [formData, setFormData] = useState<DocumentUploadFormInput>(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadDocument = useUploadDocument();

  useEffect(() => {
    if (open) {
      setFormData(lockedContext ? { ...emptyForm, project_id: lockedContext.project_id } : emptyForm);
      setSelectedFile(null);
      setError(null);
    }
  }, [open, lockedContext]);

  function setField<K extends keyof DocumentUploadFormInput>(field: K, value: DocumentUploadFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Tipo de arquivo não permitido. Envie PDF, JPG ou PNG.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('Arquivo muito grande. O limite é 20MB.');
      event.target.value = '';
      return;
    }

    setError(null);
    setSelectedFile(file);
  }

  const projectUnits = (units ?? []).filter((unit) => unit.project_id === formData.project_id);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = documentUploadFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    const payload = {
      project_id: lockedContext?.project_id ?? parsed.data.project_id,
      unit_id: lockedContext ? (lockedContext.unit_id ?? null) : parsed.data.unit_id || null,
      deal_id: lockedContext?.deal_id ?? null,
      doc_type: parsed.data.doc_type,
      title: parsed.data.title,
      issued_at: parsed.data.issued_at || null,
      notes: parsed.data.notes || null,
      file: selectedFile,
    };

    uploadDocument.mutate(payload, {
      onSuccess: () => {
        toast.success('Documento enviado com sucesso.');
        handleClose();
      },
      onError: (mutationError) => setError(mutationError.message),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Documento</DialogTitle>
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
                  <Label>Projeto *</Label>
                  <Select value={formData.project_id} onValueChange={(value) => setFormData({ ...formData, project_id: value, unit_id: '' })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects ?? []).map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.project_id && (
                  <div>
                    <Label>Unidade (opcional)</Label>
                    <Select value={formData.unit_id} onValueChange={(value) => setField('unit_id', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a unidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.sku}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div>
              <Label>Tipo de Documento *</Label>
              <Select value={formData.doc_type} onValueChange={(value) => setField('doc_type', value as DocumentType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Título / Descrição *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Descrição do documento"
              />
            </div>
            <div>
              <Label htmlFor="issued_at">Data de Emissão</Label>
              <Input id="issued_at" type="date" value={formData.issued_at ?? ''} onChange={(e) => setField('issued_at', e.target.value)} />
            </div>
            <div>
              <Label>Arquivo</Label>
              <div className="rounded-lg border-2 border-dashed p-4 text-center">
                <input type="file" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" className="hidden" id="document-file-upload" />
                <label htmlFor="document-file-upload" className="cursor-pointer">
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-brand">
                      <FileText className="h-5 w-5" />
                      <span>{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="mx-auto mb-2 h-8 w-8" />
                      <p>Clique para selecionar um arquivo</p>
                      <p className="text-xs text-muted-foreground/70">PDF, JPG ou PNG</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={formData.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Observações..." rows={2} />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={uploadDocument.isPending}>
              {uploadDocument.isPending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
