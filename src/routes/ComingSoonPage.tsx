import { Construction } from 'lucide-react';

import { PAGE_LABELS } from '@/features/dashboard/navigation';

interface ComingSoonPageProps {
  /** Nome de página original (PascalCase) — ver `src/lib/page-url.ts`. */
  pageName: string;
}

/**
 * Placeholder para qualquer item do menu que ainda não tem página real
 * construída — evita 404 em quase todos os links da sidebar enquanto os
 * módulos de dados (CRM, Financeiro, Vistorias, etc.) não existem.
 */
export function ComingSoonPage({ pageName }: ComingSoonPageProps) {
  const title = PAGE_LABELS[pageName]?.label ?? pageName;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-24 text-center">
      <Construction className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">Este módulo ainda não foi implementado.</p>
    </div>
  );
}
