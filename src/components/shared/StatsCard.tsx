import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

/**
 * Tradução de `original-project/src/components/shared/StatsCard.jsx` — KPI
 * genérico (título pequeno à esquerda, valor grande em negrito, ícone
 * colorido num box arredondado à direita). Sem o prop `trend` do original
 * (nenhuma tela do projeto novo tem dado de tendência/comparação com
 * período anterior ainda) — adicionar quando a primeira tela precisar.
 *
 * Usado por enquanto só nos KPIs de `MaintenanceListPage`. Outras telas
 * (ex: `ExecutiveKpis` do dashboard) ainda montam seu próprio card de KPI à
 * mão, com um layout parecido mas não idêntico — retrofitá-las para este
 * componente é uma decisão de consistência válida, mas fora do escopo
 * desta leva.
 */
export function StatsCard({
  title,
  value,
  icon: Icon,
  iconColor = 'text-brand',
  iconBg = 'bg-brand/10',
  className,
}: StatsCardProps) {
  return (
    <Card className={cn('border-0 shadow-sm transition-shadow hover:shadow-md', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
          {Icon && (
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', iconBg)}>
              <Icon className={cn('h-6 w-6', iconColor)} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
