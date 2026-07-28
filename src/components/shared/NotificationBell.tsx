import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthContext';
import { NOTIFICATION_SEVERITY_DOT_COLOR } from '@/features/notifications/constants';
import { useDeleteNotification, useMarkAllNotificationsRead, useMarkNotificationRead, useRecentNotifications } from '@/features/notifications/hooks';
import type { Notification, NotificationSeverity } from '@/features/notifications/types';
import { formatNotificationTime, resolveNotificationLink } from '@/features/notifications/utils';
import { cn } from '@/lib/utils';

/**
 * Tradução de `original-project/src/components/notifications/NotificationBell.jsx`
 * — religado ao módulo real de Notificações (ver `src/features/notifications/`),
 * substituindo o stub estático anterior. Diferente do original, o botão de
 * excluir (X) só aparece para `tenantRole === 'admin'` (a RLS de UPDATE de
 * `notifications` só aceita `is_deleted = true` de admin para o modo mural —
 * ver `0065_rls_notifications.sql`; o original mostrava o botão pra
 * qualquer papel, que falharia silenciosamente ao clicar — desvio
 * intencional, pedido do orquestrador).
 */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: notifications } = useRecentNotifications(50);
  const markAsRead = useMarkNotificationRead();
  const markAllAsRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();

  const allNotifications = notifications ?? [];
  const unreadCount = allNotifications.filter((n) => n.status === 'NOVA').length;

  function handleNotificationClick(notification: Notification) {
    if (notification.status === 'NOVA') {
      markAsRead.mutate(notification.id);
    }
    if (resolveNotificationLink(notification)) {
      setIsOpen(false);
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-slate-100 dark:hover:bg-slate-800">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[500px] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Notificações</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead.mutate(allNotifications.filter((n) => n.status === 'NOVA').map((n) => n.id))}
                className="text-xs h-auto py-1"
              >
                <Check className="w-3 h-3 mr-1" />
                Marcar todas como lidas
              </Button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {allNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500">
              <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            allNotifications.map((notification) => {
              const detailLink = resolveNotificationLink(notification);
              const dotColor = notification.severity ? NOTIFICATION_SEVERITY_DOT_COLOR[notification.severity as NotificationSeverity] : 'bg-slate-400';

              const rowContent = (
                <>
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', dotColor)} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className={cn(
                          'text-sm font-medium text-slate-900 dark:text-slate-100',
                          notification.status === 'NOVA' && 'font-semibold'
                        )}
                      >
                        {notification.title}
                      </h4>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatNotificationTime(notification.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{notification.message}</p>
                    {typeof notification.meta?.project_name === 'string' && (
                      <p className="text-xs text-slate-500 mt-1">Projeto: {notification.meta.project_name}</p>
                    )}
                  </div>

                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteNotification.mutate(notification.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </>
              );

              const rowClassName = cn(
                'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer',
                notification.status === 'NOVA' && 'bg-blue-50 dark:bg-blue-950/20'
              );

              return detailLink ? (
                <Link key={notification.id} to={detailLink} onClick={() => handleNotificationClick(notification)} className={rowClassName}>
                  {rowContent}
                </Link>
              ) : (
                <div key={notification.id} onClick={() => handleNotificationClick(notification)} className={rowClassName}>
                  {rowContent}
                </div>
              );
            })
          )}
        </div>

        {allNotifications.length > 0 && (
          <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3">
            <Link to="/notifications">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setIsOpen(false)}>
                Ver todas as notificações
              </Button>
            </Link>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
