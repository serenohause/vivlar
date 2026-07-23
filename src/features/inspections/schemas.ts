import { z } from 'zod';

// Passo 1+2 do wizard "Nova Vistoria" (`CreateInspection.jsx`): unidade e
// template obrigatórios antes do passo 3 (confirmação). Os demais campos da
// `inspection` (project_id derivado da unidade, client_id derivado de
// `getClientForUnit`, status/totais iniciais) não vêm de input do usuário —
// calculados em `useCreateInspection` (`hooks.ts`), fora deste schema.
export const createInspectionSchema = z.object({
  unit_id: z.string().trim().min(1, 'Selecione uma unidade.'),
  template_id: z.string().trim().min(1, 'Selecione um template de checklist.'),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

// Demais interações deste módulo (resultado/comentário de item, upload de
// foto, assinatura, mudança de status) não passam por formulário livre —
// são cliques em botão/upload de arquivo com dado já determinado pelo
// contexto (usuário logado, item selecionado), sem necessidade de um
// schema Zod próprio (mesmo critério de `useUpdateDocumentStatus`,
// `features/documents/hooks.ts`, que também não tem schema).
