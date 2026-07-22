/** Tradução 1:1 do enum `finance_account_status` (ver `supabase/migrations/0019_finance_accounts.sql`). */
export type FinanceAccountStatus = 'ativa' | 'finalizada' | 'cancelada';

/**
 * Tradução 1:1 das colunas de `finance_accounts` — carteira financeira de
 * uma unidade vendida, agrupa parcelas (`payment_installments`) e o log de
 * eventos (`finance_events`).
 *
 * Sem `contract_id` (tabela `contracts` ainda não existe, módulo futuro de
 * Documentos) e sem ligação com `FinancingProcess` (schema incerto no
 * original, adiado — ver comentário na migration).
 */
export interface FinanceAccount {
  id: string;
  tenant_id: string;

  unit_id: string;
  client_id: string;
  deal_id: string | null;
  project_id: string;

  valor_venda_total: number;
  status: FinanceAccountStatus;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `installment_type` (ver `supabase/migrations/0020_payment_installments.sql`). */
export type InstallmentType =
  | 'sinal'
  | 'entrada'
  | 'parcela'
  | 'reforco'
  | 'intermediaria'
  | 'valor_financiado'
  | 'subsidio'
  | 'outros';

/**
 * Tradução 1:1 do enum `installment_status`. `em_atraso` é o único valor
 * desta lista que nunca é setado diretamente por uma mutation deste módulo
 * (não há cron de escalonamento automático nesta leva, ver
 * `features/finance/utils.ts` — `computeInstallmentDisplayStatus` deriva
 * esse status na apresentação a partir de `vencimento`, fiel a
 * `computeInstallmentComputedStatus` do original).
 */
export type InstallmentStatus = 'previsto' | 'parcial' | 'pago' | 'em_atraso' | 'cancelado';

/**
 * Tradução 1:1 das colunas de `payment_installments`. `unit_id`/`client_id`
 * são desnormalizados de `finance_account_id` (mesmo padrão do original,
 * ver comentário na migration) — mantidos aqui em vez de derivados via join.
 */
export interface PaymentInstallment {
  id: string;
  tenant_id: string;

  finance_account_id: string;
  unit_id: string;
  client_id: string;

  tipo: InstallmentType;
  descricao: string | null;
  numero_parcela: number | null;
  observacoes: string | null;

  vencimento: string;
  valor_previsto: number;
  valor_pago: number | null;
  status: InstallmentStatus;

  data_pagamento: string | null;
  comprovante_url: string | null;
  metodo_pagamento: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `finance_event_type` (ver `supabase/migrations/0021_finance_events.sql`). */
export type FinanceEventType =
  | 'criacao_carteira'
  | 'criacao_parcela'
  | 'edicao_parcela'
  | 'cancelamento_parcela'
  | 'baixa_pagamento'
  | 'status_financiamento';

/**
 * Tradução 1:1 das colunas de `finance_events` — log de auditoria
 * (timeline) write-once, sem soft-delete/`updated_at` (mesmo padrão de
 * `activities`/`status_transitions` do CRM).
 */
export interface FinanceEvent {
  id: string;
  tenant_id: string;

  finance_account_id: string;
  installment_id: string | null;

  tipo_evento: FinanceEventType;
  descricao: string | null;

  created_by_user_id: string | null;
  created_at: string;
}
