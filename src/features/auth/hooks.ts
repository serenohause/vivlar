import { useMutation, useQuery } from '@tanstack/react-query';

import type { CreateTenantInput } from '@/features/auth/schemas';
import type { Tenant } from '@/features/auth/types';
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
