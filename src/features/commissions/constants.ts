import { Calendar, CheckCircle2, Clock, Gift, Minus, TrendingUp, XCircle, type LucideIcon } from 'lucide-react';

import type { CommissionAdjustmentType, CommissionStatus } from '@/features/commissions/types';

/**
 * Tradução 1:1 de `STATUS_CONFIG` em `original-project/src/pages/Commissions.jsx`/
 * `src/pages/CommissionDetail.jsx` — cores/ícone do badge de status da
 * comissão. Chaves trocadas para o enum real (`commission_status`,
 * A_PAGAR/AGENDADO/PAGO/CANCELADO -> a_pagar/agendado/pago/cancelado).
 */
export const COMMISSION_STATUS_CONFIG: Record<CommissionStatus, { label: string; color: string; icon: LucideIcon }> = {
  a_pagar: { label: 'A Pagar', color: 'bg-amber-500', icon: Clock },
  agendado: { label: 'Agendado', color: 'bg-blue-500', icon: Calendar },
  pago: { label: 'Pago', color: 'bg-green-600', icon: CheckCircle2 },
  cancelado: { label: 'Cancelado', color: 'bg-red-500', icon: XCircle },
};

/**
 * Tradução 1:1 de `ADJUSTMENT_CONFIG` em `CommissionDetail.jsx`. `sign`
 * decide se o ajuste soma (+1) ou subtrai (-1) do valor base da comissão —
 * `commission_adjustments.amount` no banco é sempre um valor absoluto (ver
 * comentário em `types.ts`), o sinal só existe na aplicação.
 */
export const COMMISSION_ADJUSTMENT_CONFIG: Record<CommissionAdjustmentType, { label: string; color: string; icon: LucideIcon; sign: 1 | -1 }> = {
  desconto: { label: 'Desconto', color: 'text-red-600', icon: Minus, sign: -1 },
  acrescimo: { label: 'Acréscimo', color: 'text-green-600', icon: TrendingUp, sign: 1 },
  bonus: { label: 'Bônus', color: 'text-blue-600', icon: Gift, sign: 1 },
};

/**
 * Opções do `<Select>` "Método de Pagamento" do dialog "Registrar
 * Pagamento"/"Editar Pagamento" de `CommissionDetail.jsx` — fiel ao
 * original (valores fixos gravados como texto livre, ver comentário em
 * `commission_payments.payment_method` em `types.ts`).
 */
export const COMMISSION_PAYMENT_METHOD_OPTIONS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'TED', label: 'TED' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

/** Mesma formatação de `formatCurrency` em `Commissions.jsx`/`CommissionDetail.jsx` — "R$ 0,00" para valor vazio. */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
