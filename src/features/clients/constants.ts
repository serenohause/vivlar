import type { DealSalesStage } from '@/features/clients/types';

/** Formata CPF (11 dígitos) como `000.000.000-00` — mesma função de `Clients.jsx`/`ClientDetail.jsx` originais. */
export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Rótulo de exibição do estágio comercial — só para a prévia de
 * negociações do cliente (`ClientDealPreview`). Tradução de
 * `original-project/src/components/shared/StatusBadge.jsx`
 * (`SalesStatusBadge`); o módulo de Deals (próxima tarefa do CRM) vai
 * herdar/expandir isso com cores e badge próprios quando o Kanban existir.
 */
export const DEAL_SALES_STAGE_LABELS: Record<DealSalesStage, string> = {
  lead: 'Lead',
  qualificado: 'Qualificado',
  reservado: 'Reservado',
  proposta: 'Proposta',
  vendido: 'Vendido',
  distratado: 'Distratado',
  perdido: 'Perdido',
};
