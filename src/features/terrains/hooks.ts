import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { TerrainLocationInput, TerrainMutationPayload } from '@/features/terrains/schemas';
import type { Terrain } from '@/features/terrains/types';
import { supabase } from '@/lib/supabase';

const TERRAINS_QUERY_KEY = ['terrains'] as const;

function terrainQueryKey(id: string) {
  return ['terrain', id] as const;
}

/** Lista de terrenos do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useTerrains() {
  return useQuery({
    queryKey: TERRAINS_QUERY_KEY,
    queryFn: async (): Promise<Terrain[]> => {
      const { data, error } = await supabase
        .from('terrains')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useTerrain(id: string | undefined) {
  return useQuery({
    queryKey: terrainQueryKey(id ?? ''),
    queryFn: async (): Promise<Terrain> => {
      const { data, error } = await supabase
        .from('terrains')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateTerrain() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: TerrainMutationPayload): Promise<Terrain> => {
      // `tenant_id` é `not null` sem default (0009_terrains.sql) — o client
      // precisa mandar o valor. Seguro porque o `with check` da RLS
      // (0010_rls_catalog.sql) rejeita qualquer valor que não bata com o
      // claim `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('terrains')
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
      queryClient.invalidateQueries({ queryKey: TERRAINS_QUERY_KEY });
    },
  });
}

export function useUpdateTerrain(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: TerrainMutationPayload): Promise<Terrain> => {
      const { data, error } = await supabase
        .from('terrains')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRAINS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: terrainQueryKey(id) });
    },
  });
}

/** Atualiza só latitude/longitude (pino simples, sem mapa interativo — ver escopo combinado). */
export function useUpdateTerrainLocation(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: TerrainLocationInput): Promise<Terrain> => {
      const { data, error } = await supabase
        .from('terrains')
        .update({
          ...input,
          location_updated_at: new Date().toISOString(),
          location_updated_by_user_id: user?.id ?? null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRAINS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: terrainQueryKey(id) });
    },
  });
}

/** Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do sistema — sem policy de DELETE na RLS. */
export function useSoftDeleteTerrain() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('terrains')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRAINS_QUERY_KEY });
    },
  });
}
