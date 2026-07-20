export type TenantRole = 'admin' | 'comercial' | 'administrativo' | 'cliente' | 'investidor';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
}
