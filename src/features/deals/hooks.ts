import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import { dealActivitiesQueryKey, dealTransitionsQueryKey } from '@/features/deals/activities-hooks';
import type { DealMutationPayload } from '@/features/deals/schemas';
import { UNIT_STATUS_BY_SALES_STAGE } from '@/features/deals/constants';
import type { Deal, DealSalesStage } from '@/features/deals/types';
import { invalidateUnitsQueries, updateUnitStatus } from '@/features/units/hooks';
import { supabase } from '@/lib/supabase';

const DEALS_QUERY_KEY = ['deals'] as const;

function dealQueryKey(id: string) {
  return ['deal', id] as const;
}

/** Lista de negociações do tenant (RLS já restringe a admin/comercial/administrativo), excluindo soft-deleted. */
export function useDeals() {
  return useQuery({
    queryKey: DEALS_QUERY_KEY,
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: dealQueryKey(id ?? ''),
    queryFn: async (): Promise<Deal> => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

const DUPLICATE_ACTIVE_DEAL_MESSAGE =
  'Esta unidade já possui um negócio ativo. Altere o estágio ou exclua o negócio existente antes de criar um novo para ela.';

/**
 * `23505` = `unique_violation` do Postgres — dispara aqui quando o insert
 * bate no índice único parcial `deals_tenant_id_unit_id_active_uidx` (1
 * negócio ativo por unidade, ver 0014_deals.sql). Traduz para uma mensagem
 * amigável em vez do erro cru do banco chegar na tela.
 */
function mapDealError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error(DUPLICATE_ACTIVE_DEAL_MESSAGE);
  }
  return new Error(error.message);
}

/**
 * Cria negócio — fiel ao dialog "Nova Oportunidade" de
 * `original-project/src/pages/CRM.jsx`, sem o cálculo automático de
 * comissão/criação de `Commission`/convite de usuário cliente que o
 * original fazia dentro desta mesma mutation quando `sales_stage ===
 * "VENDIDO"` (fora de escopo desta leva — ver relatório final).
 */
export function useCreateDeal() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: DealMutationPayload): Promise<Deal> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('deals')
        .insert({
          ...input,
          tenant_id: tenantId,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw mapDealError(error);
      return data;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: DEALS_QUERY_KEY });
      if (deal.unit_id) invalidateUnitsQueries(queryClient, deal.unit_id);
    },
  });
}

interface UpdateDealStageInput {
  /** Negócio corrente completo (não só o id) — a mutation precisa de `sales_stage`/`unit_id`/`client_id` atuais para decidir o reflexo em `units.status` e o `from_status` do log de transição. */
  deal: Deal;
  toStage: DealSalesStage;
  /** Observação livre — "Motivo da Perda" quando `toStage === 'perdido'`, nota geral nos demais casos (fiel a `DealDetail.jsx`). */
  note?: string;
}

/**
 * Muda o estágio comercial de um negócio — usada tanto pelo Kanban
 * (arraste/menu "Mover para", `CRMPage`) quanto pelo diálogo "Alterar
 * Estágio" de `DealDetailPage`. Diferente do resto do módulo (que segue o
 * padrão `useUpdateX(id)`, id fixo por instância do hook), este recebe o
 * negócio inteiro em cada `mutate` — o Kanban precisa mudar o estágio de
 * qualquer card da lista, não um id fixo por render.
 *
 * Fiel a `original-project/src/pages/CRM.jsx` (`updateStageMutation`,
 * linhas ~310-423) e `DealDetail.jsx` (`handleStageChange`): reflete
 * `units.status` (via `UNIT_STATUS_BY_SALES_STAGE`), grava
 * `status_transitions` (`transition_type: 'comercial'`) e, ao marcar como
 * vendido, registra uma `activities` — substituindo a `Notification`/
 * criação de `Commission`/convite de usuário cliente que o original fazia
 * neste mesmo ponto (todas fora de escopo desta leva, ver relatório final).
 */
export function useUpdateDealStage() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ deal, toStage, note }: UpdateDealStageInput): Promise<Deal> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const fromStage = deal.sales_stage;
      const isExit = toStage === 'perdido' || toStage === 'distratado';
      const trimmedNote = note?.trim() || null;

      const updatePayload: Record<string, unknown> = {
        sales_stage: toStage,
        is_active: !isExit,
        updated_by_user_id: user?.id ?? null,
      };
      if (toStage === 'vendido') {
        updatePayload.sold_at = new Date().toISOString();
      }
      if (toStage === 'perdido') {
        updatePayload.lost_reason = trimmedNote;
      }
      if (toStage === 'distratado') {
        updatePayload.distrato_at = new Date().toISOString();
        updatePayload.distrato_by_user_id = user?.id ?? null;
        updatePayload.distrato_reason = trimmedNote;
      }

      const { data: updatedDeal, error: updateError } = await supabase
        .from('deals')
        .update(updatePayload)
        .eq('id', deal.id)
        .select()
        .single();
      if (updateError) throw updateError;

      if (deal.unit_id) {
        await updateUnitStatus(deal.unit_id, UNIT_STATUS_BY_SALES_STAGE[toStage], user?.id ?? null);
      }

      const { error: transitionError } = await supabase.from('status_transitions').insert({
        tenant_id: tenantId,
        unit_id: deal.unit_id,
        deal_id: deal.id,
        from_status: fromStage,
        to_status: toStage,
        transition_type: 'comercial',
        note: trimmedNote,
        created_by_user_id: user?.id ?? null,
      });
      if (transitionError) throw transitionError;

      if (toStage === 'vendido') {
        const { error: activityError } = await supabase.from('activities').insert({
          tenant_id: tenantId,
          title: 'Negócio marcado como vendido',
          type: 'outro',
          status: 'concluida',
          description: trimmedNote,
          deal_id: deal.id,
          client_id: deal.client_id,
          unit_id: deal.unit_id,
          created_by_user_id: user?.id ?? null,
        });
        if (activityError) throw activityError;
      }

      return updatedDeal;
    },
    onSuccess: (updatedDeal) => {
      queryClient.invalidateQueries({ queryKey: DEALS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: dealQueryKey(updatedDeal.id) });
      queryClient.invalidateQueries({ queryKey: dealTransitionsQueryKey(updatedDeal.id) });
      if (updatedDeal.sales_stage === 'vendido') {
        queryClient.invalidateQueries({ queryKey: dealActivitiesQueryKey(updatedDeal.id) });
      }
      if (updatedDeal.unit_id) invalidateUnitsQueries(queryClient, updatedDeal.unit_id);
    },
  });
}

/**
 * Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do
 * sistema — sem policy de DELETE na RLS. Fiel a `CRM.jsx` (`deleteMutation`):
 * libera a unidade de volta para "disponível", sem cancelar `Commission`
 * (tabela não existe neste schema).
 */
export function useSoftDeleteDeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (deal: Deal): Promise<void> => {
      const { error } = await supabase
        .from('deals')
        .update({
          is_deleted: true,
          is_active: false,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', deal.id);

      if (error) throw error;

      if (deal.unit_id) {
        await updateUnitStatus(deal.unit_id, 'disponivel', user?.id ?? null);
      }
    },
    onSuccess: (_data, deal) => {
      queryClient.invalidateQueries({ queryKey: DEALS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: dealQueryKey(deal.id) });
      if (deal.unit_id) invalidateUnitsQueries(queryClient, deal.unit_id);
    },
  });
}
