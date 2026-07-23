import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DOC_TYPE_LABELS } from '@/features/documents/constants';
import { useUpdateDocument } from '@/features/documents/hooks';
import { documentMetadataFormSchema, type DocumentMetadataFormInput } from '@/features/documents/schemas';
import type { Document, DocumentType } from '@/features/documents/types';

function formFromDocument(document: Document): DocumentMetadataFormInput {
  return {
    doc_type: document.doc_type,
    title: document.title,
    issued_at: document.issued_at ?? '',
    notes: document.notes ?? '',
  };
}

interface DocumentEditDialogProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo "Editar Documento" — só metadados (tipo/título/data de
 * emissão/observações), sem reenvio de arquivo nem troca de status (ver
 * comentário em `schemas.ts` sobre a simplificação em relação ao dialog
 * único de `Documents.jsx`, que reaproveita o mesmo formulário de criação
 * inteiro para edição).
 */
export function DocumentEditDialog({ document, open, onOpenChange }: DocumentEditDialogProps) {
  const [formData, setFormData] = useState<DocumentMetadataFormInput>(
    document ? formFromDocument(document) : { doc_type: 'outros', title: '', issued_at: '', notes: '' }
  );
  const [error, setError] = useState<string | null>(null);

  const updateDocument = useUpdateDocument(document?.id ?? '');

  useEffect(() => {
    if (open && document) {
      setFormData(formFromDocument(document));
      setError(null);
    }
  }, [open, document]);

  function setField<K extends keyof DocumentMetadataFormInput>(field: K, value: DocumentMetadataFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = documentMetadataFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    updateDocument.mutate(
      {
        doc_type: parsed.data.doc_type,
        title: parsed.data.title,
        issued_at: parsed.data.issued_at || null,
        notes: parsed.data.notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Documento atualizado com sucesso.');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Documento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
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
              <Label htmlFor="edit-title">Título / Descrição *</Label>
              <Input id="edit-title" value={formData.title} onChange={(e) => setField('title', e.target.value)} placeholder="Descrição do documento" />
            </div>
            <div>
              <Label htmlFor="edit-issued_at">Data de Emissão</Label>
              <Input id="edit-issued_at" type="date" value={formData.issued_at ?? ''} onChange={(e) => setField('issued_at', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea id="edit-notes" value={formData.notes ?? ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Observações..." rows={2} />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={updateDocument.isPending}>
              {updateDocument.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
