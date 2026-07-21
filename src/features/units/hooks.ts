import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { UnitMutationPayload } from '@/features/units/schemas';
import type { Unit, UnitAdminStatus, UnitStatus } from '@/features/units/types';
import { supabase } from '@/lib/supabase';

const UNITS_QUERY_KEY = ['units'] as const;
// Chaves de outras features que ficam desatualizadas quando `units` muda —
// invalidadas junto (match por prefixo, `exact: false` é o default do
// React Query) para não deixar `ProjectsListPage`/`ProjectDetailPage`
// (que usam `useUnitsStatsByProject`/`useProjectUnits` de
// `features/projects/hooks.ts`) com dado velho depois de criar/editar/
// excluir uma unidade por aqui.
const UNITS_STATS_QUERY_KEY = ['units-stats-by-project'] as const;
const PROJECT_UNITS_QUERY_KEY = ['project-units'] as const;

function unitQueryKey(id: string) {
  return ['unit', id] as const;
}

function invalidateUnitsQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: UNITS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: UNITS_STATS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: PROJECT_UNITS_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: unitQueryKey(id) });
}

/**
 * Lista de unidades do tenant (RLS já restringe a admin/comercial/administrativo),
 * excluindo soft-deleted. Sem parâmetro de projeto: filtro é feito no
 * client (mesmo padrão de `original-project/src/pages/Units.jsx`, que busca
 * todas as unidades e filtra em memória).
 */
export function useUnits() {
  return useQuery({
    queryKey: UNITS_QUERY_KEY,
    queryFn: async (): Promise<Unit[]> => {
      const { data, error } = await supabase
        .from('units')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useUnit(id: string | undefined) {
  return useQuery({
    queryKey: unitQueryKey(id ?? ''),
    queryFn: async (): Promise<Unit> => {
      const { data, error } = await supabase
        .from('units')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateUnit() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: UnitMutationPayload): Promise<Unit> => {
      // `tenant_id` é `not null` sem default (0008_units.sql) — o client
      // precisa mandar o valor. Seguro porque o `with check` da RLS
      // (0010_rls_catalog.sql) rejeita qualquer valor que não bata com o
      // claim `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('units')
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
    onSuccess: () => invalidateUnitsQueries(queryClient),
  });
}

export function useUpdateUnit(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: UnitMutationPayload): Promise<Unit> => {
      const { data, error } = await supabase
        .from('units')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateUnitsQueries(queryClient, id),
  });
}

/** Atualiza só o status comercial (disponível/reservada/vendida/bloqueada) — ação rápida a partir da lista ou do detalhe. */
export function useUpdateUnitStatus(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (status: UnitStatus): Promise<Unit> => {
      const { data, error } = await supabase
        .from('units')
        .update({ status, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateUnitsQueries(queryClient, id),
  });
}

/**
 * Avança/retrocede o pipeline administrativo MCMV (`admin_status`) — só um
 * `update` simples na própria coluna, SEM a validação de "documentos
 * obrigatórios aprovados antes de avançar" do original (`checkCanAdvance`
 * em `UnitDetail.jsx`, que cruza `Document`/`UnitCheck` — tabelas que ainda
 * não existem, módulo futuro de Documentos) e SEM criar `StatusTransition`/
 * `Activity` nem notificar Teams (idem, dependem de tabelas futuras —
 * `activities`/`status_transitions`, módulo futuro de CRM). Histórico de
 * transição fica para quando esses módulos existirem. A UI
 * (`UnitAdminStatusPipeline`) avisa que a validação de pré-requisitos ainda
 * não está ativa.
 */
export function useUpdateUnitAdminStatus(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (admin_status: UnitAdminStatus | null): Promise<Unit> => {
      const { data, error } = await supabase
        .from('units')
        .update({ admin_status, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateUnitsQueries(queryClient, id),
  });
}

/**
 * Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do
 * sistema — sem policy de DELETE na RLS. Diferente do original
 * (`Units.jsx`, `canDeleteUnit`), que bloqueia a exclusão se a unidade tem
 * contrato ou negociação ativa: `contracts`/`deals` ainda não existem no
 * schema, então essa checagem não tem o que validar por enquanto — sem
 * efeito prático até o módulo de CRM/Financeiro existir (sinalizado no
 * relatório final).
 */
export function useSoftDeleteUnit() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('units')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_data, id) => invalidateUnitsQueries(queryClient, id),
  });
}
