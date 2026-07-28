import { AlertCircle, Bell, DollarSign, FileText, Info, TrendingUp, type LucideIcon } from 'lucide-react';

import type { NotificationMuralType, NotificationSeverity } from '@/features/notifications/types';

/** Tradução 1:1 de `NOTIFICATION_TYPES` (`original-project/src/pages/Notifications.jsx`). */
export const NOTIFICATION_TYPE_CONFIG: Record<NotificationMuralType, { label: string; color: string; icon: LucideIcon }> = {
  FINANCEIRO: { label: 'Financeiro', color: 'bg-green-600', icon: DollarSign },
  COMISSAO: { label: 'Comissão', color: 'bg-emerald-600', icon: DollarSign },
  CRM: { label: 'CRM', color: 'bg-blue-500', icon: TrendingUp },
  VENDA: { label: 'Venda', color: 'bg-indigo-600', icon: TrendingUp },
  UNIDADE: { label: 'Unidade', color: 'bg-cyan-600', icon: TrendingUp },
  INVESTIMENTO: { label: 'Investimento', color: 'bg-violet-600', icon: DollarSign },
  INADIMPLENCIA: { label: 'Inadimplência', color: 'bg-red-600', icon: AlertCircle },
  DOCUMENTOS: { label: 'Documentos', color: 'bg-purple-500', icon: FileText },
  SISTEMA: { label: 'Sistema', color: 'bg-slate-500', icon: Bell },
};

/** Fallback para `type` fora do enum mural (ex: notificação pessoal `MAINTENANCE_*`) — mesmo critério de `NOTIFICATION_TYPES[notification.type] || {...}` no original. */
export const NOTIFICATION_TYPE_FALLBACK: { label: string; color: string; icon: LucideIcon } = {
  label: '',
  color: 'bg-slate-500',
  icon: Bell,
};

/** Tradução 1:1 de `SEVERITY_CONFIG` (`Notifications.jsx`). */
export const NOTIFICATION_SEVERITY_CONFIG: Record<NotificationSeverity, { label: string; color: string; icon: LucideIcon }> = {
  INFO: { label: 'Info', color: 'bg-blue-500', icon: Info },
  ALERTA: { label: 'Alerta', color: 'bg-amber-500', icon: AlertCircle },
  CRITICO: { label: 'Crítico', color: 'bg-red-600', icon: AlertCircle },
};

export const NOTIFICATION_SEVERITY_DOT_COLOR: Record<NotificationSeverity, string> = {
  INFO: 'bg-blue-500',
  ALERTA: 'bg-amber-500',
  CRITICO: 'bg-red-500',
};
