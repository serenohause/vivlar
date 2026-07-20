import { Building2, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-brand dark:text-brand-dark">Vivlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-lg font-medium text-foreground">Bem-vindo, {user?.email}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" />
              {isLoading && 'Carregando empresa...'}
              {isError && 'Não foi possível carregar sua empresa.'}
              {tenant ? tenant.name : null}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Este é um placeholder temporário — o dashboard completo chega no próximo módulo.
          </p>
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
