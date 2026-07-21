/**
 * Tradução 1:1 das colunas de `real_estate_agencies` (ver
 * `supabase/migrations/0012_real_estate_agencies.sql`).
 */
export type AgencyStatus = 'ativa' | 'inativa';

export interface RealEstateAgency {
  id: string;
  tenant_id: string;

  name: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_person: string | null;

  commission_percentage: number;
  status: AgencyStatus;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
