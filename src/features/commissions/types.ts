/** Tradução 1:1 do enum `commission_status` (ver `supabase/migrations/0024_commissions.sql`). */
export type CommissionStatus = 'a_pagar' | 'agendado' | 'pago' | 'cancelado';

/**
 * Tradução 1:1 das colunas de `commissions` — comissão de venda de um
 * corretor sobre um `deal`, criada automaticamente pela RPC
 * `update_deal_stage` quando o negócio vira "vendido" (ver
 * `supabase/migrations/0028_update_deal_stage_commission.sql`). Este módulo
 * nunca cria `Commission` diretamente — só lista/gerencia (ajustes,
 * pagamentos, agendamento, cancelamento, finalização).
 *
 * `gross_value`/`saldo`/`total_pago` não têm trigger de agregação no banco
 * — são recalculados e persistidos pela aplicação a cada ajuste/pagamento
 * (ver `features/commissions/hooks.ts`), mesmo padrão de
 * `finance_accounts`/`payment_installments`. `gross_value` é nullable: só é
 * gravado a partir do primeiro ajuste (a UI usa `gross_value ?? base_value`
 * como fallback antes disso, fiel ao original).
 *
 * Sem `paid_at` — campo lido em `Commissions.jsx` (KPI "Pago no Mês") mas
 * sem write path confirmado no original (nenhum `Commission.update(...)` o
 * seta) — ver comentário no topo de `0024_commissions.sql`. O KPI aqui é
 * derivado de `CommissionPayment.data_pagamento` em vez disso (ver
 * `features/commissions/pages/CommissionsListPage.tsx`).
 */
export interface Commission {
  id: string;
  tenant_id: string;

  broker_id: string;
  deal_id: string;
  unit_id: string;
  project_id: string;

  base_value: number;
  gross_value: number | null;
  rate: number | null;
  saldo: number;
  total_pago: number;

  status: CommissionStatus;
  due_date: string | null;

  is_finalizada: boolean;
  finalized_at: string | null;
  finalized_by_user_id: string | null;

  notes: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `commission_adjustment_type` (ver `supabase/migrations/0025_commission_adjustments.sql`). */
export type CommissionAdjustmentType = 'desconto' | 'acrescimo' | 'bonus';

/**
 * Tradução 1:1 das colunas de `commission_adjustments` — log write-once
 * (sem update/delete no fluxo original, confirmado no comentário da
 * migration). `amount` é sempre positivo: o sinal (soma ou subtrai de
 * `gross_value`) é decidido pelo `type` na apresentação/cálculo, não
 * armazenado aqui (ver `COMMISSION_ADJUSTMENT_CONFIG` em `constants.ts`).
 *
 * `attachment_url`/`attachment_name`: campo de texto (URL), sem upload real
 * de arquivo nesta leva — mesmo padrão de
 * `payment_installments.comprovante_url` (módulo Financeiro).
 */
export interface CommissionAdjustment {
  id: string;
  tenant_id: string;

  commission_id: string;

  type: CommissionAdjustmentType;
  amount: number;
  reason: string | null;

  attachment_url: string | null;
  attachment_name: string | null;
  attachment_uploaded_at: string | null;
  attachment_uploaded_by_user_id: string | null;

  created_by_user_id: string | null;
  created_at: string;
}

/**
 * Tradução 1:1 das colunas de `commission_payments` — baixa de pagamento
 * (total ou parcial) de uma commission. Editável e soft-deletável
 * (diferente de `commission_adjustments`), mesmo padrão de
 * `payment_installments`.
 *
 * `payment_method`: texto livre no schema, mas a UI oferece um `<Select>`
 * com opções fixas (PIX/TED/BOLETO/DINHEIRO/OUTRO), fiel ao dialog original
 * de `CommissionDetail.jsx` — ver `COMMISSION_PAYMENT_METHOD_OPTIONS` em
 * `constants.ts`.
 */
export interface CommissionPayment {
  id: string;
  tenant_id: string;

  commission_id: string;

  valor_pago: number;
  data_pagamento: string;
  payment_method: string | null;
  payment_reference: string | null;
  comprovante_url: string | null;
  observacoes: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
