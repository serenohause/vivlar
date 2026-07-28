/**
 * Tradução 1:1 das colunas de `units` (ver `supabase/migrations/0008_units.sql`).
 *
 * `active_deal_id` do original PROPOSITALMENTE não existe aqui (depende de
 * `deals`, CRM futuro — ver comentário na própria migration). As abas de
 * financeiro, vistoria, documentos e timeline de `original-project/src/pages/UnitDetail.jsx`
 * também ficam fora — dependem de tabelas que ainda não existem.
 */
export type UnitStatus = 'disponivel' | 'reservada' | 'vendida' | 'bloqueada';

/**
 * Pipeline administrativo/documental MCMV. Nullable: unidade recém-criada
 * ainda não entrou no pipeline (sem default no banco, ver 0008_units.sql).
 */
export type UnitAdminStatus =
  | 'laudo_engenharia'
  | 'em_conformidade'
  | 'cliente_conforme'
  | 'contrato_caixa'
  | 'cartorio'
  | 'registro_pago'
  | 'registrado'
  | 'entrega_casa'
  | 'entregue'
  | 'distrato';

export interface Unit {
  id: string;
  tenant_id: string;
  project_id: string;

  sku: string;
  bloco: string | null;
  tipologia: string | null;
  area_m2: number | null;
  area_lote_m2: number | null;
  quartos: number | null;
  vagas: number | null;
  suites: number | null;
  pavimentos: number | null;
  posicao_solar: string | null;

  list_price: number;
  status: UnitStatus;
  admin_status: UnitAdminStatus | null;
  notes: string | null;

  observacoes_publica: string | null;
  entrada_minima: number | null;
  subsidio_simulado: number | null;
  parcela_simulada: number | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tradução 1:1 do `jsonb` retornado por `run_distrato_checkup` (ver
 * `supabase/migrations/0071_distrato_checkup_rpc.sql`) — usada só por
 * `DistratoCheckupPage`. `result` é o mesmo em dry run e execução real
 * ('pending_dry_run' só no primeiro caso; 'reconciled'/'reset' ou 'error'
 * só no segundo) — por isso os campos que só existem num dos dois casos
 * (`apply_unit_distrato`, `check_and_reset_unit_mcmv_flow`, `error`,
 * `deal_sales_stage`) são opcionais em vez de um tipo discriminado por
 * `result` (mais simples de consumir na UI, mesmo padrão de
 * `FinanceCheckup*Item` em `features/finance/types.ts`).
 */
export type DistratoCheckupResult = 'pending_dry_run' | 'reconciled' | 'reset' | 'error';

export interface DistratoCheckupReconciliationItem {
  unit_id: string;
  sku: string;
  unit_status: UnitStatus;
  result: DistratoCheckupResult;
  /** Só presente quando `result === 'reconciled'`. */
  apply_unit_distrato?: {
    unit_id: string;
    deal_id: string | null;
    previous_admin_status: UnitAdminStatus | null;
    source: string;
    applied_at: string;
  };
  /** Só presente quando `result === 'error'` — texto cru de `sqlerrm`. */
  error?: string;
}

export interface DistratoCheckupMcmvResetItem {
  unit_id: string;
  sku: string;
  deal_id: string;
  /** Só presente em dry run (`result === 'pending_dry_run'`). */
  deal_sales_stage?: string;
  result: DistratoCheckupResult;
  /** Só presente quando `result === 'reset'`. */
  check_and_reset_unit_mcmv_flow?: {
    reset: boolean;
    deal_id?: string;
  };
  /** Só presente quando `result === 'error'` — texto cru de `sqlerrm`. */
  error?: string;
}

/** Relatório completo retornado por `run_distrato_checkup` — mesma forma em dry run e execução real (só `dry_run`/`corrections_applied` e o `result` de cada item de `details` mudam). */
export interface DistratoCheckupReport {
  dry_run: boolean;
  corrections_applied: boolean;
  executed_at: string;
  summary: {
    total_units: number;
    reconciliation_candidates: number;
    mcmv_reset_candidates: number;
    reconciled: number;
    mcmv_reset: number;
    errors: number;
  };
  details: {
    reconciliation: DistratoCheckupReconciliationItem[];
    mcmv_reset: DistratoCheckupMcmvResetItem[];
  };
}
