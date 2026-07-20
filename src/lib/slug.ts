/**
 * Gera um slug (letras minúsculas, números, hífen simples entre segmentos)
 * a partir de um texto livre. Usado como sugestão inicial e editável para
 * o identificador do tenant no onboarding — o formato precisa casar com a
 * regex validada no backend (`create_tenant_with_admin`).
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos/diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
