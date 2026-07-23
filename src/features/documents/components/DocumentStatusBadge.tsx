import { Badge } from '@/components/ui/badge';
import { DOCUMENT_STATUS_CONFIG } from '@/features/documents/constants';
import type { DocumentStatus } from '@/features/documents/types';

/** Tradução de `DocStatusBadge` em `original-project/src/components/shared/StatusBadge.jsx`. */
export function DocumentStatusBadge({ status, size = 'default' }: { status: DocumentStatus; size?: 'default' | 'sm' }) {
  const config = DOCUMENT_STATUS_CONFIG[status];

  return <Badge className={`${config.color} text-white ${size === 'sm' ? 'px-2 py-0.5 text-xs' : ''}`}>{config.label}</Badge>;
}
