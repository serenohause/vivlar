import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';

/**
 * Estado "autenticado, mas sem tenant ativo" — usuário passou pelo signUp
 * (ou foi criado de outra forma) mas nunca chegou a criar/ser convidado
 * para uma empresa. Fluxo de convite para tenant existente é lacuna
 * conhecida (ver docs/ARCHITECTURE.md); aqui garantimos que o usuário
 * sempre tenha uma saída.
 */
export function NoTenantScreen() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Building2 className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Você ainda não pertence a nenhuma empresa</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Crie sua empresa para começar a usar o Vivlar.</p>
      </div>
      <Button asChild variant="brand" className="w-full max-w-xs">
        <Link to="/onboarding">Criar minha empresa</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void signOut()}>
        Sair
      </Button>
    </div>
  );
}
