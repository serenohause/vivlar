import type { ReactNode } from 'react';

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shell visual compartilhado pelas telas de auth (login, signup,
 * onboarding) — clean e minimalista: sem card/borda/sombra, bastante
 * espaço em branco, conteúdo centralizado direto sobre o fundo.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <span className="text-lg font-semibold tracking-tight text-brand dark:text-brand-dark">Vivlar</span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>

        {children}

        {footer ? <div className="mt-8 text-center">{footer}</div> : null}
      </div>
    </div>
  );
}
