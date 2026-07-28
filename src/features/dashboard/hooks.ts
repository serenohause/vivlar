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
   * nunca exibido) — confirmado lendo `NavigationBadges.jsx` do original:
   * o hook nunca retorna uma chave `units`. Mantido zerado aqui, fiel a
   * essa mesma ausência (não é débito nosso, é assim no original).
   */
  units: number;
}

/**
 * No app original (`components/shared/NavigationBadges.jsx`), este hook
 * contava registros reais via `base44.entities.X.list()` (deals parados
 * há mais de 7 dias, parcelas em atraso, manutenções abertas, vistorias
 * pendentes). Os 4 contadores agora são todos reais, cada um uma query de
 * `count: 'exact', head: true` independente (mais barata que carregar a
 * lista inteira toda vez que a sidebar renderiza, em toda página do app) —
 * mesmo padrão já usado por `maintenance` antes desta leva.
 *
 * `maintenance`: chamados não excluídos com status diferente de
 * `resolvido`/`cancelado` (`MAINTENANCE_TERMINAL_STATUSES`) — tradução do
 * critério do original (`status !== "CONCLUIDA"`), corrigido aqui: o
 * original filtrava por um status `"CONCLUIDA"` que não existe em
 * `STATUS_CONFIG` (só `RESOLVIDO`/`CANCELADO` são terminais) — bug legado
 * do original, não reproduzido aqui.
 *
 * `crm`: negócios não excluídos, fora de `vendido`/`perdido`/`distratado`,
 * com `last_activity_date` (ou `created_at` se nunca houve atividade) há
 * mais de 7 dias — mesmo critério do original, e o mesmo campo
 * `last_activity_date` já confirmado existente ao construir `CriticalAlerts`
 * (bloco do Dashboard). Filtrado via `.lt('last_activity_date', cutoff)` OU
 * (`last_activity_date is null` E `created_at < cutoff`) -- 2 queries de
 * contagem somadas, já que PostgREST não expressa OR entre 2 colunas
 * diferentes com fallback num único `.or()` de forma limpa aqui.
 *
 * `finance`: parcelas não excluídas, não `cancelado`, com `status =
 * 'em_atraso'` -- diferente do original (`computeInstallmentComputedStatus`
 * calculava "ATRASADO" a partir de `vencimento < hoje` no client, sem
 * checar o campo `status` persistido), aqui `em_atraso` já É o status
 * persistido (não computado -- ver `0020_payment_installments.sql`), então
 * a contagem lê o campo direto, sem recalcular no client.
 *
 * `inspections`: vistorias não excluídas com `status in
 * ('rascunho', 'em_vistoria')` — mesmo critério do original.
 */
export function useNavigationBadges(): NavigationBadges {
  const { tenantRole } = useAuth();
  const canReadTenantTeamData = tenantRole === 'admin' || tenantRole === 'comercial' || tenantRole === 'administrativo';

  // RLS de deals/payment_installments/maintenance_requests/inspections
  // restringe select a admin/comercial/administrativo -- sem o `enabled`
  // abaixo, cliente/investidor disparariam essas 4 queries só para
  // receber "permission denied" a cada carregamento da sidebar.

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
    enabled: canReadTenantTeamData,
  });

  const { data: crmCount } = useQuery({
    queryKey: ['navigation-badges', 'crm'],
    queryFn: async (): Promise<number> => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [withActivity, withoutActivity] = await Promise.all([
        supabase
          .from('deals')
          .select('*', { count: 'exact', head: true })
          .eq('is_deleted', false)
          .filter('sales_stage', 'not.in', '(vendido,perdido,distratado)')
          .lt('last_activity_date', cutoff),
        supabase
          .from('deals')
          .select('*', { count: 'exact', head: true })
          .eq('is_deleted', false)
          .filter('sales_stage', 'not.in', '(vendido,perdido,distratado)')
          .is('last_activity_date', null)
          .lt('created_at', cutoff),
      ]);

      if (withActivity.error) throw withActivity.error;
      if (withoutActivity.error) throw withoutActivity.error;
      return (withActivity.count ?? 0) + (withoutActivity.count ?? 0);
    },
    enabled: canReadTenantTeamData,
  });

  const { data: financeCount } = useQuery({
    queryKey: ['navigation-badges', 'finance'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('payment_installments')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .eq('status', 'em_atraso');

      if (error) throw error;
      return count ?? 0;
    },
    enabled: canReadTenantTeamData,
  });

  const { data: inspectionsCount } = useQuery({
    queryKey: ['navigation-badges', 'inspections'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('inspections')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .in('status', ['rascunho', 'em_vistoria']);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: canReadTenantTeamData,
  });

  return {
    crm: crmCount ?? 0,
    finance: financeCount ?? 0,
    maintenance: maintenanceCount ?? 0,
    inspections: inspectionsCount ?? 0,
    units: 0,
  };
}
