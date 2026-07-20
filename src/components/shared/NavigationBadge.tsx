import { Badge } from '@/components/ui/badge';

interface NavigationBadgeProps {
  count: number;
  variant?: 'default' | 'warning' | 'danger';
}

const COLORS: Record<NonNullable<NavigationBadgeProps['variant']>, string> = {
  default: 'bg-blue-500',
  warning: 'bg-orange-500',
  danger: 'bg-red-500',
};

export function NavigationBadge({ count, variant = 'default' }: NavigationBadgeProps) {
  if (!count || count === 0) return null;

  return (
    <Badge className={`ml-auto ${COLORS[variant]} text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center`}>
      {count > 99 ? '99+' : count}
    </Badge>
  );
}
