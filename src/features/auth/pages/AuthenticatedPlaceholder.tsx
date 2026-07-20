import { Building2, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';
import { useTenant } from '@/features/auth/hooks';

/**
 * Placeholder temporário pós-login — substituído pelo shell com sidebar no
 * módulo de Dashboard. Só confirma que sessão + tenant + RLS estão de pé.
 */
export function AuthenticatedPlaceholder() {
  const { user, tenantId, signOut } = useAuth();
  const { data: tenant, isLoading, isError } = useTenant(tenantId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <span className="text-lg font-semibold tracking-tight text-brand dark:text-brand-dark">Vivlar</span>

        <div className="mt-8 space-y-1.5">
          <p className="text-lg font-medium text-foreground">Bem-vindo, {user?.email}</p>
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" />
            {isLoading && 'Carregando empresa...'}
            {isError && 'Não foi possível carregar sua empresa.'}
            {tenant ? tenant.name : null}
          </p>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Este é um placeholder temporário — o dashboard completo chega no próximo módulo.
        </p>

        <Button variant="outline" className="mt-8 w-full" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
