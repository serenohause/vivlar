import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no formulário
// original (`original-project/src/pages/Projects.jsx`): código e nome. O
// resto é opcional, igual ao original — inclusive `city`/`state`/
// `closed_at`/`cycle_start_date`/`cycle_end_date` (colunas existem na
// tabela, mas o original nunca as edita em `Projects.jsx`/`ProjectDetail.jsx`
// — `closed_at`/`cycle_*` só aparecem em Resultado Operacional, fora de
// escopo aqui — então ficam fora deste formulário também).
export const projectFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código.'),
  name: z.string().trim().min(1, 'Informe o nome.'),
  address: z.string().trim().optional(),
  total_units: z.coerce.number().int().positive().optional(),
  status: z.enum(['planejamento', 'em_obras', 'em_vendas', 'totalmente_vendido', 'entregue']),
  start_sales_at: z.string().trim().optional(),
  notes: z.string().trim().optional(),

  // Espelho de Vendas (site público) — só slug/is_public, os únicos dois
  // campos de marketing público que o formulário original edita (ver
  // comentário em `types.ts`).
  slug: z.string().trim().optional(),
  is_public: z.boolean(),
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;

/**
 * Payload que de fato sai de `ProjectForm` para as mutations
 * (`useCreateProject`/`useUpdateProject`) — igual a `ProjectFormInput`, mas
 * com os campos opcionais normalizados para `null`/`number | null` em vez
 * de `undefined`/string vazia, já prontos para colunas nullable do banco.
 */
export interface ProjectMutationPayload {
  code: string;
  name: string;
  address: string | null;
  total_units: number | null;
  status: ProjectFormInput['status'];
  start_sales_at: string | null;
  notes: string | null;
  slug: string | null;
  is_public: boolean;
}
