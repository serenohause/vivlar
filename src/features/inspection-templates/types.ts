/**
 * Tradução 1:1 do enum `inspection_severity` (ver
 * `supabase/migrations/0034_inspections.sql`) — 3 valores confirmados em
 * `original-project/src/pages/TemplateDetail.jsx` (`SEVERITIES`):
 * Baixa/Média/Crítica. Mesmo enum reutilizado em `inspection_item_results`
 * (fora do escopo desta leva — só Templates).
 */
export const INSPECTION_SEVERITY_VALUES = ['baixa', 'media', 'critica'] as const;

export type InspectionSeverity = (typeof INSPECTION_SEVERITY_VALUES)[number];

/**
 * Tradução 1:1 das colunas de `inspection_templates` — checklist reutilizável
 * de vistoria (`Templates.jsx`/`TemplateDetail.jsx`). `is_active` controla
 * se o template aparece na criação de novas vistorias (`CreateInspection.jsx`,
 * fora do escopo desta leva).
 */
export interface InspectionTemplate {
  id: string;
  tenant_id: string;

  name: string;
  description: string | null;
  is_active: boolean;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tradução 1:1 das colunas de `inspection_template_items` — item de checklist
 * de um `InspectionTemplate`. `category` é texto livre no banco (sem enum),
 * a lista fixa de sugestões (`CATEGORY_SUGGESTIONS`, `constants.ts`) é só UI,
 * fiel ao `<Select>` de `TemplateDetail.jsx`. `order_index` controla a ordem
 * de exibição — reordenado via troca de valor entre itens adjacentes (ver
 * `useReorderTemplateItem`, `hooks.ts`).
 */
export interface InspectionTemplateItem {
  id: string;
  tenant_id: string;

  template_id: string;

  category: string;
  title: string;
  instructions: string | null;
  severity_default: InspectionSeverity;
  requires_photo: boolean;
  order_index: number;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
