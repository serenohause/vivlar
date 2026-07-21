/**
 * Tradução 1:1 das colunas de `terrains` (ver `supabase/migrations/0009_terrains.sql`).
 * Nomes de campo em snake_case ASCII (o original em `original-project/src/pages/Terrains.jsx`
 * usava chaves com acento, ex: `matrícula` — normalizado no schema e aqui).
 */
export type TerrainStatus = 'em_prospeccao' | 'em_negociacao' | 'adquirido' | 'descartado' | 'transformado_projeto';

export interface Terrain {
  id: string;
  tenant_id: string;

  code: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  area_m2: number;
  status: TerrainStatus;

  matricula: string | null;
  proprietario_atual: string | null;
  observacoes_legais: string | null;
  forma_aquisicao: string | null;

  valor_aquisicao: number | null;
  custos_itbi: number | null;
  custos_cartorio: number | null;
  custos_estudos: number | null;
  custos_corretagem: number | null;
  custos_outros: number | null;

  notas: string | null;

  latitude: number | null;
  longitude: number | null;
  location_updated_at: string | null;
  location_updated_by_user_id: string | null;

  projeto_origem_id: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
