import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/features/auth/AuthContext';
import { NoTenantScreen } from '@/features/auth/components/NoTenantScreen';
import { useAcceptPendingInvite } from '@/features/auth/hooks';

export function ProtectedRoute() {
  const { user, tenantId, isLoading } = useAuth();
  const acceptPendingInvite = useAcceptPendingInvite();

  // Autenticado, sem tenant_id no claim ainda: antes de decidir que a
  // pessoa "não tem convite nenhum" (NoTenantScreen), tenta aceitar um
  // convite pendente automaticamente (`accept_pending_invite`, ver
  // 0063_rls_configuracoes.sql) — cobre quem se cadastrou pelo signup
  // normal depois de um admin já ter registrado o e-mail em
  // `tenant_invites`. `checkedForUserId` guarda o `user.id` para o qual a
  // checagem já rodou (não o booleano puro) para não pular a checagem de
  // novo usuário quando outra pessoa loga sem tenant logo em seguida
  // (mesmo componente, sem remount, ao longo da sessão do SPA).
  const [checkedForUserId, setCheckedForUserId] = useState<string | null>(null);
  const needsInviteCheck = !isLoading && Boolean(user) && !tenantId;
  const inviteCheckDone = checkedForUserId === (user?.id ?? null);

  useEffect(() => {
    if (!needsInviteCheck || inviteCheckDone || acceptPendingInvite.isPending) return;

    acceptPendingInvite.mutate(undefined, {
      onSettled: () => setCheckedForUserId(user?.id ?? null),
    });
    // Roda só quando entra/sai da condição "precisa checar" ou o usuário
    // muda — `acceptPendingInvite` (objeto de mutation novo a cada render)
    // fica de fora de propósito, senão dispararia em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsInviteCheck, inviteCheckDone, user?.id]);

  // Espera o estado de auth resolver antes de decidir qualquer coisa, para
  // não "piscar" a tela de login antes de confirmar que já existe sessão.
  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Autenticado, mas sem tenant_id no claim do JWT (0 ou 2+ vínculos ativos
  // — lacuna conhecida, ver docs/ARCHITECTURE.md) — só decide isso depois
  // de confirmar que também não havia convite pendente para aceitar
  // automaticamente (senão pisca "criar empresa" para quem tem convite).
  // Não redireciona sozinho: mostra a saída (criar empresa) direto nesta
  // tela.
  if (!tenantId) {
    if (!inviteCheckDone) {
      return <LoadingScreen />;
    }
    return <NoTenantScreen />;
  }

  return <Outlet />;
}
