import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { ActivityMutationPayload } from '@/features/deals/schemas';
import type { Activity, ActivityStatus, StatusTransition } from '@/features/deals/types';
import { supabase } from '@/lib/supabase';

/** Exportada para `features/deals/hooks.ts` (`useUpdateDealStage`) poder invalidar depois de criar a atividade de venda, sem duplicar a chave aqui. */
export function dealActivitiesQueryKey(dealId: string) {
  return ['deal-activities', dealId] as const;
}

/** Exportada pelo mesmo motivo de `dealActivitiesQueryKey` — `useUpdateDealStage` cria uma transição a cada mudança de estágio. */
export function dealTransitionsQueryKey(dealId: string) {
  return ['deal-transitions', dealId] as const;
}

/** Atividades de um negócio — aba "Atividades" de `DealDetailPage`. */
export function useDealActivities(dealId: string | undefined) {
  return useQuery({
    queryKey: dealActivitiesQueryKey(dealId ?? ''),
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('deal_id', dealId as string)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(dealId),
  });
}

interface CreateActivityInput extends ActivityMutationPayload {
  client_id: string | null;
  unit_id: string | null;
}

/**
 * Cria atividade ligada a um negócio — fiel ao dialog "Nova Atividade" de
 * `original-project/src/pages/DealDetail.jsx` (`status: "ABERTA"` sempre no
 * create, `deal_id`/`unit_id` do negócio corrente).
 */
export function useCreateActivity(dealId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateActivityInput): Promise<Activity> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('activities')
        .insert({
          ...input,
          tenant_id: tenantId,
          deal_id: dealId,
          status: 'aberta',
          created_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dealActivitiesQueryKey(dealId) });
    },
  });
}

/**
 * Marca atividade como concluída (ou cancelada) — só `status` é editável
 * (RLS de `activities` tem policy de UPDATE, ver 0017_rls_crm.sql), fiel a
 * `DealDetail.jsx` (`Activity.update(id, { status: "CONCLUIDA" })`).
 */
export function useUpdateActivityStatus(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ActivityStatus }): Promise<Activity> => {
      const { data, error } = await supabase.from('activities').update({ status }).eq('id', id).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dealActivitiesQueryKey(dealId) });
    },
  });
}

/**
 * Histórico de transições de estágio de um negócio — aba "Timeline" de
 * `DealDetailPage`. Só leitura: `status_transitions` é log write-once, sem
 * policy de UPDATE (ver 0017_rls_crm.sql) — nunca tente editar um registro
 * desta tabela.
 */
export function useDealStatusTransitions(dealId: string | undefined) {
  return useQuery({
    queryKey: dealTransitionsQueryKey(dealId ?? ''),
    queryFn: async (): Promise<StatusTransition[]> => {
      const { data, error } = await supabase
        .from('status_transitions')
        .select('*')
        .eq('deal_id', dealId as string)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(dealId),
  });
}
