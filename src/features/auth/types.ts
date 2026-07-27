/**
 * Os 5 papéis de `tenant_role` (ver `supabase/migrations/0001_tenants_and_tenant_users.sql`).
 * Exportado também como array (`TENANT_ROLE_VALUES`) para alimentar
 * `z.enum(...)` em formulários que precisam validar/listar os 5 valores
 * (ex: dialog de convite/edição de papel em `features/settings`) sem
 * duplicar a lista em outro arquivo.
 */
export const TENANT_ROLE_VALUES = ['admin', 'comercial', 'administrativo', 'cliente', 'investidor'] as const;

export type TenantRole = (typeof TENANT_ROLE_VALUES)[number];

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}
