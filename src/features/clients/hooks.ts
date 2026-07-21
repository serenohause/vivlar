import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { ClientMutationPayload } from '@/features/clients/schemas';
import type { Client, ClientDealPreview } from '@/features/clients/types';
import { supabase } from '@/lib/supabase';

const CLIENTS_QUERY_KEY = ['clients'] as const;
const CLIENTS_DEALS_SUMMARY_QUERY_KEY = ['clients-deals-summary'] as const;

function clientQueryKey(id: string) {
  return ['client', id] as const;
}

function clientDealsQueryKey(clientId: string) {
  return ['client-deals', clientId] as const;
}

/** Lista de clientes do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useClients() {
  return useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: clientQueryKey(id ?? ''),
    queryFn: async (): Promise<Client> => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: ClientMutationPayload): Promise<Client> => {
      // `tenant_id` é `not null` sem default (0011_clients.sql) — o client
      // precisa mandar o valor. Seguro porque o `with check` da RLS
      // (0017_rls_crm.sql) rejeita qualquer valor que não bata com o claim
      // `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('clients')
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
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CLIENTS_DEALS_SUMMARY_QUERY_KEY });
    },
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ClientMutationPayload): Promise<Client> => {
      const { data, error } = await supabase
        .from('clients')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: clientQueryKey(id) });
    },
  });
}

/** Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do sistema — sem policy de DELETE na RLS. */
export function useSoftDeleteClient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CLIENTS_DEALS_SUMMARY_QUERY_KEY });
    },
  });
}

/**
 * Resumo mínimo (`client_id`, `unit_id`) de todas as negociações não
 * excluídas do tenant — usado só pelos cards/coluna "Negociações" e
 * "Unidade" de `ClientsListPage` (contagem por cliente e unidade da
 * primeira negociação), mesma ideia de `getDealsCount`/`getClientUnit` do
 * `Clients.jsx` original. Sem UI de negócio própria ainda (Kanban do CRM é
 * a próxima tarefa) — só os campos necessários para essa agregação.
 */
export interface ClientDealSummary {
  id: string;
  client_id: string;
  unit_id: string | null;
}

export function useClientsDealsSummary() {
  return useQuery({
    queryKey: CLIENTS_DEALS_SUMMARY_QUERY_KEY,
    queryFn: async (): Promise<ClientDealSummary[]> => {
      const { data, error } = await supabase.from('deals').select('id, client_id, unit_id').eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Negociações de um cliente específico (prévia simples, sem link para
 * detalhe de negócio — módulo ainda não tem UI própria), usada só pela
 * seção "Negociações" de `ClientDetailPage`. Mesmo filtro do original
 * (`ClientDetail.jsx`): exclui negócios soft-deleted, perdidos e
 * distratados.
 */
export function useClientDeals(clientId: string | undefined) {
  return useQuery({
    queryKey: clientDealsQueryKey(clientId ?? ''),
    queryFn: async (): Promise<ClientDealPreview[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, project_id, unit_id, sales_stage, expected_sale_value, sold_at, commission_value')
        .eq('client_id', clientId as string)
        .eq('is_deleted', false)
        .not('sales_stage', 'in', '(perdido,distratado)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(clientId),
  });
}
