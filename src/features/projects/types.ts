/**
 * Tradução 1:1 das colunas de `projects` (ver `supabase/migrations/0007_projects.sql`).
 *
 * Campos de marketing público (`description_public`, `caracteristicas`,
 * `implantacao_svg_url`, `mcmv_faixa`, `entrada_min`, `valor_min`,
 * `valor_max`, `parcela_aprox`, `subsidio_aprox`, `whatsapp_principal`)
 * existem na tabela mas não aparecem aqui como campos editáveis pelo
 * formulário — confirmado lendo `original-project/src/pages/Projects.jsx`
 * e `ProjectDetail.jsx`, nenhum dos dois os edita; só são lidos pelo site
 * público "espelho de vendas" (`src/pages/EspelhoVendas.jsx`), módulo
 * futuro fora de escopo aqui. Ainda assim fazem parte do tipo, porque a
 * linha inteira da tabela é lida (`select('*')`).
 */
export type ProjectStatus = 'planejamento' | 'em_obras' | 'em_vendas' | 'totalmente_vendido' | 'entregue';

export interface Project {
  id: string;
  tenant_id: string;

  code: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  slug: string | null;
  total_units: number | null;
  status: ProjectStatus;
  start_sales_at: string | null;
  closed_at: string | null;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  notes: string | null;

  is_public: boolean;
  description_public: string | null;
  caracteristicas: string[] | null;
  implantacao_svg_url: string | null;
  mcmv_faixa: string | null;
  entrada_min: number | null;
  valor_min: number | null;
  valor_max: number | null;
  parcela_aprox: number | null;
  subsidio_aprox: number | null;
  reserva_horas: number;
  whatsapp_principal: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Prévia leve de uma unidade, só para as duas telas de Projetos (contagem
 * por status na lista e lista simples no detalhe) — o módulo de Unidades
 * ainda não tem UI própria (próxima tarefa), então isto não é o tipo `Unit`
 * completo, só as colunas de `units` (ver `supabase/migrations/0008_units.sql`)
 * usadas aqui. Quando a feature `units` existir, considerar substituir por
 * um tipo compartilhado de lá.
 */
export interface ProjectUnitPreview {
  id: string;
  project_id: string;
  sku: string;
  status: 'disponivel' | 'reservada' | 'vendida' | 'bloqueada';
  admin_status:
    | 'laudo_engenharia'
    | 'em_conformidade'
    | 'cliente_conforme'
    | 'contrato_caixa'
    | 'cartorio'
    | 'registro_pago'
    | 'registrado'
    | 'entrega_casa'
    | 'entregue'
    | 'distrato'
    | null;
  updated_at: string;
}
