import { useMutation, useQuery } from '@tanstack/react-query';

import type { CreateTenantInput } from '@/features/auth/schemas';
import type { Tenant, TenantRole } from '@/features/auth/types';
import { supabase } from '@/lib/supabase';

export function useCreateTenant() {
  return useMutation({
    mutationFn: async ({ name, slug }: CreateTenantInput) => {
      const { data, error } = await supabase.rpc('create_tenant_with_admin', {
        p_tenant_name: name,
        p_tenant_slug: slug,
      });

      if (error) throw error;

      // Obrigatório: sem isto o JWT em uso continua sem tenant_id/
      // tenant_role e toda a RLS nega dados, mesmo com o tenant já
      // existindo no banco (comportamento confirmado pelo rls-guardian).
      await supabase.auth.refreshSession();

      return data as string;
    },
  });
}

/**
 * Retorno de `accept_pending_invite()` (RPC `security definer`, ver
 * `supabase/migrations/0063_rls_configuracoes.sql`) — SEMPRE 1 dos 2
 * formatos, nunca lança erro para "sem convite pendente".
 */
export interface AcceptPendingInviteResult {
  accepted: boolean;
  tenant_id?: string;
  tenant_name?: string;
  role?: TenantRole;
}

/**
 * Aceite automático de convite "lista de espera" (`tenant_invites`) —
 * chamado pelo `ProtectedRoute` assim que existe sessão autenticada mas
 * ainda sem `tenant_id` no claim do JWT, antes de decidir entre renderizar
 * o app normalmente ou `NoTenantScreen`. Mesma obrigação já documentada
 * para `useCreateTenant`: se um convite foi aceito, o JWT em uso só ganha
 * `tenant_id`/`tenant_role` depois de `refreshSession()` — sem isso a RLS
 * nega tudo mesmo com o vínculo já existindo em `tenant_users`.
 */
export function useAcceptPendingInvite() {
  return useMutation({
    mutationFn: async (): Promise<AcceptPendingInviteResult> => {
      const { data, error } = await supabase.rpc('accept_pending_invite');
      if (error) throw error;

      const result = data as AcceptPendingInviteResult;
      if (result.accepted) {
        await supabase.auth.refreshSession();
      }
      return result;
    },
  });
}

export function useTenant(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: async (): Promise<Tenant> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('id', tenantId as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(tenantId),
  });
}
