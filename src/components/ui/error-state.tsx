import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Estado "erro" de tela de lista/detalhe (convenção de três estados do
 * CLAUDE.md) — cobre tanto falha de rede quanto acesso negado por RLS
 * (ex: usuário chegou direto pela URL sem papel autorizado). Mensagem
 * genérica de propósito, sem detalhes técnicos nem alarmismo.
 */
export function ErrorState({
  title = 'Não foi possível carregar os dados',
  description = 'Tente novamente em instantes. Se o problema continuar, verifique se você tem permissão para acessar esta área.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-4 max-w-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
