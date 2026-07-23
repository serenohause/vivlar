import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { MAINTENANCE_TERMINAL_STATUSES } from '@/features/maintenance/types';
import { supabase } from '@/lib/supabase';

export interface NavigationBadges {
  crm: number;
  finance: number;
  maintenance: number;
  inspections: number;
  /**
   * O original referenciava este badge no item "Unidades" da sidebar, mas
   * `useNavigationBadges` nunca o calculava de fato (sempre `undefined` ->
   * nunca exibido). Incluído aqui só para o tipo bater com o que a
   * navegação referencia — zerado, igual aos demais.
   */
  units: number;
}

/**
 * No app original (`components/shared/NavigationBadges.jsx`), este hook
 * contava registros reais via `base44.entities.X.list()` (deals parados
 * há mais de 7 dias, parcelas em atraso, manutenções abertas, vistorias
 * pendentes). `crm`/`finance`/`inspections`/`units` continuam zerados
 * (débito técnico pré-existente, fora do escopo do módulo de Manutenção —
 * mesmo critério "lido sem write path confirmado" já usado em outros
 * campos, aqui é "não calculado ainda", não "não existe").
 *
 * `maintenance` agora é real: conta chamados não excluídos com status
 * diferente de `resolvido`/`cancelado` (`MAINTENANCE_TERMINAL_STATUSES`,
 * `features/maintenance/constants.ts`) — tradução do critério do original
 * (`NavigationBadges.jsx`: `status !== "CONCLUIDA"`), corrigido aqui: o
 * original filtrava por um status `"CONCLUIDA"` que não existe em
 * `STATUS_CONFIG` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`, que só
 * tem `RESOLVIDO`/`CANCELADO` como terminais) — claramente um bug legado do
 * projeto original, não reproduzido aqui.
 */
export function useNavigationBadges(): NavigationBadges {
  const { tenantRole } = useAuth();
  const canReadMaintenance = tenantRole === 'admin' || tenantRole === 'comercial' || tenantRole === 'administrativo';

  const { data: maintenanceCount } = useQuery({
    queryKey: ['navigation-badges', 'maintenance'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .not('status', 'in', `(${MAINTENANCE_TERMINAL_STATUSES.join(',')})`);

      if (error) throw error;
      return count ?? 0;
    },
    // RLS de `maintenance_requests` restringe select a admin/comercial/
    // administrativo (`0039_rls_maintenance_requests.sql`) -- sem isso,
    // cliente/investidor disparariam a query só para receber "permission
    // denied" a cada carregamento da sidebar.
    enabled: canReadMaintenance,
  });

  return {
    crm: 0,
    finance: 0,
    maintenance: maintenanceCount ?? 0,
    inspections: 0,
    units: 0,
  };
}
