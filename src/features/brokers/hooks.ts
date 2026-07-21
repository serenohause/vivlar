import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { BrokerMutationPayload } from '@/features/brokers/schemas';
import type { Broker } from '@/features/brokers/types';
import { supabase } from '@/lib/supabase';

const BROKERS_QUERY_KEY = ['brokers'] as const;

function brokerQueryKey(id: string) {
  return ['broker', id] as const;
}

function brokerDealsCountQueryKey(brokerId: string) {
  return ['broker-deals-count', brokerId] as const;
}

/** Lista de corretores do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useBrokers() {
  return useQuery({
    queryKey: BROKERS_QUERY_KEY,
    queryFn: async (): Promise<Broker[]> => {
      const { data, error } = await supabase
        .from('brokers')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useBroker(id: string | undefined) {
  return useQuery({
    queryKey: brokerQueryKey(id ?? ''),
    queryFn: async (): Promise<Broker> => {
      const { data, error } = await supabase
        .from('brokers')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateBroker() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: BrokerMutationPayload): Promise<Broker> => {
      // `tenant_id` é `not null` sem default (0013_brokers.sql) — o client
      // precisa mandar o valor. Seguro porque o `with check` da RLS
      // (0017_rls_crm.sql) rejeita qualquer valor que não bata com o claim
      // `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('brokers')
        .insert({
          ...input,
          tenant_id: tenantId,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROKERS_QUERY_KEY });
    },
  });
}

export function useUpdateBroker(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: BrokerMutationPayload): Promise<Broker> => {
      const { data, error } = await supabase
        .from('brokers')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROKERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: brokerQueryKey(id) });
    },
  });
}

/** Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do sistema — sem policy de DELETE na RLS. */
export function useSoftDeleteBroker() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brokers')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BROKERS_QUERY_KEY });
    },
  });
}

/**
 * Contagem simples de negociações (`deals`) vinculadas a um corretor —
 * usada só pelo card "Negociações" de `BrokerDetailPage`, sem lista/preview
 * (o Kanban de Deals ainda não tem UI própria — só a contagem, mesmo
 * critério combinado para esta leva: nada de link para detalhe de negócio,
 * e nada de UI de comissão calculada a partir de negócios).
 */
export function useBrokerDealsCount(brokerId: string | undefined) {
  return useQuery({
    queryKey: brokerDealsCountQueryKey(brokerId ?? ''),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId as string)
        .eq('is_deleted', false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(brokerId),
  });
}
