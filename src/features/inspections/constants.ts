import { AlertCircle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react';

import type { InspectionResult, InspectionStatus } from '@/features/inspections/types';

/**
 * Tradução 1:1 de `getStatusColor` (`Inspections.jsx`/`InspectionDetail.jsx`)
 * para o enum real (`inspection_status`). Mesmo padrão de `bg-* + text-white`
 * já usado em `COMMISSION_STATUS_CONFIG`/`DOCUMENT_STATUS_CONFIG`, sem ícone
 * (o original não usa ícone no badge de status de vistoria).
 */
export const INSPECTION_STATUS_CONFIG: Record<InspectionStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-slate-500' },
  em_vistoria: { label: 'Em Vistoria', color: 'bg-blue-500' },
  enviado_ao_cliente: { label: 'Enviado ao Cliente', color: 'bg-purple-500' },
  aprovado: { label: 'Aprovado', color: 'bg-green-500' },
  reprovado: { label: 'Reprovado', color: 'bg-red-500' },
  reinspecao: { label: 'Reinspeção', color: 'bg-orange-500' },
  concluido: { label: 'Concluído', color: 'bg-slate-700' },
};

/**
 * Tradução 1:1 de `getResultColor`/`getResultIcon` (`InspectionDetail.jsx`)
 * para o enum real (`inspection_result`).
 */
export const INSPECTION_RESULT_CONFIG: Record<InspectionResult, { label: string; textColor: string; icon: LucideIcon }> = {
  conforme: { label: 'Conforme', textColor: 'text-green-600', icon: CheckCircle2 },
  nao_conforme: { label: 'Não Conforme', textColor: 'text-red-600', icon: AlertCircle },
  nao_se_aplica: { label: 'Não se Aplica', textColor: 'text-slate-400', icon: Clock },
  pendente: { label: 'Pendente', textColor: 'text-amber-600', icon: Clock },
};

/** Ordem dos botões de resultado do checklist — fiel ao array de `InspectionDetail.jsx` (`["Conforme", "Não Conforme", "Não se Aplica", "Pendente"]`). */
export const RESULT_BUTTON_ORDER: InspectionResult[] = ['conforme', 'nao_conforme', 'nao_se_aplica', 'pendente'];

/**
 * Classe do botão de resultado quando selecionado — fiel às classes
 * condicionais do original (`bg-green-600`/`bg-red-600`/`bg-amber-600`).
 * `nao_se_aplica` fica de fora de propósito: o original não tem classe
 * customizada para ele quando selecionado (usa o `variant="default"` puro
 * do botão).
 */
export const RESULT_SELECTED_BUTTON_CLASS: Partial<Record<InspectionResult, string>> = {
  conforme: 'bg-green-600 hover:bg-green-700 text-white',
  nao_conforme: 'bg-red-600 hover:bg-red-700 text-white',
  pendente: 'bg-amber-600 hover:bg-amber-700 text-white',
};

/** Opções do filtro de status de `InspectionsListPage` — mesma ordem de `Inspections.jsx`. */
export const INSPECTION_STATUS_FILTER_ORDER: InspectionStatus[] = [
  'rascunho',
  'em_vistoria',
  'enviado_ao_cliente',
  'aprovado',
  'reprovado',
  'reinspecao',
  'concluido',
];
