import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { StatusTransition } from '@/features/deals/types';
import type { UnitMutationPayload } from '@/features/units/schemas';
import type { Unit, UnitAdminStatus, UnitStatus } from '@/features/units/types';
import { supabase } from '@/lib/supabase';

const UNITS_QUERY_KEY = ['units'] as const;
const UNIT_STATUS_TRANSITIONS_QUERY_KEY = ['unit-status-transitions'] as const;
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

/**
 * Exportada (em vez de ficar privada deste módulo) para `features/deals/hooks.ts`
 * poder invalidar `units`/derivados depois de refletir `units.status` como
 * parte da mesma operação de mudança de estágio de um negócio — sem
 * duplicar as chaves de query aqui.
 */
export function invalidateUnitsQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
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

/**
 * Todas as transições de status ligadas a alguma unidade (`unit_id` não
 * nulo) do tenant inteiro — comerciais e administrativas juntas, sem
 * filtrar por `transition_type`. Usada só por `UnitsComparisonPage` para
 * achar a primeira transição de cada unidade e calcular "tempo total no
 * processo" (fiel a `StatusTransition.filter({})` sem filtro nenhum em
 * `original-project/src/pages/UnitsComparison.jsx`; aqui já filtrado a
 * `unit_id not null` no próprio `select`, porque linhas só-de-`deal_id`
 * nunca entrariam no `unitTransitions.filter(t => t.unit_id === unit.id)`
 * do original de qualquer forma — mesmo resultado, menos dado trafegado).
 * Chave de query própria (não reaproveita `dealTransitionsQueryKey` de
 * `features/deals/activities-hooks.ts`, que é por `deal_id` específico) —
 * só leitura, `status_transitions` é log write-once (ver
 * `useDealStatusTransitions`).
 */
export function useUnitStatusTransitions() {
  return useQuery({
    queryKey: UNIT_STATUS_TRANSITIONS_QUERY_KEY,
    queryFn: async (): Promise<StatusTransition[]> => {
      const { data, error } = await supabase
        .from('status_transitions')
        .select('*')
        .not('unit_id', 'is', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    },
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

/**
 * Update direto de `units.status` (função simples, sem `useMutation`) —
 * extraída de `useUpdateUnitStatus` para ser reaproveitada por
 * `features/deals/hooks.ts` (`useUpdateDealStage`), que precisa refletir o
 * status da unidade como parte da mesma operação de mudança de estágio do
 * negócio, sem duplicar esta query (mesmo padrão fiel a
 * `original-project/src/pages/CRM.jsx`, que também faz `Unit.update` dentro
 * da mutation de mudança de estágio do deal).
 */
export async function updateUnitStatus(id: string, status: UnitStatus, updatedByUserId: string | null): Promise<Unit> {
  const { data, error } = await supabase
    .from('units')
    .update({ status, updated_by_user_id: updatedByUserId })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Atualiza só o status comercial (disponível/reservada/vendida/bloqueada) — ação rápida a partir da lista ou do detalhe. */
export function useUpdateUnitStatus(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (status: UnitStatus) => updateUnitStatus(id, status, user?.id ?? null),
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
