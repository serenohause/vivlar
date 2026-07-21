import { Badge } from '@/components/ui/badge';
import { ADMIN_STATUS_CONFIG } from '@/features/units/constants';
import type { UnitAdminStatus } from '@/features/units/types';

/** `status` nulo (unidade ainda não entrou no pipeline) renderiza um badge neutro "—", fiel ao original. */
export function UnitAdminStatusBadge({ status }: { status: UnitAdminStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
  }

  const config = ADMIN_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
