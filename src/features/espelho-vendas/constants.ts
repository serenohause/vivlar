import type { UnitStatus } from '@/features/units/types';

/**
 * Tradução 1:1 de `STATUS_COLORS`/`STATUS_LABELS` em
 * `ImplantacaoInterativa.jsx`/`UnitModal.jsx` (original), só trocando as
 * chaves maiúsculas (`DISPONIVEL`) pelo enum real do banco (`unit_status`,
 * minúsculo, ver `features/units/types.ts`). Cores em classe Tailwind (token
 * `espelho-*` do `@theme`), não mais hex inline — cada componente usa
 * `STATUS_BG_CLASS`/`STATUS_TEXT_CLASS` em vez de `style={{ background }}`.
 */
export const STATUS_LABELS: Record<UnitStatus, string> = {
  disponivel: 'Disponível',
  reservada: 'Reservada',
  vendida: 'Vendida',
  bloqueada: 'Bloqueada',
};

export const STATUS_BG_CLASS: Record<UnitStatus, string> = {
  disponivel: 'bg-espelho-orange',
  reservada: 'bg-espelho-sand',
  vendida: 'bg-espelho-navy',
  bloqueada: 'bg-espelho-gray',
};

export const STATUS_DOT_HEX: Record<UnitStatus, string> = {
  disponivel: '#F96117',
  reservada: '#DFDBCA',
  vendida: '#002E50',
  bloqueada: '#8E8B82',
};

export const IMPLANTACAO_FILTERS: Array<'todas' | UnitStatus> = ['todas', 'disponivel', 'reservada', 'vendida'];

/**
 * Formatação de moeda fiel ao original (`v.toLocaleString("pt-BR", {
 * style: "currency", currency: "BRL", maximumFractionDigits: 0 })`, ver
 * `EspelhoHero.jsx`/`UnitModal.jsx`) — sem centavos, retorna `"—"` para
 * `null`/`undefined` (o próprio original usa esse fallback em vários
 * pontos).
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
