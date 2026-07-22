import { Badge } from '@/components/ui/badge';
import { INSTALLMENT_STATUS_CONFIG } from '@/features/finance/constants';
import type { InstallmentStatus } from '@/features/finance/types';

/** Tradução do badge de status da parcela em `original-project/src/pages/FinanceDetail.jsx` (`STATUS_COLORS`). */
export function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  const config = INSTALLMENT_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
