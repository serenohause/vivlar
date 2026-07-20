import { Navigate, Outlet } from 'react-router-dom';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/features/auth/AuthContext';
import { NoTenantScreen } from '@/features/auth/components/NoTenantScreen';

export function ProtectedRoute() {
  const { user, tenantId, isLoading } = useAuth();

  // Espera o estado de auth resolver antes de decidir qualquer coisa, para
  // não "piscar" a tela de login antes de confirmar que já existe sessão.
  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Autenticado, mas sem tenant_id no claim do JWT (0 ou 2+ vínculos ativos
  // — lacuna conhecida, ver docs/ARCHITECTURE.md). Não redireciona sozinho:
  // mostra a saída (criar empresa) direto nesta tela.
  if (!tenantId) {
    return <NoTenantScreen />;
  }

  return <Outlet />;
}
