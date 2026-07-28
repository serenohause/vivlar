import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { Notification } from '@/features/notifications/types';
import { supabase } from '@/lib/supabase';

const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

function recentNotificationsQueryKey(limit: number) {
  return [...NOTIFICATIONS_QUERY_KEY, 'recent', limit] as const;
}

/**
 * Busca a lista de notificações do tenant, sem nenhuma filtragem client-side
 * por `audience`/papel — a RLS de `notifications` (`0065_rls_notifications.sql`)
 * já devolve exatamente o que cada `tenant_role` pode ver (mural pela regra
 * de audience x papel, mais as notificações pessoais do próprio usuário),
 * mesma simplificação já usada nos portais anteriores (Cliente/Investidor):
 * não reimplementar no client uma autorização que o banco já resolve.
 *
 * Como consequência direta dessa simplificação (não uma escolha de UI em
 * separado): notificações PESSOAIS do próprio usuário aparecem misturadas
 * na mesma lista/sino que o mural — diferente do sino original
 * (`NotificationBell.jsx`), cujo filtro client-side só reconhecia valores de
 * `audience` e por isso NUNCA exibia notificações pessoais (`user_id`
 * preenchido, `audience` nulo) — eram invisíveis lá por um descuido do
 * filtro, não por design. Aqui elas aparecem, o que é estritamente melhor
 * (o destinatário passa a ver o que é seu) — reportado como divergência
 * consciente do original, não um bug novo.
 *
 * Soft-delete (`is_deleted`) é filtrado aqui no client, não pela RLS de
 * SELECT (mesmo padrão de `documents`/`maintenance_requests`/`support_tickets`,
 * ver comentário da policy em `0065_rls_notifications.sql`).
 */
async function fetchNotifications(limit?: number): Promise<Notification[]> {
  let query = supabase.from('notifications').select('*').eq('is_deleted', false).order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Lista completa (sem limite) — `NotificationsPage` (KPIs, filtros, mural inteiro). */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => fetchNotifications(),
  });
}

/**
 * 50 mais recentes, refeita a cada 30s — `NotificationBell`, fiel a
 * `base44.entities.Notification.list("-created_date", 50)` +
 * `refetchInterval: 30000` do original. Chave própria (prefixo compartilhado
 * com `NOTIFICATIONS_QUERY_KEY`, mesmo padrão de
 * `ALL_PAYMENT_INSTALLMENTS_QUERY_KEY`/`paymentInstallmentsQueryKey` em
 * `features/finance/hooks.ts`) — uma mutation que invalida a chave "base"
 * invalida as duas de uma vez (`exact: false` é o default do React Query).
 */
export function useRecentNotifications(limit = 50) {
  return useQuery({
    queryKey: recentNotificationsQueryKey(limit),
    queryFn: () => fetchNotifications(limit),
    refetchInterval: 30000,
  });
}

/** Marca uma notificação como lida — tradução de `markAsReadMutation` (mural e pessoal usam a mesma coluna `status`/`read_at`/`read_by_user_id`, RLS decide quem pode). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('notifications')
        .update({ status: 'LIDA', read_at: new Date().toISOString(), read_by_user_id: user?.id ?? null })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

/**
 * Marca várias notificações como lidas de uma vez — tradução de
 * `markAllAsReadMutation` (`Notifications.jsx`/`NotificationBell.jsx`, que
 * fazem um `update` por notificação em loop/`Promise.all`). Aqui vira um
 * único `UPDATE ... WHERE id IN (...)` — mesmo resultado, uma chamada de
 * rede em vez de N (a RLS de UPDATE continua sendo avaliada linha a linha
 * pelo Postgres, nada muda em termos de autorização).
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;

      const { error } = await supabase
        .from('notifications')
        .update({ status: 'LIDA', read_at: new Date().toISOString(), read_by_user_id: user?.id ?? null })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

/**
 * Soft-delete de uma notificação — tradução de `deleteNotificationMutation`.
 * A RLS (`notifications_update_mural_shared`) só aceita `is_deleted = true`
 * de `admin` para o modo mural (o modo pessoal nem tem UI de exclusão nesta
 * tela) — o botão que chama este hook já fica escondido para quem não é
 * admin (`NotificationsPage`/`NotificationBell`), esta é só a chamada em si.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}

/**
 * Soft-delete em lote das notificações já lidas — tradução de
 * `clearReadMutation` (botão "Limpar lidas", `Notifications.jsx`, também
 * restrito a admin no original). Mesmo raciocínio de
 * `useMarkAllNotificationsRead`: um `UPDATE ... WHERE id IN (...)` em vez de
 * loop.
 */
export function useClearReadNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });
}
