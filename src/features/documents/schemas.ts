import { z } from 'zod';

import { DOC_TYPE_VALUES } from '@/features/documents/types';

// Diálogo "Novo Documento" — fiel a `Documents.jsx` (`formData`/`handleSubmit`):
// `project_id`/`doc_type`/`title` obrigatórios (mesmos 3 campos do
// `disabled={...}` do botão de submit original), `unit_id`/`issued_at`/`notes`
// opcionais. Upload de arquivo (`File`) fica fora do schema — validado como
// estado de componente (`selectedFile`), fiel ao original, que também não
// exige arquivo para habilitar o submit.
export const documentUploadFormSchema = z.object({
  project_id: z.string().trim().min(1, 'Selecione o projeto.'),
  unit_id: z.string().trim().optional(),
  doc_type: z.enum(DOC_TYPE_VALUES, { error: 'Selecione o tipo de documento.' }),
  title: z.string().trim().min(1, 'Informe o título/descrição do documento.'),
  issued_at: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type DocumentUploadFormInput = z.infer<typeof documentUploadFormSchema>;

export type DocumentUploadMutationPayload = {
  project_id: string;
  unit_id: string | null;
  deal_id: string | null;
  doc_type: DocumentUploadFormInput['doc_type'];
  title: string;
  issued_at: string | null;
  notes: string | null;
  file: File | null;
};

// Diálogo "Editar Documento" — simplificação combinada nesta leva: só
// metadados (tipo/título/data de emissão/observações), SEM reenvio de
// arquivo nem troca de projeto/unidade/status (diferente do original, que
// reaproveita o mesmo dialog de criação inteiro para edição, incluindo
// re-upload e status). Status muda só via `useUpdateDocumentStatus`
// (aprovar/rejeitar), fiel às ações de linha da tabela original.
export const documentMetadataFormSchema = z.object({
  doc_type: z.enum(DOC_TYPE_VALUES, { error: 'Selecione o tipo de documento.' }),
  title: z.string().trim().min(1, 'Informe o título/descrição do documento.'),
  issued_at: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type DocumentMetadataFormInput = z.infer<typeof documentMetadataFormSchema>;

export type DocumentMetadataMutationPayload = {
  doc_type: DocumentMetadataFormInput['doc_type'];
  title: string;
  issued_at: string | null;
  notes: string | null;
};
