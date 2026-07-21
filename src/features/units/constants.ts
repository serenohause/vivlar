import type { UnitAdminStatus, UnitStatus } from '@/features/units/types';

/**
 * Tradução 1:1 de `UNIT_STATUS_CONFIG` em `original-project/src/pages/Units.jsx`,
 * só trocando as chaves para o enum real do banco (`unit_status`, ver
 * 0008_units.sql) em vez das chaves em português maiúsculo do original.
 */
export const UNIT_STATUS_CONFIG: Record<UnitStatus, { label: string; color: string }> = {
  disponivel: { label: 'Disponível', color: 'bg-green-600' },
  reservada: { label: 'Reservada', color: 'bg-amber-500' },
  vendida: { label: 'Vendida', color: 'bg-blue-600' },
  bloqueada: { label: 'Bloqueada', color: 'bg-red-500' },
};

export const UNIT_STATUS_OPTIONS = Object.entries(UNIT_STATUS_CONFIG) as [
  UnitStatus,
  { label: string; color: string },
][];

/**
 * Tradução 1:1 de `ADMIN_STATUS_CONFIG` em
 * `original-project/src/components/shared/StatusBadge.jsx` (a versão
 * "canônica" do app original — a cópia local em `Units.jsx` usa cores
 * levemente diferentes para `CARTORIO`, provável divergência do próprio
 * original; ficamos com a de `StatusBadge.jsx` por ser a fonte reusada em
 * mais telas). Chaves trocadas para o enum real (`unit_admin_status`, ver
 * 0008_units.sql). `order`/`terminal` vêm do original e alimentam o
 * seletor de avançar estágio do pipeline (ver `UnitAdminStatusPipeline`).
 */
export const ADMIN_STATUS_CONFIG: Record<
  UnitAdminStatus,
  { label: string; color: string; order: number; terminal?: boolean }
> = {
  laudo_engenharia: { label: 'Laudo Engenharia', color: 'bg-slate-500', order: 1 },
  em_conformidade: { label: 'Em Conformidade', color: 'bg-blue-500', order: 2 },
  cliente_conforme: { label: 'Cliente Conforme', color: 'bg-cyan-500', order: 3 },
  contrato_caixa: { label: 'Contrato Caixa', color: 'bg-indigo-500', order: 4 },
  cartorio: { label: 'Cartório', color: 'bg-purple-500', order: 5 },
  registro_pago: { label: 'Registro Pago', color: 'bg-violet-500', order: 6 },
  registrado: { label: 'Registrado', color: 'bg-teal-500', order: 7 },
  entrega_casa: { label: 'Entrega Casa', color: 'bg-emerald-500', order: 8 },
  entregue: { label: 'Entregue', color: 'bg-green-600', order: 9, terminal: true },
  distrato: { label: 'Distrato', color: 'bg-red-600', order: 10, terminal: true },
};

/** Ordem do pipeline MCMV, do primeiro estágio ao último — mesma ordem de `ADMIN_STATUS_CONFIG[*].order`. */
export const ADMIN_STATUS_ORDER = (Object.entries(ADMIN_STATUS_CONFIG) as [UnitAdminStatus, { order: number }][])
  .sort((a, b) => a[1].order - b[1].order)
  .map(([status]) => status);

export const ADMIN_STATUS_OPTIONS = ADMIN_STATUS_ORDER.map(
  (status) => [status, ADMIN_STATUS_CONFIG[status]] as const
);

/**
 * Opções de tipologia — mesma lista fixa do `<Select>` de tipologia em
 * `original-project/src/pages/Units.jsx` (não é enum no banco, `tipologia`
 * é `text` livre, ver 0008_units.sql — segue o mesmo padrão de
 * `forma_aquisicao` em `terrains`).
 */
export const TIPOLOGIA_OPTIONS = [
  { value: '1Q', label: '1 Quarto' },
  { value: '2Q', label: '2 Quartos' },
  { value: '3Q', label: '3 Quartos' },
  { value: 'Cobertura', label: 'Cobertura' },
  { value: 'Casa', label: 'Casa' },
  { value: 'Apartamento', label: 'Apartamento' },
  { value: 'Outro', label: 'Outro' },
];

/**
 * Formatação de moeda fiel ao original (`unit.list_price.toLocaleString("pt-BR",
 * { minimumFractionDigits: 2 })`, ver `Units.jsx`) — com centavos, diferente
 * do `formatCurrency` de `terrains`/`projects` (sem casas decimais), porque
 * cada um reproduz fielmente sua própria fonte original.
 */
export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}
