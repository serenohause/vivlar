import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shell visual compartilhado pelas telas de auth (login, signup,
 * onboarding) — mesmo clima sóbrio/corporativo do Layout.jsx original:
 * fundo slate, logo "Vivlar" em text-brand, card branco de borda sutil.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-brand dark:text-brand-dark">Vivlar</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer ? <CardFooter className="flex-col items-stretch gap-2 border-t pt-4">{footer}</CardFooter> : null}
        </Card>
      </div>
    </div>
  );
}
