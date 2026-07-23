import type { MaintenancePriority, MaintenanceStatus } from '@/features/maintenance/types';

/** Tradução 1:1 de `STATUS_CONFIG` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`) para o enum real (`maintenance_status`). */
export const MAINTENANCE_STATUS_CONFIG: Record<MaintenanceStatus, { label: string; color: string }> = {
  aberto: { label: 'Aberto', color: 'bg-blue-600' },
  agendado: { label: 'Agendado', color: 'bg-purple-600' },
  em_andamento: { label: 'Em Andamento', color: 'bg-amber-600' },
  aguardando_cliente: { label: 'Aguardando Cliente', color: 'bg-orange-600' },
  resolvido: { label: 'Resolvido', color: 'bg-green-600' },
  cancelado: { label: 'Cancelado', color: 'bg-slate-500' },
};

/** Tradução 1:1 de `PRIORITY_CONFIG` para o enum real (`maintenance_priority`). */
export const MAINTENANCE_PRIORITY_CONFIG: Record<MaintenancePriority, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-slate-400' },
  media: { label: 'Média', color: 'bg-amber-500' },
  alta: { label: 'Alta', color: 'bg-red-600' },
};

/** Ordem do filtro/`<Select>` de status — mesma ordem de `STATUS_CONFIG` no original. */
export const MAINTENANCE_STATUS_FILTER_ORDER: MaintenanceStatus[] = [
  'aberto',
  'agendado',
  'em_andamento',
  'aguardando_cliente',
  'resolvido',
  'cancelado',
];

/** Ordem do `<Select>` de prioridade. */
export const MAINTENANCE_PRIORITY_FILTER_ORDER: MaintenancePriority[] = ['baixa', 'media', 'alta'];
