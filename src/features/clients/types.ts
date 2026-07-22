import type { DealSalesStage } from '@/features/deals/types';

/**
 * Tradução 1:1 das colunas de `clients` (ver `supabase/migrations/0011_clients.sql`).
 *
 * `user_id` (vínculo com portal do cliente, Supabase Auth) existe na tabela
 * mas não é lido/escrito por nenhuma tela desta leva — feature futura, ver
 * comentário da migration.
 */
export interface Client {
  id: string;
  tenant_id: string;

  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;

  user_id: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Prévia simples de uma negociação (`deals`) associada a um cliente — usada
 * só pela seção "Negociações" de `ClientDetailPage`. Só os campos
 * necessários para o resumo, mesma ideia de `ProjectUnitPreview` em
 * `features/projects/types.ts`. `broker_id` incluído para exibir o nome do
 * corretor (agora que `features/brokers` existe) e permitir o link para o
 * detalhe do negócio (`/crm/:id`, agora que `features/deals` existe).
 */
export interface ClientDealPreview {
  id: string;
  project_id: string;
  unit_id: string | null;
  broker_id: string | null;
  sales_stage: DealSalesStage;
  expected_sale_value: number | null;
  sold_at: string | null;
  commission_value: number | null;
}
