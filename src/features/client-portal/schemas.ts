import { z } from 'zod';

import { MAINTENANCE_PRIORITY_VALUES } from '@/features/maintenance/types';

/**
 * Dialog "Nova Solicitação de Manutenção" do Portal do Cliente — tradução
 * de `formData`/campos `required` de `ClientMaintenance.jsx` (original).
 * Sem `client_id` (diferente de `maintenanceRequestFormSchema`, lado admin,
 * `features/maintenance/schemas.ts`): o cliente nunca escolhe o próprio
 * `client_id` num formulário, ele é injetado automaticamente a partir de
 * `useMyClient()` (ver `ClientMaintenanceCreateDialog.tsx`). Fotos ficam
 * fora do schema (estado de componente, mesmo critério do lado admin) — a
 * regra "mínimo 1 foto" é checada no submit, não aqui, porque é sobre o
 * array de paths já enviados ao bucket, não um campo do formulário.
 */
export const clientMaintenanceRequestFormSchema = z.object({
  unit_id: z.string().trim().min(1, 'Selecione a unidade.'),
  title: z.string().trim().min(1, 'Informe o título do chamado.'),
  description: z.string().trim().min(1, 'Descreva o problema.'),
  category: z.string().trim().min(1, 'Selecione a categoria.'),
  priority: z.enum(MAINTENANCE_PRIORITY_VALUES, { error: 'Selecione a prioridade.' }),
  suggested_date: z.string().trim().optional(),
});

export type ClientMaintenanceRequestFormInput = z.infer<typeof clientMaintenanceRequestFormSchema>;
