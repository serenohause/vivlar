import type { BadgeProps } from '@/components/ui/badge';
import type { InspectionSeverity } from '@/features/inspection-templates/types';

/**
 * Tradução de `SEVERITIES`/uso em `TemplateDetail.jsx` (badge de severidade
 * do item: `Crítica` -> `destructive`, `Média` -> `default`, `Baixa` ->
 * `secondary`) para o enum real (`baixa`/`media`/`critica`).
 */
export const SEVERITY_CONFIG: Record<InspectionSeverity, { label: string; badgeVariant: BadgeProps['variant'] }> = {
  baixa: { label: 'Baixa', badgeVariant: 'secondary' },
  media: { label: 'Média', badgeVariant: 'default' },
  critica: { label: 'Crítica', badgeVariant: 'destructive' },
};

/**
 * Tradução 1:1 de `CATEGORIES` em `original-project/src/pages/TemplateDetail.jsx`
 * — lista fixa de sugestões usada no `<Select>` de categoria do item de
 * checklist e no filtro de categoria da lista de itens. `category` não é
 * enum no banco (texto livre, ver comentário em `0034_inspections.sql`),
 * mas o original só oferece estas 10 opções na UI — replicado 1:1 aqui.
 */
export const CATEGORY_SUGGESTIONS = [
  'Estrutura/Alvenaria',
  'Revestimentos',
  'Portas e Janelas',
  'Elétrica',
  'Hidrossanitária',
  'Pintura/Acabamentos',
  'Forro/Gesso',
  'Áreas Molhadas',
  'Segurança',
  'Limpeza Final',
] as const;
