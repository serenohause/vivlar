/**
 * Estágio comercial do negócio (`deal_sales_stage`, ver
 * `supabase/migrations/0014_deals.sql`). Unifica os dois campos redundantes
 * do original (`sales_stage` + `opportunity_status`, ver
 * `docs/DOMAIN_MAP.md`) num único enum — decisão já registrada em
 * `docs/SCHEMA_PLAN.md` seção 2.2.
 *
 * Movido para cá a partir de `features/clients/types.ts`, onde vivia como
 * placeholder só para a prévia de negociações do cliente antes deste módulo
 * existir (o comentário lá já avisava dessa mudança).
 */
export type DealSalesStage = 'lead' | 'qualificado' | 'reservado' | 'proposta' | 'vendido' | 'distratado' | 'perdido';

/**
 * Tradução 1:1 das colunas de `deals` (ver `supabase/migrations/0014_deals.sql`).
 *
 * Sem ligação com `commissions`/`documents`/`contracts` — módulos futuros
 * ainda não existem (confirmado como fora de escopo desta leva).
 */
export interface Deal {
  id: string;
  tenant_id: string;

  project_id: string;
  unit_id: string | null;
  client_id: string;
  broker_id: string | null;

  sales_stage: DealSalesStage;
  expected_sale_value: number | null;
  final_sale_value: number | null;
  commission_rate: number | null;
  commission_value: number | null;

  reserved_until: string | null;
  sold_at: string | null;
  last_activity_date: string | null;

  lost_reason: string | null;

  distrato_at: string | null;
  distrato_reason: string | null;
  distrato_by_user_id: string | null;

  /** Indica se este é o negócio corrente do funil para a unidade — ver `deals_tenant_id_unit_id_active_uidx`. */
  is_active: boolean;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `activity_type` (ver `supabase/migrations/0015_activities.sql`). */
export type ActivityType = 'ligacao' | 'whatsapp' | 'documento' | 'visita' | 'pendencia' | 'outro';

/** Tradução 1:1 do enum `activity_priority`. */
export type ActivityPriority = 'alta' | 'media' | 'baixa';

/** Tradução 1:1 do enum `activity_status`. */
export type ActivityStatus = 'aberta' | 'concluida' | 'cancelada';

/**
 * Tradução 1:1 das colunas de `activities` (ver
 * `supabase/migrations/0015_activities.sql`) — formato unificado (ver
 * comentário no topo da migration), sem `updated_at`/soft-delete: log
 * editável apenas via `status` (`useUpdateActivityStatus`).
 */
export interface Activity {
  id: string;
  tenant_id: string;

  title: string;
  type: ActivityType;
  description: string | null;
  due_date: string | null;
  priority: ActivityPriority | null;
  status: ActivityStatus;

  deal_id: string | null;
  client_id: string | null;
  unit_id: string | null;

  created_by_user_id: string | null;
  created_at: string;
}

/** Tradução 1:1 do enum `status_transition_type` (ver `supabase/migrations/0016_status_transitions.sql`). */
export type StatusTransitionType = 'admin' | 'comercial';

/**
 * Tradução 1:1 das colunas de `status_transitions`. Só `transition_type =
 * 'comercial'` é usado por este módulo (funil do deal) — `'admin'` é do
 * pipeline MCMV de `units`, fora de escopo aqui (ver `UnitAdminStatusPipeline`,
 * que ainda não grava nesta tabela — sinalizado no relatório final).
 */
export interface StatusTransition {
  id: string;
  tenant_id: string;

  unit_id: string | null;
  deal_id: string | null;

  from_status: string | null;
  to_status: string;
  transition_type: StatusTransitionType;
  note: string | null;

  created_by_user_id: string | null;
  created_at: string;
}
