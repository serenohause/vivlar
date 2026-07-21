import type { ProjectStatus } from '@/features/projects/types';

/**
 * Tradução de `PROJECT_STATUS_CONFIG` em `original-project/src/pages/Projects.jsx`,
 * trocando as chaves para o enum real do banco (`project_status`, ver
 * 0007_projects.sql). Cores em `bg-*-600`/`text-white` (sólidas), fiel ao
 * original — diferente do estilo pastel adotado em `TERRAIN_STATUS_CONFIG`
 * porque o original de Terrenos já usava pastel e o de Projetos já usava
 * sólido; cada um reproduz fielmente sua própria fonte.
 *
 * `totalmente_vendido` não tinha entrada no `PROJECT_STATUS_CONFIG`
 * original (só aparecia como filtro em `projectService.jsx`, "100_VENDIDO"
 * — provável lacuna do original, já que é um status válido do enum). Cor
 * nova (`bg-teal-600`), na mesma família sólida, para não colidir com
 * `em_vendas` (verde) nem `entregue` (roxo). `ENCERRADO` (legado) não
 * entra aqui — não é um valor do enum (ver comentário em 0007_projects.sql).
 */
export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  planejamento: { label: 'Planejamento', color: 'bg-slate-500' },
  em_obras: { label: 'Em Obras', color: 'bg-blue-600' },
  em_vendas: { label: 'Em Vendas', color: 'bg-green-600' },
  totalmente_vendido: { label: 'Totalmente Vendido', color: 'bg-teal-600' },
  entregue: { label: 'Entregue', color: 'bg-purple-600' },
};

export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS_CONFIG) as [
  ProjectStatus,
  { label: string; color: string },
][];

/**
 * Tradução de `ADMIN_STATUS_LABELS`/`ADMIN_STATUS_ORDER` em
 * `original-project/src/components/shared/Constants.jsx`, chaves trocadas
 * para o enum real (`unit_admin_status`, ver 0008_units.sql). Usado só pela
 * seção "Distribuição por Status" de `ProjectDetailPage` (prévia leve de
 * unidades, ver `ProjectUnitPreview` em `types.ts`) — quando a feature
 * `units` existir de verdade, considerar mover para lá.
 */
export const ADMIN_STATUS_LABELS: Record<string, string> = {
  laudo_engenharia: 'Laudo Engenharia',
  em_conformidade: 'Em Conformidade',
  cliente_conforme: 'Cliente Conforme',
  contrato_caixa: 'Contrato Caixa',
  cartorio: 'Cartório',
  registro_pago: 'Registro Pago',
  registrado: 'Registrado',
  entrega_casa: 'Entrega Casa',
  entregue: 'Entregue',
  distrato: 'Distrato',
};

export const ADMIN_STATUS_ORDER = [
  'laudo_engenharia',
  'em_conformidade',
  'cliente_conforme',
  'contrato_caixa',
  'cartorio',
  'registro_pago',
  'registrado',
  'entrega_casa',
  'entregue',
  'distrato',
] as const;

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}
