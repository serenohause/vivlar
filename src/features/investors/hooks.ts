import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type {
  InvestmentContributionMutationPayload,
  InvestmentReturnMutationPayload,
  InvestorMutationPayload,
  ProjectInvestorMutationPayload,
} from '@/features/investors/schemas';
import type { InvestmentContribution, InvestmentReturn, Investor, ProjectInvestor } from '@/features/investors/types';
import { supabase } from '@/lib/supabase';

const INVESTORS_QUERY_KEY = ['investors'] as const;
const PROJECT_INVESTORS_QUERY_KEY = ['project-investors'] as const;
const CONTRIBUTIONS_QUERY_KEY = ['investment-contributions'] as const;
const RETURNS_QUERY_KEY = ['investment-returns'] as const;

function investorQueryKey(id: string) {
  return ['investor', id] as const;
}

function projectInvestorsByInvestorQueryKey(investorId: string) {
  return ['project-investors-by-investor', investorId] as const;
}

function contributionsByInvestorQueryKey(investorId: string) {
  return ['investment-contributions-by-investor', investorId] as const;
}

function returnsByInvestorQueryKey(investorId: string) {
  return ['investment-returns-by-investor', investorId] as const;
}

// ---------------------------------------------------------------------
// investors
// ---------------------------------------------------------------------

/** Lista de investidores do tenant (RLS libera leitura a admin/comercial/administrativo, ver `0045_rls_investors.sql`), excluindo soft-deleted. */
export function useInvestors() {
  return useQuery({
    queryKey: INVESTORS_QUERY_KEY,
    queryFn: async (): Promise<Investor[]> => {
      const { data, error } = await supabase.from('investors').select('*').eq('is_deleted', false).order('nome', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

/** Um investidor específico — `InvestorDetailPage`. */
export function useInvestor(id: string | undefined) {
  return useQuery({
    queryKey: investorQueryKey(id ?? ''),
    queryFn: async (): Promise<Investor> => {
      const { data, error } = await supabase.from('investors').select('*').eq('id', id as string).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

/** Cria um investidor — tradução de `createMutation` (`Investors.jsx`). Escrita restrita a `admin` pela RLS (ver `0045_rls_investors.sql`). */
export function useCreateInvestor() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestorMutationPayload): Promise<Investor> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('investors')
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVESTORS_QUERY_KEY }),
  });
}

/** Edita um investidor — tradução de `updateMutation` (`Investors.jsx`). */
export function useUpdateInvestor(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestorMutationPayload): Promise<Investor> => {
      const { data, error } = await supabase
        .from('investors')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: investorQueryKey(id) });
    },
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteMutation` (`Investors.jsx`). Restrita a `admin` pela RLS (mesma policy de UPDATE) — a UI também esconde o botão fora de `admin` (ver `InvestorsListPage`). */
export function useSoftDeleteInvestor() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('investors')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: INVESTORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: investorQueryKey(id) });
    },
  });
}

// ---------------------------------------------------------------------
// project_investors — vínculo investidor↔projeto (ver ACHADO em types.ts:
// nenhuma tela do original cria este registro, só lê)
// ---------------------------------------------------------------------

/** Todos os vínculos investidor↔projeto do tenant, excluindo soft-deleted — usado só pelo cruzamento de `InvestorDashboardPage` (mesma ideia de `["project-investors"]` em `InvestorDashboard.jsx`). */
export function useProjectInvestors() {
  return useQuery({
    queryKey: PROJECT_INVESTORS_QUERY_KEY,
    queryFn: async (): Promise<ProjectInvestor[]> => {
      const { data, error } = await supabase.from('project_investors').select('*').eq('is_deleted', false).order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Vínculos de um investidor específico — seção "Projetos Vinculados" de `InvestorDetailPage`. */
export function useProjectInvestorsByInvestor(investorId: string | undefined) {
  return useQuery({
    queryKey: projectInvestorsByInvestorQueryKey(investorId ?? ''),
    queryFn: async (): Promise<ProjectInvestor[]> => {
      const { data, error } = await supabase
        .from('project_investors')
        .select('*')
        .eq('investor_id', investorId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(investorId),
  });
}

/**
 * Cria o vínculo investidor↔projeto — tela nova (`LinkProjectDialog`), sem
 * equivalente no original (ver ACHADO em `0042_project_investors.sql`).
 * Escrita restrita a `admin` pela RLS.
 */
export function useCreateProjectInvestor() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: ProjectInvestorMutationPayload & { investor_id: string }): Promise<ProjectInvestor> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('project_investors')
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
    onSuccess: (projectInvestor) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_INVESTORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: projectInvestorsByInvestorQueryKey(projectInvestor.investor_id) });
    },
  });
}

/** Edita um vínculo investidor↔projeto (corrigir aporte/percentual/nome de exibição sem excluir e recriar). */
export function useUpdateProjectInvestor(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: ProjectInvestorMutationPayload): Promise<ProjectInvestor> => {
      const { data, error } = await supabase
        .from('project_investors')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (projectInvestor) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_INVESTORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: projectInvestorsByInvestorQueryKey(projectInvestor.investor_id) });
    },
  });
}

/** Remove o vínculo (soft delete) — ex.: vínculo cadastrado por engano. Restrito a `admin` pela RLS. */
export function useSoftDeleteProjectInvestor() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (projectInvestor: Pick<ProjectInvestor, 'id' | 'investor_id'>) => {
      const { error } = await supabase
        .from('project_investors')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .eq('id', projectInvestor.id);

      if (error) throw error;
      return projectInvestor;
    },
    onSuccess: (projectInvestor) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_INVESTORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: projectInvestorsByInvestorQueryKey(projectInvestor.investor_id) });
    },
  });
}

// ---------------------------------------------------------------------
// investment_contributions
// ---------------------------------------------------------------------

/** Lista de aportes do tenant, excluindo soft-deleted, mais recentes primeiro — `InvestmentContributionsListPage`. */
export function useInvestmentContributions() {
  return useQuery({
    queryKey: CONTRIBUTIONS_QUERY_KEY,
    queryFn: async (): Promise<InvestmentContribution[]> => {
      const { data, error } = await supabase
        .from('investment_contributions')
        .select('*')
        .eq('is_deleted', false)
        .order('data', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Aportes de um investidor específico — seção "Aportes" de `InvestorDetailPage`. */
export function useInvestmentContributionsByInvestor(investorId: string | undefined) {
  return useQuery({
    queryKey: contributionsByInvestorQueryKey(investorId ?? ''),
    queryFn: async (): Promise<InvestmentContribution[]> => {
      const { data, error } = await supabase
        .from('investment_contributions')
        .select('*')
        .eq('investor_id', investorId as string)
        .eq('is_deleted', false)
        .order('data', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(investorId),
  });
}

/** Cria um aporte — tradução de `createMutation` (`InvestmentContributions.jsx`). Escrita restrita a `admin` pela RLS. */
export function useCreateInvestmentContribution() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestmentContributionMutationPayload): Promise<InvestmentContribution> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('investment_contributions')
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
      queryClient.invalidateQueries({ queryKey: CONTRIBUTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-contributions-by-investor'] });
    },
  });
}

/** Edita um aporte — tradução de `updateMutation` (`InvestmentContributions.jsx`). */
export function useUpdateInvestmentContribution(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestmentContributionMutationPayload): Promise<InvestmentContribution> => {
      const { data, error } = await supabase
        .from('investment_contributions')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRIBUTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-contributions-by-investor'] });
    },
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteMutation` (`InvestmentContributions.jsx`). Restrita a `admin` pela RLS. */
export function useSoftDeleteInvestmentContribution() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('investment_contributions')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRIBUTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-contributions-by-investor'] });
    },
  });
}

// ---------------------------------------------------------------------
// investment_returns
// ---------------------------------------------------------------------

/** Lista de retornos do tenant, excluindo soft-deleted, mais recentes primeiro — `InvestmentReturnsListPage`. */
export function useInvestmentReturns() {
  return useQuery({
    queryKey: RETURNS_QUERY_KEY,
    queryFn: async (): Promise<InvestmentReturn[]> => {
      const { data, error } = await supabase.from('investment_returns').select('*').eq('is_deleted', false).order('data', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Retornos de um investidor específico — seção "Retornos" de `InvestorDetailPage`. */
export function useInvestmentReturnsByInvestor(investorId: string | undefined) {
  return useQuery({
    queryKey: returnsByInvestorQueryKey(investorId ?? ''),
    queryFn: async (): Promise<InvestmentReturn[]> => {
      const { data, error } = await supabase
        .from('investment_returns')
        .select('*')
        .eq('investor_id', investorId as string)
        .eq('is_deleted', false)
        .order('data', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(investorId),
  });
}

/** Cria um retorno — tradução de `createMutation` (`InvestmentReturns.jsx`). Escrita restrita a `admin` pela RLS. */
export function useCreateInvestmentReturn() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestmentReturnMutationPayload): Promise<InvestmentReturn> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('investment_returns')
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
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-returns-by-investor'] });
    },
  });
}

/** Edita um retorno — tradução de `updateMutation` (`InvestmentReturns.jsx`). */
export function useUpdateInvestmentReturn(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: InvestmentReturnMutationPayload): Promise<InvestmentReturn> => {
      const { data, error } = await supabase
        .from('investment_returns')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-returns-by-investor'] });
    },
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteMutation` (`InvestmentReturns.jsx`). Restrita a `admin` pela RLS. */
export function useSoftDeleteInvestmentReturn() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('investment_returns')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by_user_id: user?.id ?? null })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RETURNS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['investment-returns-by-investor'] });
    },
  });
}
