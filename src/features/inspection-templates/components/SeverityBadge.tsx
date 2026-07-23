import { Badge } from '@/components/ui/badge';
import { SEVERITY_CONFIG } from '@/features/inspection-templates/constants';
import type { InspectionSeverity } from '@/features/inspection-templates/types';

/** Badge de severidade padrão de um item de checklist — tradução do `<Badge>` inline em `TemplateDetail.jsx` (`item.severity_default === "Crítica" ? "destructive" : ...`). */
export function SeverityBadge({ severity }: { severity: InspectionSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  return <Badge variant={config.badgeVariant}>{config.label}</Badge>;
}
