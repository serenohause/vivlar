import { Badge } from '@/components/ui/badge';
import { FINANCE_ACCOUNT_STATUS_CONFIG } from '@/features/finance/constants';
import type { FinanceAccountStatus } from '@/features/finance/types';

/** Tradução do badge de status da carteira em `original-project/src/pages/Finance.jsx` (`STATUS_COLORS`). */
export function FinanceAccountStatusBadge({ status }: { status: FinanceAccountStatus }) {
  const config = FINANCE_ACCOUNT_STATUS_CONFIG[status];
  return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
}
