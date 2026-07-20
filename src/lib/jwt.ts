/**
 * Decoder mínimo de JWT (payload apenas, sem validação de assinatura).
 *
 * Uso client-side exclusivo para ler custom claims (tenant_id, tenant_role)
 * que o Auth Hook do Supabase injeta na RAIZ do access token — o
 * supabase-js não expõe esses claims em `session.user` automaticamente. A
 * validação de assinatura já é feita pelo Supabase/PostgREST no backend a
 * cada requisição; aqui só precisamos ler o conteúdo para refletir estado
 * na UI.
 */
export interface JwtPayload {
  tenant_id?: string;
  tenant_role?: string;
  [claim: string]: unknown;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export function decodeJwt(token: string): JwtPayload | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtPayload;
  } catch {
    return null;
  }
}
