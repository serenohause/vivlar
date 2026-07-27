import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { ProjectOperationalResult } from '@/features/investors/resultHelpers';
import type { Investor } from '@/features/investors/types';
import { supabase } from '@/lib/supabase';

/**
 * O registro de `investors` do usuário autenticado (`tenant_role =
 * 'investidor'`) — vínculo por `investors.user_id = auth.uid()`, já
 * garantido pela RLS (`investors_select_tenant_investor_own`,
 * `0055_rls_investor_portal.sql`). Filtrar por `user_id` aqui de novo é só
 * clareza de leitura/defesa em profundidade, mesmo critério de
 * `useMyClient()` (`src/features/client-portal/hooks.ts`).
 * `null` (via `maybeSingle`) cobre o estado "perfil não vinculado" — usuário
 * autenticado com `tenant_role = 'investidor'`, mas nenhum
 * `investors.user_id` aponta pra ele ainda (vínculo é feito manualmente
 * hoje, mesma situação do Portal do Cliente, ver `docs/STATUS.md`).
 *
 * Usada pelas 4 telas do Portal do Investidor (`InvestorDashboardInvestorView`/
 * `InvestorProjectsPage`/`InvestorContributionsPage`/`InvestorReturnsPage`)
 * para decidir entre o estado "perfil não vinculado" e o restante do fluxo.
 */
export function useMyInvestor() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-investor', user?.id ?? ''],
    queryFn: async (): Promise<Investor | null> => {
      const { data, error } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_deleted', false)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.id),
  });
}

/**
 * Resultado operacional agregado de UM projeto — RPC `get_project_operational_result`
 * (SECURITY DEFINER, `supabase/migrations/0056_investor_operational_result.sql`).
 * Autorização é resolvida inteiramente dentro do banco (equipe interna do
 * tenant sempre pode; `investidor` só com vínculo ativo no projeto via
 * `investor_has_stake_in_project`) — sem projeto/vínculo válido, a RPC
 * devolve 0 linhas (nunca um erro 403/500), por isso o retorno aqui é
 * `null` em vez de uma exceção lançada.
 */
export function useProjectOperationalResult(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-operational-result', projectId ?? ''],
    queryFn: async (): Promise<ProjectOperationalResult | null> => {
      const { data, error } = await supabase.rpc('get_project_operational_result', { p_project_id: projectId as string });

      if (error) throw error;
      const rows = (data ?? []) as ProjectOperationalResult[];
      return rows[0] ?? null;
    },
    enabled: Boolean(projectId),
  });
}
