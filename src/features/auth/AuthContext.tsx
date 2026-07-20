import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { mapAuthError } from '@/features/auth/errors';
import type { TenantRole } from '@/features/auth/types';
import { decodeJwt } from '@/lib/jwt';
import { supabase } from '@/lib/supabase';

interface AuthActionResult {
  error: string | null;
}

interface SignUpResult extends AuthActionResult {
  /**
   * true quando o Supabase exige confirmação de e-mail antes de liberar uma
   * sessão (signUp() retorna sem `session` nesse caso) — o frontend precisa
   * decidir se segue para o passo 2 do onboarding (já autenticado) ou pede
   * para o usuário confirmar o e-mail primeiro.
   */
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function claimsFromSession(session: Session | null): { tenantId: string | null; tenantRole: TenantRole | null } {
  if (!session?.access_token) {
    return { tenantId: null, tenantRole: null };
  }

  const payload = decodeJwt(session.access_token);
  return {
    tenantId: payload?.tenant_id ?? null,
    tenantRole: (payload?.tenant_role as TenantRole | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    // Mantém o contexto sincronizado em todo evento de auth (login, logout,
    // e principalmente TOKEN_REFRESHED — é o que refreshSession() dispara
    // depois de create_tenant_with_admin, quando o JWT novo já traz
    // tenant_id/tenant_role).
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setIsLoading(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthActionResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: mapAuthError(error.message) };
    }
    return { error: null };
  }

  async function signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { error: mapAuthError(error.message), needsEmailConfirmation: false };
    }
    return { error: null, needsEmailConfirmation: !data.session };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const { tenantId, tenantRole } = claimsFromSession(session);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    tenantId,
    tenantRole,
    isLoading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }
  return context;
}
