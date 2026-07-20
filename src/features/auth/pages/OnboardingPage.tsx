import { Navigate, useNavigate } from 'react-router-dom';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/features/auth/AuthContext';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { CreateTenantForm } from '@/features/auth/components/CreateTenantForm';

/**
 * Rota separada que reaproveita o passo 2 do signup — destino do botão
 * "Criar minha empresa" em NoTenantScreen (usuário autenticado sem nenhum
 * tenant ativo).
 */
export function OnboardingPage() {
  const { user, tenantId, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (tenantId) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout title="Crie sua empresa" description="Você ainda não pertence a nenhuma empresa no Vivlar.">
      <CreateTenantForm onSuccess={() => navigate('/', { replace: true })} />
    </AuthLayout>
  );
}
