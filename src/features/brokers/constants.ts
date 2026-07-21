import type { BrokerType } from '@/features/brokers/types';

/** Tradução do `<Select>` de tipo de corretor de `Brokers.jsx` original (`AUTONOMO`/`IMOBILIARIA`). */
export const BROKER_TYPE_LABELS: Record<BrokerType, string> = {
  autonomo: 'Autônomo',
  imobiliaria: 'Vinculado à Imobiliária',
};

/** Formata CPF (11 dígitos) como `000.000.000-00` — mesma função de `features/clients/constants.ts`. */
export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

/** `commission_rate` é armazenado como fração decimal (ex: 0.05) — exibido como percentual (ex: "5.0%"), fiel ao original. */
export function formatCommissionRate(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}
