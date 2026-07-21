import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { ProjectMutationPayload } from '@/features/projects/schemas';
import type { Project, ProjectUnitPreview } from '@/features/projects/types';
import { supabase } from '@/lib/supabase';

const PROJECTS_QUERY_KEY = ['projects'] as const;

function projectQueryKey(id: string) {
  return ['project', id] as const;
}

function projectUnitsQueryKey(projectId: string) {
  return ['project-units', projectId] as const;
}

/** Lista de projetos do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectQueryKey(id ?? ''),
    queryFn: async (): Promise<Project> => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id as string).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: ProjectMutationPayload): Promise<Project> => {
      // `tenant_id` é `not null` sem default (0007_projects.sql) — o client
      // precisa mandar o valor. Seguro porque o `with check` da RLS
      // (0010_rls_catalog.sql) rejeita qualquer valor que não bata com o
      // claim `tenant_id` do JWT.
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('projects')
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
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ProjectMutationPayload): Promise<Project> => {
      const { data, error } = await supabase
        .from('projects')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: projectQueryKey(id) });
    },
  });
}

/**
 * Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do
 * sistema — sem policy de DELETE na RLS. Diferente do original
 * (`Projects.jsx`, `softDeleteMutation`), que também soft-deleta
 * documentos/contratos e apaga (hard delete) as unidades do projeto: essas
 * tabelas (`documents`, `contracts`) ainda não existem no schema, e
 * `units` não tem policy de DELETE (só soft delete) — apagar unidades em
 * cascata aqui seria tanto impossível via RLS quanto uma decisão de
 * produto que não cabe a esta tarefa. Só o projeto é soft-deletado; as
 * unidades vinculadas continuam existindo, sem projeto ativo — sinalizado
 * no relatório final.
 */
export function useSoftDeleteProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('projects')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
}

/**
 * Contagem de unidades por status/projeto, usada só pelos cards/colunas
 * agregadas de `ProjectsListPage` ("Total Unidades", "Vendidas",
 * "Disponíveis" por linha) — mesma ideia de `Projects.jsx` original
 * (`projectStats`), que busca todas as unidades do tenant e agrupa no
 * client. Sem UI de unidade própria ainda (próxima tarefa) — só os
 * campos mínimos para a agregação.
 */
export function useUnitsStatsByProject() {
  return useQuery({
    queryKey: ['units-stats-by-project'],
    queryFn: async (): Promise<Pick<ProjectUnitPreview, 'project_id' | 'status'>[]> => {
      const { data, error } = await supabase.from('units').select('project_id, status').eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Unidades de um projeto específico — usado só pela seção "Unidades do
 * Projeto" de `ProjectDetailPage` (prévia simples, sem link para detalhe de
 * unidade — módulo ainda não tem UI própria, ver `ProjectUnitPreview`).
 */
export function useProjectUnits(projectId: string | undefined) {
  return useQuery({
    queryKey: projectUnitsQueryKey(projectId ?? ''),
    queryFn: async (): Promise<ProjectUnitPreview[]> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, project_id, sku, status, admin_status, updated_at')
        .eq('project_id', projectId as string)
        .eq('is_deleted', false)
        .order('sku', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(projectId),
  });
}
