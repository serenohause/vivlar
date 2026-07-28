import type { Notification } from '@/features/notifications/types';

/**
 * Tradução 1:1 de `formatDateTime`/`formatTime` (`Notifications.jsx`/
 * `NotificationBell.jsx` — as duas funções são quase idênticas no
 * original, unificadas aqui numa só usada pelos dois lugares).
 */
export function formatNotificationTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Agora';
  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays}d atrás`;
  return d.toLocaleDateString('pt-BR');
}

/**
 * Resolve a rota de destino de uma notificação — `link_route` sempre que
 * presente (todo ponto de criação novo já grava isso), com um fallback por
 * `entity_type`/`entity_id` para notificações antigas que não tenham o
 * campo (mesmo `detailLink` de `Notifications.jsx`), traduzido para as
 * rotas reais deste projeto (ver `src/routes/AppRoutes.tsx`) em vez das
 * URLs `?id=` do Base44 original.
 */
export function resolveNotificationLink(notification: Notification): string | null {
  if (notification.link_route) return notification.link_route;

  if (!notification.entity_type || !notification.entity_id) return null;

  switch (notification.entity_type) {
    case 'Commission':
      return `/commissions/${notification.entity_id}`;
    case 'PaymentInstallment': {
      const financeAccountId = (notification.meta?.finance_account_id as string | undefined) ?? notification.entity_id;
      return `/finance/${financeAccountId}`;
    }
    case 'Deal':
      return `/crm/${notification.entity_id}`;
    case 'Document':
      return '/documents';
    case 'Unit':
      return `/units/${notification.entity_id}`;
    default:
      return null;
  }
}
