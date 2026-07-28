import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { NOTIFICATION_SEVERITY_CONFIG, NOTIFICATION_TYPE_CONFIG, NOTIFICATION_TYPE_FALLBACK } from '@/features/notifications/constants';
import {
  useClearReadNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/hooks';
import type { Notification, NotificationMuralType, NotificationSeverity } from '@/features/notifications/types';
import { formatNotificationTime, resolveNotificationLink } from '@/features/notifications/utils';

type StatusFilter = 'all' | 'unread' | 'read';

/**
 * Tradução de `original-project/src/pages/Notifications.jsx` ("Comunicados").
 * Sem o card "Acesso Negado" do original (`hasAccess`/`appProfile`): a rota
 * `/notifications` só é alcançável por `admin`/`comercial`/`administrativo`
 * (não está em `CLIENT_ALLOWED_PAGES`/`INVESTOR_ALLOWED_PAGES` —
 * `AppShell.tsx` já redireciona `cliente`/`investidor` para longe daqui,
 * mesmo efeito prático do `hasAccess` original, por um mecanismo diferente).
 * "Excluir"/"Limpar lidas" ficam restritos a `tenantRole === 'admin'` (mesmo
 * critério do `isAdmin` original) — desvio proposital do sino
 * (`NotificationBell` original mostrava o botão de excluir pra qualquer um,
 * mesmo sabendo que só admin tem a policy de RLS para isso: aqui os dois
 * lugares escondem o botão de quem não pode usá-lo, ver pedido do
 * orquestrador).
 */
export function NotificationsPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<NotificationMuralType | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<NotificationSeverity | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');

  const { data: notifications, isLoading, isError, refetch } = useNotifications();
  const markAsRead = useMarkNotificationRead();
  const markAllAsRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const clearRead = useClearReadNotifications();

  if (isLoading) {
    return <LoadingInline />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const allNotifications = notifications ?? [];

  const filteredNotifications = allNotifications.filter((n) => {
    const haystack = `${n.title} ${n.message} ${JSON.stringify(n.meta ?? {})}`.toLowerCase();
    const matchSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || n.type === filterType;
    const matchSeverity = filterSeverity === 'all' || n.severity === filterSeverity;
    const matchStatus = filterStatus === 'all' || (filterStatus === 'unread' && n.status === 'NOVA') || (filterStatus === 'read' && n.status === 'LIDA');

    return matchSearch && matchType && matchSeverity && matchStatus;
  });

  // KPIs — fiéis a `Notifications.jsx` (calculados sobre TODAS as
  // notificações visíveis, não só as filtradas).
  const unreadNotifications = allNotifications.filter((n) => n.status === 'NOVA');
  const readNotifications = allNotifications.filter((n) => n.status === 'LIDA');
  const unreadCount = unreadNotifications.length;
  const todayCount = allNotifications.filter((n) => new Date(n.created_at).toDateString() === new Date().toDateString()).length;
  const alertCount = allNotifications.filter((n) => n.severity === 'ALERTA').length;
  const criticalCount = allNotifications.filter((n) => n.severity === 'CRITICO').length;

  function handleMarkAllAsRead() {
    markAllAsRead.mutate(
      unreadNotifications.map((n) => n.id),
      { onSuccess: () => toast.success('Todas marcadas como lidas') }
    );
  }

  function handleClearRead() {
    clearRead.mutate(
      readNotifications.map((n) => n.id),
      { onSuccess: () => toast.success('Notificações lidas removidas') }
    );
  }

  return (
    <div>
      <PageHeader
        title="Comunicados"
        subtitle="Central de eventos do sistema"
        actions={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" onClick={handleMarkAllAsRead} disabled={markAllAsRead.isPending}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Marcar todas como lidas
              </Button>
            )}
            {isAdmin && readNotifications.length > 0 && (
              <Button
                variant="outline"
                onClick={handleClearRead}
                disabled={clearRead.isPending}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpar lidas
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
            <div className="text-sm text-muted-foreground">Não lidas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{todayCount}</div>
            <div className="text-sm text-muted-foreground">Hoje</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{alertCount}</div>
            <div className="text-sm text-muted-foreground">Alertas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <div className="text-sm text-muted-foreground">Críticos</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
          </div>

          <Select value={filterType} onValueChange={(value) => setFilterType(value as NotificationMuralType | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(NOTIFICATION_TYPE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSeverity} onValueChange={(value) => setFilterSeverity(value as NotificationSeverity | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Todas severidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas severidades</SelectItem>
              {Object.entries(NOTIFICATION_SEVERITY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as StatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="unread">Não lidas</SelectItem>
              <SelectItem value="read">Lidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista */}
      {filteredNotifications.length === 0 ? (
        <EmptyState icon={Bell} title="Nenhuma notificação" description="Você não tem notificações no momento" />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              isAdmin={isAdmin}
              onMarkAsRead={() => markAsRead.mutate(notification.id)}
              onDelete={() => deleteNotification.mutate(notification.id, { onSuccess: () => toast.success('Notificação removida') })}
              markAsReadPending={markAsRead.isPending}
              deletePending={deleteNotification.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NotificationRowProps {
  notification: Notification;
  isAdmin: boolean;
  onMarkAsRead: () => void;
  onDelete: () => void;
  markAsReadPending: boolean;
  deletePending: boolean;
}

function NotificationRow({ notification, isAdmin, onMarkAsRead, onDelete, markAsReadPending, deletePending }: NotificationRowProps) {
  const typeConfig = NOTIFICATION_TYPE_CONFIG[notification.type as NotificationMuralType] ?? {
    ...NOTIFICATION_TYPE_FALLBACK,
    label: notification.type,
  };
  const severityConfig = notification.severity ? NOTIFICATION_SEVERITY_CONFIG[notification.severity] : NOTIFICATION_SEVERITY_CONFIG.INFO;
  const TypeIcon = typeConfig.icon;
  const detailLink = resolveNotificationLink(notification);
  const isNew = notification.status === 'NOVA';

  const content = (
    <Card className={`border-0 shadow-sm transition-all hover:shadow-md ${isNew ? 'border-l-4 border-l-blue-500 bg-blue-50' : 'bg-card'} ${detailLink ? 'cursor-pointer' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${severityConfig.color}`}>
              <TypeIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{notification.title}</h3>
                {isNew && <Badge className="bg-blue-500 text-xs text-white">Nova</Badge>}
              </div>
              <p className="mb-2 text-sm text-muted-foreground">{notification.message}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Badge variant="outline" className="text-xs">
                  {typeConfig.label}
                </Badge>
                {notification.severity && notification.severity !== 'INFO' && (
                  <Badge className={`border-0 text-xs text-white ${severityConfig.color}`}>{severityConfig.label}</Badge>
                )}
                <span className="text-muted-foreground/70">{formatNotificationTime(notification.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isNew && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkAsRead();
                }}
                disabled={markAsReadPending}
                title="Marcar como lida"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={deletePending}
                className="text-red-500 hover:text-red-600"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return detailLink ? <Link to={detailLink}>{content}</Link> : content;
}
