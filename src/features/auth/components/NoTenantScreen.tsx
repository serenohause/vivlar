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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center dark:bg-slate-950">
      <Building2 className="h-10 w-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold text-foreground">Você ainda não pertence a nenhuma empresa</h2>
        <p className="mt-1 text-sm text-muted-foreground">Crie sua empresa para começar a usar o Vivlar.</p>
      </div>
      <Button asChild variant="brand">
        <Link to="/onboarding">Criar minha empresa</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void signOut()}>
        Sair
      </Button>
    </div>
  );
}
