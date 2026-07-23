/**
 * Tradução 1:1 do enum `maintenance_priority` (ver
 * `supabase/migrations/0037_maintenance_requests.sql`) — 3 valores
 * confirmados em `PRIORITY_CONFIG` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`).
 */
export const MAINTENANCE_PRIORITY_VALUES = ['baixa', 'media', 'alta'] as const;

export type MaintenancePriority = (typeof MAINTENANCE_PRIORITY_VALUES)[number];

/**
 * Tradução 1:1 do enum `maintenance_status` — 6 valores confirmados em
 * `STATUS_CONFIG` e no `<Select>` de edição de `MaintenanceDetail.jsx`.
 */
export const MAINTENANCE_STATUS_VALUES = [
  'aberto',
  'agendado',
  'em_andamento',
  'aguardando_cliente',
  'resolvido',
  'cancelado',
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUS_VALUES)[number];

/** Status considerados "terminais" — chamado encerrado, não conta mais como pendência (badge da sidebar, ações de edição escondidas em `MaintenanceDetailPage`). */
export const MAINTENANCE_TERMINAL_STATUSES: MaintenanceStatus[] = ['resolvido', 'cancelado'];

/**
 * `category` é texto livre no banco (sem enum, ver comentário em
 * `0037_maintenance_requests.sql`) — estas são só as 5 sugestões fixas do
 * `<Select>` da UI original, mesmo critério de `DOC_TYPE`/outros campos
 * "sugestão, não constraint" já usados no projeto.
 */
export const MAINTENANCE_CATEGORY_OPTIONS = ['Hidráulica', 'Elétrica', 'Estrutural', 'Acabamento', 'Outros'] as const;

/**
 * Tradução 1:1 das colunas de `maintenance_requests` — chamado de
 * assistência técnica pós-entrega aberto pela equipe interna em nome de um
 * cliente (`client_id` sempre preenchido pelo operador nesta rodada, sem
 * portal do cliente — ver comentário no topo da migration). `photos` guarda
 * PATHS no bucket privado `maintenance-photos`, não URLs completas (ver
 * `useMaintenancePhotoSignedUrl`, `hooks.ts`).
 */
export interface MaintenanceRequest {
  id: string;
  tenant_id: string;

  project_id: string;
  unit_id: string;
  client_id: string;

  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;

  suggested_date: string | null;
  scheduled_date: string | null;

  opened_at: string;
  resolved_at: string | null;

  responsible_user_id: string | null;
  operator_notes: string | null;

  photos: string[];

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
