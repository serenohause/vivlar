import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { Client } from '@/features/clients/types';
import { supabase } from '@/lib/supabase';

/**
 * O registro de `clients` do usuário autenticado (`tenant_role = 'cliente'`)
 * — vínculo por `clients.user_id = auth.uid()`, já garantido pela RLS
 * (`clients_select_tenant_client_own`, `0053_rls_client_portal_access.sql`).
 * Filtrar por `user_id` aqui de novo é só clareza de leitura/defesa em
 * profundidade — a RLS é quem de fato isola, mesmo critério das 3 telas
 * originais do Portal do Cliente (`allClients.find(c => c.user_id ===
 * currentUser?.id)`, `ClientUnit.jsx`/`ClientFinance.jsx`/`ClientMaintenance.jsx`).
 * `null` (via `maybeSingle`) cobre o estado "perfil não vinculado" — usuário
 * autenticado com `tenant_role = 'cliente'`, mas nenhum `clients.user_id`
 * aponta pra ele ainda (vínculo é feito manualmente hoje, ver `docs/STATUS.md`
 * — não existe UI de convite nesta rodada).
 *
 * Usada pelas 3 páginas do Portal do Cliente (`ClientUnitPage`/
 * `ClientFinancePage`/`ClientMaintenancePage`) para decidir entre o estado
 * "perfil não vinculado" e o restante do fluxo (que depende de
 * `client.id`).
 */
export function useMyClient() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-client', user?.id ?? ''],
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase
        .from('clients')
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
