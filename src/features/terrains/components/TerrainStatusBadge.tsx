import { Badge } from '@/components/ui/badge';
import { TERRAIN_STATUS_CONFIG } from '@/features/terrains/constants';
import type { TerrainStatus } from '@/features/terrains/types';

export function TerrainStatusBadge({ status }: { status: TerrainStatus }) {
  const config = TERRAIN_STATUS_CONFIG[status];
  return <Badge className={config.color}>{config.label}</Badge>;
}
