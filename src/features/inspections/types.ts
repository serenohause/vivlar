import type { InspectionSeverity } from '@/features/inspection-templates/types';

/**
 * Tradução 1:1 do enum `inspection_status` (ver `supabase/migrations/0034_inspections.sql`)
 * — 7 valores confirmados em `original-project/src/pages/InspectionDetail.jsx`/
 * `Inspections.jsx` (`getStatusColor`, filtro de status). `aprovado`/`reprovado`
 * não têm nenhum write path confirmado dentro do escopo desta leva (só a UI
 * local/órfã de `InspectionDashboard.jsx`, fora de escopo, os gravava) — a
 * UI aqui continua exibindo/filtrando por eles (mesmo critério de campo
 * "lido sem write path confirmado, baixo risco, mantido" já usado em
 * `notes_general`), mas nenhum botão desta leva transiciona uma vistoria
 * para esses dois status.
 */
export const INSPECTION_STATUS_VALUES = [
  'rascunho',
  'em_vistoria',
  'enviado_ao_cliente',
  'aprovado',
  'reprovado',
  'reinspecao',
  'concluido',
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUS_VALUES)[number];

/**
 * Tradução 1:1 do enum `inspection_result` — 4 valores confirmados nos
 * botões de resultado de `InspectionDetail.jsx`.
 */
export const INSPECTION_RESULT_VALUES = ['pendente', 'conforme', 'nao_conforme', 'nao_se_aplica'] as const;

export type InspectionResult = (typeof INSPECTION_RESULT_VALUES)[number];

/**
 * Tradução 1:1 das colunas de `inspections` — vistoria de uma unidade a
 * partir de um `InspectionTemplate`. `totals_*`/`score_conformity_percent`
 * são recalculados pela aplicação (ver `computeInspectionTotals`,
 * `utils.ts`), não por trigger no banco. `client_id` nullable: só
 * preenchido se a unidade tiver um `deal` com `sales_stage = 'vendido'` no
 * momento da criação (`getClientForUnit`, `CreateInspection.jsx`).
 */
export interface Inspection {
  id: string;
  tenant_id: string;

  project_id: string;
  unit_id: string;
  client_id: string | null;
  template_id: string;
  inspector_user_id: string | null;

  inspection_date: string | null;
  status: InspectionStatus;

  totals_conform: number;
  totals_nonconform: number;
  totals_notapplicable: number;
  totals_pending: number;
  score_conformity_percent: number;

  notes_general: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tradução 1:1 das colunas de `inspection_item_results` — resultado de um
 * `InspectionTemplateItem` numa vistoria específica. `severity` é copiado
 * de `severity_default` na criação (não muda depois, mesmo que o template
 * mude). `requires_fix` é derivado de `result` a cada update (`true`
 * quando `nao_conforme` ou `pendente`, fiel a `handleResultChange` do
 * original — ver `useUpdateItemResult`, `hooks.ts`).
 */
export interface InspectionItemResult {
  id: string;
  tenant_id: string;

  inspection_id: string;
  template_item_id: string;

  result: InspectionResult;
  severity: InspectionSeverity;
  comment: string | null;
  requires_fix: boolean;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tradução 1:1 das colunas de `inspection_media` — foto/arquivo anexado a
 * um `InspectionItemResult`. `file_url` guarda o PATH no bucket privado
 * `inspection-media` (Storage), não uma URL pública — ver
 * `useInspectionMediaSignedUrl`/`getInspectionMediaSignedUrl` em `hooks.ts`.
 */
export interface InspectionMedia {
  id: string;
  tenant_id: string;

  inspection_id: string;
  item_result_id: string;

  file_url: string;
  file_name: string | null;
  caption: string | null;
  taken_at: string;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 2 valores usados na prática pela aplicação (`signer_type` é texto livre
 * no banco, sem enum — ver comentário em `0034_inspections.sql`).
 */
export type InspectionSignerType = 'vistoriador' | 'cliente';

/**
 * Tradução 1:1 das colunas de `inspection_signatures` — write-once (sem
 * update/delete no fluxo original), por isso sem soft-delete/`updated_at`.
 * `signature_file_url` nullable: só a assinatura do `cliente` anexa um PDF
 * (path no bucket `inspection-media`); a do `vistoriador` só confirma
 * `confirmation_checkbox`.
 */
export interface InspectionSignature {
  id: string;
  tenant_id: string;

  inspection_id: string;

  signer_type: string;
  signer_name: string | null;
  signer_document: string | null;

  signature_file_url: string | null;
  signed_at: string | null;
  confirmation_checkbox: boolean;

  created_by_user_id: string | null;
  created_at: string;
}
