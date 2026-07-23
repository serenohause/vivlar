import type {
  InvestmentContributionStatus,
  InvestmentContributionType,
  InvestmentReturnStatus,
  InvestmentReturnType,
  InvestorStatus,
  InvestorType,
} from '@/features/investors/types';

/** Tradução 1:1 do `<Select>` de tipo em `Investors.jsx` ("Pessoa Física"/"Pessoa Jurídica"). */
export const INVESTOR_TYPE_LABELS: Record<InvestorType, string> = {
  PF: 'Pessoa Física',
  PJ: 'Pessoa Jurídica',
};

/** Tradução 1:1 do badge de status de `Investors.jsx`/`InvestorDetail.jsx`. */
export const INVESTOR_STATUS_CONFIG: Record<InvestorStatus, { label: string; color: string }> = {
  ATIVO: { label: 'Ativo', color: 'bg-green-500' },
  INATIVO: { label: 'Inativo', color: 'bg-slate-400' },
};

/** Tradução 1:1 do `<Select>` de tipo em `InvestmentContributions.jsx`. */
export const CONTRIBUTION_TYPE_LABELS: Record<InvestmentContributionType, string> = {
  APORTE: 'Aporte',
  REFORCO: 'Reforço',
  AJUSTE: 'Ajuste',
};

/** Tradução 1:1 do badge de status de `InvestmentContributions.jsx`. */
export const CONTRIBUTION_STATUS_CONFIG: Record<InvestmentContributionStatus, { label: string; color: string }> = {
  PREVISTO: { label: 'Previsto', color: 'bg-yellow-500' },
  CONFIRMADO: { label: 'Confirmado', color: 'bg-green-500' },
};

/**
 * Tradução 1:1 de `returnTypeConfig`/`<Select>` de tipo em
 * `InvestmentReturns.jsx` — inclui a descrição ("Define quem recebe") usada
 * no formulário original.
 */
export const RETURN_TYPE_CONFIG: Record<InvestmentReturnType, { label: string; description: string; color: string }> = {
  PRINCIPAL: { label: 'Retorno de Aporte', description: 'Devolução do capital investido', color: 'bg-blue-500' },
  DIVIDENDO_INVESTIDOR: { label: 'Dividendos Investidor', description: 'Lucro distribuído ao investidor', color: 'bg-green-500' },
  DIVIDENDO_VIVLAR: { label: 'Dividendos Vivlar', description: 'Lucro da construtora', color: 'bg-amber-500' },
};

/** Tradução 1:1 do badge de status de `InvestmentReturns.jsx`. */
export const RETURN_STATUS_CONFIG: Record<InvestmentReturnStatus, { label: string; color: string }> = {
  PREVISTO: { label: 'Previsto', color: 'bg-yellow-500' },
  PAGO: { label: 'Pago', color: 'bg-green-500' },
};

/** Mesma formatação de `formatCurrency` já usada em `features/commissions/constants.ts`/`features/finance/constants.ts` — "R$ 0,00" para valor vazio. */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
