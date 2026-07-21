import type { TerrainStatus } from '@/features/terrains/types';

/**
 * Tradução 1:1 de `terrainStatusConfig` em `original-project/src/pages/Terrains.jsx`
 * e `TerrainDetail.jsx`, só trocando as chaves para o enum real do banco
 * (`terrain_status`, ver 0009_terrains.sql) em vez das chaves em português
 * maiúsculo com acento do original.
 */
export const TERRAIN_STATUS_CONFIG: Record<TerrainStatus, { label: string; color: string }> = {
  em_prospeccao: { label: 'Em Prospecção', color: 'bg-blue-100 text-blue-800' },
  em_negociacao: { label: 'Em Negociação', color: 'bg-amber-100 text-amber-800' },
  adquirido: { label: 'Adquirido', color: 'bg-green-100 text-green-800' },
  descartado: { label: 'Descartado', color: 'bg-red-100 text-red-800' },
  transformado_projeto: { label: 'Transformado em Projeto', color: 'bg-purple-100 text-purple-800' },
};

export const TERRAIN_STATUS_OPTIONS = Object.entries(TERRAIN_STATUS_CONFIG) as [
  TerrainStatus,
  { label: string; color: string },
][];

/**
 * `forma_aquisicao` é `text` livre no banco (não enum — ver comentário em
 * 0009_terrains.sql), mas o `<Select>` do formulário replica as mesmas
 * opções do original.
 */
export const FORMA_AQUISICAO_OPTIONS = [
  { value: 'À_VISTA', label: 'À Vista' },
  { value: 'PARCELADO', label: 'Parcelado' },
  { value: 'PERMUTA', label: 'Permuta' },
  { value: 'PARCERIA', label: 'Parceria' },
  { value: 'OUTRO', label: 'Outro' },
];

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}
