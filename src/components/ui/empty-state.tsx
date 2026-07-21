import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: () => void;
  actionLabel?: string;
  className?: string;
}

/**
 * Tradução de `original-project/src/components/shared/EmptyState.jsx` —
 * usado no estado "vazio" de qualquer tela de lista (convenção de três
 * estados do CLAUDE.md: carregando / vazio / erro).
 */
export function EmptyState({ icon: Icon, title, description, action, actionLabel, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-4 max-w-sm text-muted-foreground">{description}</p>}
      {action && actionLabel && (
        <Button onClick={action} variant="brand">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
