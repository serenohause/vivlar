/** Tradução 1:1 do enum `investor_type` (ver `supabase/migrations/0041_investors.sql`). */
export type InvestorType = 'PF' | 'PJ';

/** Tradução 1:1 do enum `investor_status`. */
export type InvestorStatus = 'ATIVO' | 'INATIVO';

/**
 * Tradução 1:1 das colunas de `investors` — cadastro de investidor externo
 * (PF/PJ) que aporta capital em projetos (`Investors.jsx`). Escopo desta
 * leva: só lado interno/admin, sem portal de autoatendimento (`user_id`
 * sempre `null` na prática).
 */
export interface Investor {
  id: string;
  tenant_id: string;

  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  tipo: InvestorType;
  status: InvestorStatus;
  observacoes: string | null;

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
 * Tradução 1:1 das colunas de `project_investors` — vínculo investidor↔
 * projeto (quanto aportou e seu percentual de participação no resultado).
 * ACHADO documentado em `0042_project_investors.sql`: nenhuma tela do
 * original cria este registro — só é lido. `LinkProjectDialog`
 * (`features/investors/components`) é a tela nova que resolve isso.
 */
export interface ProjectInvestor {
  id: string;
  tenant_id: string;

  project_id: string;
  investor_id: string;

  nome_exibicao: string;
  valor_aportado: number;
  percentual_participacao: number;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `investment_contribution_type` (ver `supabase/migrations/0043_investment_contributions.sql`). */
export type InvestmentContributionType = 'APORTE' | 'REFORCO' | 'AJUSTE';

/** Tradução 1:1 do enum `investment_contribution_status`. */
export type InvestmentContributionStatus = 'PREVISTO' | 'CONFIRMADO';

/**
 * Tradução 1:1 das colunas de `investment_contributions` — cada entrada de
 * capital em um projeto, de um investidor externo ou da própria construtora
 * (`investor_id` nulo). `comprovante_url`/`comprovante_nome` são texto/URL
 * simples, sem upload real de arquivo (mesmo padrão de
 * `payment_installments.comprovante_url`).
 */
export interface InvestmentContribution {
  id: string;
  tenant_id: string;

  project_id: string;
  investor_id: string | null;

  valor: number;
  data: string;

  tipo: InvestmentContributionType;
  status: InvestmentContributionStatus;

  observacoes: string | null;
  comprovante_url: string | null;
  comprovante_nome: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Tradução 1:1 do enum `investment_return_type` (ver `supabase/migrations/0044_investment_returns.sql`). */
export type InvestmentReturnType = 'PRINCIPAL' | 'DIVIDENDO_INVESTIDOR' | 'DIVIDENDO_VIVLAR';

/** Tradução 1:1 do enum `investment_return_status`. */
export type InvestmentReturnStatus = 'PREVISTO' | 'PAGO';

/**
 * Tradução 1:1 das colunas de `investment_returns` — retorno/dividendo
 * pago a um investidor (ou à própria construtora, `investor_id` nulo).
 * `return_type` é obrigatório desde o primeiro registro (sem os "retornos
 * legados" do original — não há dado legado nesta plataforma nova, ver
 * comentário na migration).
 */
export interface InvestmentReturn {
  id: string;
  tenant_id: string;

  project_id: string;
  investor_id: string | null;

  valor: number;
  data: string;

  return_type: InvestmentReturnType;
  status: InvestmentReturnStatus;

  observacoes: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
