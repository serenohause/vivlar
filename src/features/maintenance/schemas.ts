import { z } from 'zod';

import { MAINTENANCE_PRIORITY_VALUES } from '@/features/maintenance/types';

/**
 * Dialog "Nova Solicitação de Manutenção" — fiel a `AdminMaintenance.jsx`
 * (`formData`/campos `required` do form, linhas 726-790): `client_id`,
 * `unit_id`, `title`, `description`, `category` e `priority` obrigatórios.
 * Upload de fotos fica fora do schema (estado de componente, `photos: string[]`
 * já com os paths do bucket — ver `MaintenanceFormDialog.tsx`), mesmo
 * critério de `documentUploadFormSchema`. `category` é texto livre no banco
 * (sem enum, ver `0037_maintenance_requests.sql`) — só exige não-vazio aqui.
 */
export const maintenanceRequestFormSchema = z.object({
  client_id: z.string().trim().min(1, 'Selecione o cliente.'),
  unit_id: z.string().trim().min(1, 'Selecione a unidade.'),
  title: z.string().trim().min(1, 'Informe o título do chamado.'),
  description: z.string().trim().min(1, 'Descreva o problema.'),
  category: z.string().trim().min(1, 'Selecione a categoria.'),
  priority: z.enum(MAINTENANCE_PRIORITY_VALUES, { error: 'Selecione a prioridade.' }),
});

export type MaintenanceRequestFormInput = z.infer<typeof maintenanceRequestFormSchema>;
