/**
 * Tradução 1:1 das colunas de `brokers` (ver `supabase/migrations/0013_brokers.sql`).
 */
export type BrokerType = 'autonomo' | 'imobiliaria';

export interface Broker {
  id: string;
  tenant_id: string;

  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;

  type: BrokerType;
  real_estate_agency_id: string | null;

  commission_rate: number;
  commission_split: number;
  is_active: boolean;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
