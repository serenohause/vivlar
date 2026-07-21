import { Badge } from '@/components/ui/badge';
import { PROJECT_STATUS_CONFIG } from '@/features/projects/constants';
import type { ProjectStatus } from '@/features/projects/types';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = PROJECT_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
