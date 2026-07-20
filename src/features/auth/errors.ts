/**
 * Traduz mensagens de erro do Supabase Auth para algo amigável em
 * português. `message.includes(...)` porque o supabase-js não expõe um
 * enum estável de códigos de erro de auth em todas as versões — o texto em
 * inglês é o contrato mais confiável disponível hoje.
 */
export function mapAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (message.includes('User already registered')) {
    return 'Este e-mail já está cadastrado. Tente entrar.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  }
  if (message.includes('Password should be at least')) {
    return 'A senha precisa ter no mínimo 6 caracteres.';
  }
  return message;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function isPostgrestLikeError(error: unknown): error is PostgrestLikeError {
  return typeof error === 'object' && error !== null && ('code' in error || 'message' in error);
}

/**
 * Traduz erros da RPC create_tenant_with_admin. A função já levanta
 * mensagens em português para nome/slug inválidos (ver
 * 0005_create_tenant_rpc.sql) — só o 23505 (unique_violation do slug)
 * precisa de tradução aqui, porque a mensagem crua do Postgres para essa
 * constraint não é apresentável ao usuário final.
 */
export function mapCreateTenantError(error: unknown): string {
  if (isPostgrestLikeError(error)) {
    if (error.code === '23505') {
      return 'Esse identificador já está em uso, escolha outro.';
    }
    if (error.message) {
      return error.message;
    }
  }
  return 'Não foi possível criar a empresa. Tente novamente.';
}
