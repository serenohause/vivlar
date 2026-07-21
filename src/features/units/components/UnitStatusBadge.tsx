import { Badge } from '@/components/ui/badge';
import { UNIT_STATUS_CONFIG } from '@/features/units/constants';
import type { UnitStatus } from '@/features/units/types';

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  const config = UNIT_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
