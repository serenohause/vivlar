import type { UnitStatus } from '@/features/units/types';

/**
 * Formato devolvido por `get_public_project(p_slug)` (ver
 * `supabase/migrations/0059_rls_espelho_vendas.sql`) — allow-list de campos
 * public-safe de `projects`, nunca `notes`/`total_construction_cost`/
 * `total_indirect_costs`/`tenant_id`. `null` cobre slug inexistente, projeto
 * privado (`is_public = false`) e deletado — os 3 casos, de propósito, sem
 * diferenciar motivo (mesmo comportamento do 404 genérico do original).
 */
export interface PublicProject {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  slug: string;
  total_units: number | null;
  status: string;
  description_public: string | null;
  caracteristicas: string[] | null;
  implantacao_svg_url: string | null;
  mcmv_faixa: string | null;
  entrada_min: number | null;
  valor_min: number | null;
  valor_max: number | null;
  parcela_aprox: number | null;
  subsidio_aprox: number | null;
  reserva_horas: number | null;
  whatsapp_principal: string | null;
}

/**
 * Formato devolvido por `get_public_units(p_project_id)` — allow-list de
 * campos public-safe de `units`, nunca `notes`/`admin_status`/`tenant_id`.
 */
export interface PublicUnit {
  id: string;
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
  list_price: number | null;
  status: UnitStatus;
  observacoes_publica: string | null;
  entrada_minima: number | null;
  subsidio_simulado: number | null;
  parcela_simulada: number | null;
}

/** Os 3 intents do `LeadForm.jsx` original — valores internos minúsculos (enum `public_lead_intent`, 0057), copy em português na UI. */
export type PublicLeadIntent = 'reserva' | 'interesse' | 'lista_espera';

/** Retorno de `create_public_lead` (intents `interesse`/`lista_espera`). */
export interface CreatePublicLeadResult {
  id: string;
  intent: PublicLeadIntent;
  status: string;
}

/** Retorno de `create_public_reservation` (intent `reserva`). */
export interface CreatePublicReservationResult {
  deal_id: string;
  client_id: string;
  unit_id: string;
  lead_id: string;
  reserva_expira_em: string;
  reserva_horas: number;
}
