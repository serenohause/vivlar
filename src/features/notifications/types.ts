/** Tradução 1:1 do enum `notification_severity` (ver `supabase/migrations/0064_notifications.sql`). Só usado no modo "mural". */
export type NotificationSeverity = 'INFO' | 'ALERTA' | 'CRITICO';

/** Tradução 1:1 do enum `notification_audience` (ver `0064_notifications.sql`). Só usado no modo "mural". */
export type NotificationAudience = 'INTERNAL_ONLY' | 'ADMIN_ONLY' | 'ALL' | 'CLIENT_ONLY';

/** Tradução 1:1 do enum `notification_status` (ver `0064_notifications.sql`). Só usado no modo "mural" — o modo "pessoal" nunca lê/escreve este campo (fiel ao original). */
export type NotificationStatus = 'NOVA' | 'LIDA';

/**
 * `type` do modo "mural" — os 9 valores confirmados em
 * `original-project/src/pages/Notifications.jsx` (`NOTIFICATION_TYPES`).
 * Não é o tipo de `notifications.type` na tabela (essa coluna é `text`
 * livre, ver comentário em `0064_notifications.sql` — o modo "pessoal" usa
 * valores fora deste conjunto, ex: `MAINTENANCE_STATUS_CHANGED`) — só a
 * union usada para tipar `NOTIFICATION_TYPE_CONFIG` em `constants.ts`.
 */
export type NotificationMuralType =
  | 'FINANCEIRO'
  | 'COMISSAO'
  | 'CRM'
  | 'VENDA'
  | 'UNIDADE'
  | 'INVESTIMENTO'
  | 'INADIMPLENCIA'
  | 'DOCUMENTOS'
  | 'SISTEMA';

/**
 * Tradução 1:1 das colunas de `notifications` — unifica os 2 modos ("mural
 * interno" e "notificação pessoal pro cliente") na mesma tabela/tipo, ver
 * comentário de topo de `0064_notifications.sql`. Campos exclusivos de um
 * modo são `| null` no tipo (nunca usados pelo outro modo).
 */
export interface Notification {
  id: string;
  tenant_id: string;

  title: string;
  message: string;
  /** Texto livre no banco — 9 valores fechados no modo mural (`NotificationMuralType`), livre no modo pessoal (ex: `MAINTENANCE_STATUS_CHANGED`). */
  type: string;

  // Modo "mural interno" — null no modo pessoal.
  severity: NotificationSeverity | null;
  audience: NotificationAudience | null;
  event_key: string | null;
  link_route: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
  status: NotificationStatus;
  read_at: string | null;
  read_by_user_id: string | null;

  // Modo "notificação pessoal pro cliente" — null no modo mural.
  user_id: string | null;
  related_id: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
