import type { FinanceAccountStatus, FinanceEventType, InstallmentStatus, InstallmentType } from '@/features/finance/types';

/**
 * Tradução 1:1 de `STATUS_COLORS` em `original-project/src/pages/Finance.jsx`
 * — cores usadas pelo badge de status da carteira financeira.
 */
export const FINANCE_ACCOUNT_STATUS_CONFIG: Record<FinanceAccountStatus, { label: string; color: string }> = {
  ativa: { label: 'Ativa', color: 'bg-green-500' },
  finalizada: { label: 'Finalizada', color: 'bg-blue-500' },
  cancelada: { label: 'Cancelada', color: 'bg-slate-500' },
};

/**
 * Tradução 1:1 de `STATUS_COLORS` em
 * `original-project/src/pages/FinanceDetail.jsx`/`src/components/unit/FinanceTabNew.jsx`
 * — cores usadas pelo badge de status da parcela. Chaves trocadas para o
 * enum real (`installment_status`, ver 0020_payment_installments.sql);
 * `PARCIAL`/`PREVISTO`/`EM_ATRASO` do original mapeiam 1:1 para
 * `parcial`/`previsto`/`em_atraso`.
 */
export const INSTALLMENT_STATUS_CONFIG: Record<InstallmentStatus, { label: string; color: string }> = {
  previsto: { label: 'Previsto', color: 'bg-slate-500' },
  parcial: { label: 'Parcial', color: 'bg-yellow-500' },
  pago: { label: 'Pago', color: 'bg-green-500' },
  em_atraso: { label: 'Em Atraso', color: 'bg-red-500' },
  cancelado: { label: 'Cancelado', color: 'bg-slate-400' },
};

/** Tradução 1:1 do `<Select>` de tipo em `FinanceDetail.jsx`/`FinanceTabNew.jsx`. */
export const INSTALLMENT_TYPE_LABELS: Record<InstallmentType, string> = {
  sinal: 'Sinal',
  entrada: 'Entrada',
  parcela: 'Parcela',
  reforco: 'Reforço',
  intermediaria: 'Intermediária',
  valor_financiado: 'Valor Financiado',
  subsidio: 'Subsídio',
  outros: 'Outros',
};

/** Tipos elegíveis para nova parcela, na ordem exibida no `<Select>` do original. */
export const INSTALLMENT_TYPES: InstallmentType[] = [
  'sinal',
  'entrada',
  'parcela',
  'reforco',
  'intermediaria',
  'valor_financiado',
  'subsidio',
  'outros',
];

/** Labels da timeline de eventos (aba "Timeline" de `FinanceDetail.jsx`). */
export const FINANCE_EVENT_TYPE_LABELS: Record<FinanceEventType, string> = {
  criacao_carteira: 'Criação da Carteira',
  criacao_parcela: 'Criação de Parcela',
  edicao_parcela: 'Edição de Parcela',
  cancelamento_parcela: 'Cancelamento de Parcela',
  baixa_pagamento: 'Baixa de Pagamento',
  status_financiamento: 'Status de Financiamento',
};

/**
 * Mesma formatação de `financeHelpers.jsx` (`formatCurrency`) — diferente de
 * `features/deals/constants.ts` (que usa "—" para valor vazio), o Financeiro
 * sempre mostra "R$ 0,00" em vez de traço, fiel ao original.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
