import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { RealEstateAgencyMutationPayload } from '@/features/real-estate-agencies/schemas';
import type { RealEstateAgency } from '@/features/real-estate-agencies/types';
import { supabase } from '@/lib/supabase';

const REAL_ESTATE_AGENCIES_QUERY_KEY = ['real-estate-agencies'] as const;

function realEstateAgencyQueryKey(id: string) {
  return ['real-estate-agency', id] as const;
}

/** Lista de imobiliárias do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useRealEstateAgencies() {
  return useQuery({
    queryKey: REAL_ESTATE_AGENCIES_QUERY_KEY,
    queryFn: async (): Promise<RealEstateAgency[]> => {
      const { data, error } = await supabase
        .from('real_estate_agencies')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useRealEstateAgency(id: string | undefined) {
  return useQuery({
    queryKey: realEstateAgencyQueryKey(id ?? ''),
    queryFn: async (): Promise<RealEstateAgency> => {
      const { data, error } = await supabase
        .from('real_estate_agencies')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateRealEstateAgency() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: RealEstateAgencyMutationPayload): Promise<RealEstateAgency> => {
      // `tenant_id` é `not null` sem default (0012_real_estate_agencies.sql)
      // — o client precisa mandar o valor. Seguro porque o `with check` da
      // RLS (0017_rls_crm.sql) rejeita qualquer valor que não bata com o
      // claim `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('real_estate_agencies')
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
      queryClient.invalidateQueries({ queryKey: REAL_ESTATE_AGENCIES_QUERY_KEY });
    },
  });
}

export function useUpdateRealEstateAgency(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: RealEstateAgencyMutationPayload): Promise<RealEstateAgency> => {
      const { data, error } = await supabase
        .from('real_estate_agencies')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REAL_ESTATE_AGENCIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: realEstateAgencyQueryKey(id) });
    },
  });
}

/**
 * Exclusão é sempre soft delete (`is_deleted = true`) — sem policy de
 * DELETE na RLS. Sem botão próprio na tela de listagem (o dialog original,
 * `RealEstateAgencies.jsx`, não tem ação de excluir, só editar), mas o
 * hook existe para manter o CRUD completo e consistente com o resto do
 * sistema, disponível a partir do detalhe.
 */
export function useSoftDeleteRealEstateAgency() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('real_estate_agencies')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REAL_ESTATE_AGENCIES_QUERY_KEY });
    },
  });
}
