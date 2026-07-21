/**
 * Tradução 1:1 das colunas de `units` (ver `supabase/migrations/0008_units.sql`).
 *
 * `active_deal_id` do original PROPOSITALMENTE não existe aqui (depende de
 * `deals`, CRM futuro — ver comentário na própria migration). As abas de
 * financeiro, vistoria, documentos e timeline de `original-project/src/pages/UnitDetail.jsx`
 * também ficam fora — dependem de tabelas que ainda não existem.
 */
export type UnitStatus = 'disponivel' | 'reservada' | 'vendida' | 'bloqueada';

/**
 * Pipeline administrativo/documental MCMV. Nullable: unidade recém-criada
 * ainda não entrou no pipeline (sem default no banco, ver 0008_units.sql).
 */
export type UnitAdminStatus =
  | 'laudo_engenharia'
  | 'em_conformidade'
  | 'cliente_conforme'
  | 'contrato_caixa'
  | 'cartorio'
  | 'registro_pago'
  | 'registrado'
  | 'entrega_casa'
  | 'entregue'
  | 'distrato';

export interface Unit {
  id: string;
  tenant_id: string;
  project_id: string;

  sku: string;
  bloco: string | null;
  tipologia: string | null;
  area_m2: number | null;
  area_lote_m2: number | null;
  quartos: number | null;
  vagas: number | null;
  suites: number | null;
  pavimentos: number | null;
  posicao_solar: string | null;

  list_price: number;
  status: UnitStatus;
  admin_status: UnitAdminStatus | null;
  notes: string | null;

  observacoes_publica: string | null;
  entrada_minima: number | null;
  subsidio_simulado: number | null;
  parcela_simulada: number | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
