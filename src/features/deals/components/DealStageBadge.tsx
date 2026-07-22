import { Badge } from '@/components/ui/badge';
import { SALES_STAGE_CONFIG } from '@/features/deals/constants';
import type { DealSalesStage } from '@/features/deals/types';
import { cn } from '@/lib/utils';

interface DealStageBadgeProps {
  stage: DealSalesStage;
  size?: 'default' | 'sm';
  className?: string;
}

/** Tradução de `SalesStatusBadge` em `original-project/src/components/shared/StatusBadge.jsx`. */
export function DealStageBadge({ stage, size = 'default', className }: DealStageBadgeProps) {
  const config = SALES_STAGE_CONFIG[stage];
  return (
    <Badge className={cn(config.color, 'text-white', size === 'sm' && 'px-2 py-0.5 text-xs', className)}>
      {config.label}
    </Badge>
  );
}
