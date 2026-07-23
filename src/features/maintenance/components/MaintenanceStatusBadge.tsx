import { Badge } from '@/components/ui/badge';
import { MAINTENANCE_STATUS_CONFIG } from '@/features/maintenance/constants';
import type { MaintenanceStatus } from '@/features/maintenance/types';

/** Badge de status do chamado — tradução de `STATUS_CONFIG` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`). */
export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const config = MAINTENANCE_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
