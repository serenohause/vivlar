import { DOC_CATEGORY_ICONS, DOC_TYPES } from '@/features/documents/constants';
import type { DocumentType } from '@/features/documents/types';
import { cn } from '@/lib/utils';

/**
 * Círculo de ícone por categoria do tipo de documento — usado na coluna
 * "Documento" da tabela em vez do `FileText` fixo do original (ver
 * comentário em `DOC_CATEGORY_ICONS`, `features/documents/constants.ts`).
 */
export function DocumentTypeIcon({ docType, className }: { docType: DocumentType; className?: string }) {
  const category = DOC_TYPES[docType].category;
  const Icon = DOC_CATEGORY_ICONS[category];

  return (
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-muted', className)}>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
