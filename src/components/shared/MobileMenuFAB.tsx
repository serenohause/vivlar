import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileMenuFABProps {
  onClick: () => void;
  className?: string;
}

export function MobileMenuFAB({ onClick, className }: MobileMenuFABProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      aria-label="Abrir menu"
      className={cn(
        'fixed z-40 lg:hidden',
        'w-14 h-14 rounded-full shadow-lg',
        'bg-brand hover:bg-brand/90 text-brand-foreground',
        'transition-all duration-200 ease-in-out',
        'active:scale-95',
        className
      )}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        right: '16px',
      }}
    >
      <Menu className="w-6 h-6" />
    </Button>
  );
}
