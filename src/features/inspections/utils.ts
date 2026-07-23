import type { InspectionTemplateItem } from '@/features/inspection-templates/types';
import type { Inspection, InspectionItemResult, InspectionMedia, InspectionStatus } from '@/features/inspections/types';

export interface InspectionTotals {
  totals_conform: number;
  totals_nonconform: number;
  totals_notapplicable: number;
  totals_pending: number;
  score_conformity_percent: number;
}

/**
 * Tradução exata de `recalculateTotals` (`InspectionDetail.jsx`): conta os
 * resultados por tipo e calcula `score_conformity_percent` como
 * `conforme / (total - não_se_aplica) * 100`, arredondado para 1 casa
 * decimal. Sem a etapa de dedupe por `template_item_id` do original — o
 * índice único parcial `inspection_item_results_tenant_id_inspection_id_item_uidx`
 * (0034_inspections.sql) já garante no máximo 1 resultado ativo por item;
 * a query que alimenta esta função (sempre filtrada por `is_deleted = false`)
 * nunca traz duplicata para descartar.
 */
export function computeInspectionTotals(items: Array<Pick<InspectionItemResult, 'result'>>): InspectionTotals {
  const totals_conform = items.filter((item) => item.result === 'conforme').length;
  const totals_nonconform = items.filter((item) => item.result === 'nao_conforme').length;
  const totals_notapplicable = items.filter((item) => item.result === 'nao_se_aplica').length;
  const totals_pending = items.filter((item) => item.result === 'pendente').length;

  const totalApplicable = items.length - totals_notapplicable;
  const conformityPercent = totalApplicable > 0 ? (totals_conform / totalApplicable) * 100 : 0;

  return {
    totals_conform,
    totals_nonconform,
    totals_notapplicable,
    totals_pending,
    score_conformity_percent: Math.round(conformityPercent * 10) / 10,
  };
}

/** Status em que o checklist/itens ainda podem ser editados — fiel a `isEditable` (`InspectionDetail.jsx`). */
const EDITABLE_INSPECTION_STATUSES: InspectionStatus[] = ['rascunho', 'em_vistoria', 'reinspecao'];

export function isInspectionEditable(status: InspectionStatus): boolean {
  return EDITABLE_INSPECTION_STATUSES.includes(status);
}

/** Fiel a `is100Compliant` (`InspectionDetail.jsx`): sem pendências, sem não conformes, e 100% de conformidade. */
export function isInspection100Compliant(
  inspection: Pick<Inspection, 'totals_pending' | 'totals_nonconform' | 'score_conformity_percent'>
): boolean {
  return inspection.totals_pending === 0 && inspection.totals_nonconform === 0 && inspection.score_conformity_percent === 100;
}

/**
 * Fiel a `hasMissingRequiredPhotos` (`InspectionDetail.jsx`): um item com
 * `requires_photo` cujo resultado não é "conforme" e que ainda não tem
 * nenhuma mídia anexada.
 */
export function hasMissingRequiredPhotos(
  templateItems: InspectionTemplateItem[],
  itemResults: InspectionItemResult[],
  media: InspectionMedia[]
): boolean {
  return templateItems.some((templateItem) => {
    if (!templateItem.requires_photo) return false;
    const itemResult = itemResults.find((result) => result.template_item_id === templateItem.id);
    if (!itemResult || itemResult.result === 'conforme') return false;
    return !media.some((item) => item.item_result_id === itemResult.id);
  });
}
