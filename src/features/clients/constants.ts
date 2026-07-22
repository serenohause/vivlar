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
