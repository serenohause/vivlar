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
 * Estágio comercial do negócio (`deal_sales_stage`, ver
 * `supabase/migrations/0014_deals.sql`). Declarado aqui só para a prévia de
 * negociações do cliente (`ClientDealPreview` abaixo) — o módulo de Deals
 * (Kanban do CRM) ainda não existe e vai ganhar seu próprio `types.ts`
 * quando for construído; quando isso acontecer, este tipo some daqui e
 * passa a ser importado de lá.
 */
export type DealSalesStage = 'lead' | 'qualificado' | 'reservado' | 'proposta' | 'vendido' | 'distratado' | 'perdido';

/**
 * Prévia simples de uma negociação (`deals`) associada a um cliente — usada
 * só pela seção "Negociações" de `ClientDetailPage`, sem link para uma tela
 * de detalhe de negócio (não existe ainda, é a próxima tarefa do CRM). Só
 * os campos necessários para o resumo, mesma ideia de `ProjectUnitPreview`
 * em `features/projects/types.ts`.
 */
export interface ClientDealPreview {
  id: string;
  project_id: string;
  unit_id: string | null;
  sales_stage: DealSalesStage;
  expected_sale_value: number | null;
  sold_at: string | null;
  commission_value: number | null;
}
