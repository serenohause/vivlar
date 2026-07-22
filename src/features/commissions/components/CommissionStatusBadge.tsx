import { Badge } from '@/components/ui/badge';
import { COMMISSION_STATUS_CONFIG } from '@/features/commissions/constants';
import type { CommissionStatus } from '@/features/commissions/types';

/** Tradução do badge de status da comissão em `Commissions.jsx`/`CommissionDetail.jsx` (`STATUS_CONFIG`, com ícone). */
export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const config = COMMISSION_STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge className={`${config.color} text-white`}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}
