import { Badge } from '@/components/ui/badge';
import { INSPECTION_STATUS_CONFIG } from '@/features/inspections/constants';
import type { InspectionStatus } from '@/features/inspections/types';

/** Badge de status da vistoria — tradução de `getStatusColor` (`Inspections.jsx`/`InspectionDetail.jsx`). */
export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const config = INSPECTION_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
