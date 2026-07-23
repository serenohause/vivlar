import { Badge } from '@/components/ui/badge';
import { MAINTENANCE_PRIORITY_CONFIG } from '@/features/maintenance/constants';
import type { MaintenancePriority } from '@/features/maintenance/types';

/** Badge de prioridade do chamado — tradução de `PRIORITY_CONFIG` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`). */
export function MaintenancePriorityBadge({ priority }: { priority: MaintenancePriority }) {
  const config = MAINTENANCE_PRIORITY_CONFIG[priority];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
