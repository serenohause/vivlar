import type { ActivityPriority, ActivityStatus, ActivityType, DealSalesStage } from '@/features/deals/types';
import type { UnitStatus } from '@/features/units/types';

/**
 * Tradução 1:1 de `SALES_STAGE_CONFIG` em
 * `original-project/src/components/shared/StatusBadge.jsx` — cores usadas
 * pelo badge de estágio (`DealStageBadge`). Chaves trocadas para o enum real
 * (`deal_sales_stage`, ver 0014_deals.sql).
 */
export const SALES_STAGE_CONFIG: Record<DealSalesStage, { label: string; color: string }> = {
  lead: { label: 'Lead', color: 'bg-gray-400' },
  qualificado: { label: 'Qualificado', color: 'bg-blue-400' },
  reservado: { label: 'Reservado', color: 'bg-amber-500' },
  proposta: { label: 'Proposta', color: 'bg-orange-500' },
  vendido: { label: 'Vendido', color: 'bg-green-600' },
  perdido: { label: 'Perdido', color: 'bg-red-500' },
  distratado: { label: 'Distratado', color: 'bg-red-700' },
};

export const DEAL_SALES_STAGE_LABELS: Record<DealSalesStage, string> = Object.fromEntries(
  Object.entries(SALES_STAGE_CONFIG).map(([stage, config]) => [stage, config.label])
) as Record<DealSalesStage, string>;

/**
 * As 5 colunas do quadro Kanban — tradução 1:1 de `SALES_STAGES` em
 * `original-project/src/components/shared/Constants.jsx`. `perdido` e
 * `distratado` NÃO têm coluna própria no quadro original: são estados "de
 * saída", tratados via ação/menu (dropdown "Marcar como Perdido" em
 * `CRM.jsx`, ou o diálogo "Alterar Estágio" em `DealDetail.jsx`), nunca via
 * arraste — replicado fielmente aqui.
 */
export const KANBAN_STAGES: DealSalesStage[] = ['lead', 'qualificado', 'reservado', 'proposta', 'vendido'];

/** Todos os estágios, incluindo os "de saída" — usado pelo seletor de "Alterar Estágio" em `DealDetail`. */
export const ALL_SALES_STAGES: DealSalesStage[] = [...KANBAN_STAGES, 'perdido', 'distratado'];

/** Tradução 1:1 de `ACTIVITY_TYPE_LABELS` em `original-project/src/components/shared/Constants.jsx`. */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  documento: 'Documento',
  visita: 'Visita',
  pendencia: 'Pendência',
  outro: 'Outro',
};

export const ACTIVITY_PRIORITY_LABELS: Record<ActivityPriority, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ACTIVITY_STATUS_COLOR: Record<ActivityStatus, string> = {
  aberta: 'bg-amber-500',
  concluida: 'bg-green-600',
  cancelada: 'bg-slate-400',
};

/**
 * Reflexo de `units.status` a cada estágio do negócio — tradução 1:1 da
 * lógica embutida em `updateStageMutation` de
 * `original-project/src/pages/CRM.jsx` (linhas ~392-410): reservado/proposta
 * mantêm a unidade reservada, vendido marca vendida, e todo o resto
 * (inclusive lead/qualificado, ao voltar de um estágio mais avançado) libera
 * a unidade de volta para disponível. Sem `active_deal_id` (coluna não
 * existe no schema novo, ver `features/units/types.ts`).
 */
export const UNIT_STATUS_BY_SALES_STAGE: Record<DealSalesStage, UnitStatus> = {
  lead: 'disponivel',
  qualificado: 'disponivel',
  reservado: 'reservada',
  proposta: 'reservada',
  vendido: 'vendida',
  perdido: 'disponivel',
  distratado: 'disponivel',
};

/** Mesma formatação de `original-project/src/pages/CRM.jsx`/`DealDetail.jsx` (`toLocaleString`/`Intl.NumberFormat` sem casas decimais fixas). */
export function formatCurrency(value: number | null | undefined): string {
  if (!value) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
