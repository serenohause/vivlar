import { TENANT_ROLE_VALUES, type TenantRole } from '@/features/auth/types';

/**
 * Rótulo de cada `tenant_role` — tela de Configurações (dialogs de
 * convite/edição de papel, badge da aba "Conta"). O original (`Settings.jsx`)
 * só tinha 3 perfis (`ADMINISTRADOR`/`USUARIO`/`CLIENTE`); aqui usamos os 5
 * papéis reais já existentes no projeto (`tenant_role`, ver
 * `0001_tenants_and_tenant_users.sql`).
 */
export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  administrativo: 'Administrativo',
  cliente: 'Cliente',
  investidor: 'Investidor',
};

export const TENANT_ROLE_OPTIONS = TENANT_ROLE_VALUES.map((role) => [role, TENANT_ROLE_LABELS[role]] as const);
