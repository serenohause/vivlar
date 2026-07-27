import type { TenantRole } from '@/features/auth/types';
import type { DocumentType } from '@/features/documents/types';
import type { UnitAdminStatus } from '@/features/units/types';

/** Tradução 1:1 do enum `tenant_user_status` (ver `0001_tenants_and_tenant_users.sql`). */
export type TenantUserStatus = 'invited' | 'active' | 'suspended';

/** Tradução 1:1 do enum `tenant_invite_status` (ver `0060_tenant_invites.sql`). */
export type TenantInviteStatus = 'pending' | 'accepted' | 'revoked';

/**
 * Formato de linha retornado por `get_tenant_members()` (RPC, ver
 * `0063_rls_configuracoes.sql`) — NÃO é a tabela `tenant_users` direto (o
 * e-mail vem de `auth.users`, inacessível via `select` comum). `client_id`/
 * `client_name` só vêm preenchidos quando existe um `clients.user_id`
 * apontando para este membro no mesmo tenant.
 */
export interface TenantMember {
  tenant_user_id: string;
  user_id: string;
  role: TenantRole;
  status: TenantUserStatus;
  joined_at: string | null;
  email: string;
  client_id: string | null;
  client_name: string | null;
}

/** Tradução 1:1 das colunas de `tenant_invites` (ver `0060_tenant_invites.sql`). */
export interface TenantInvite {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  status: TenantInviteStatus;
  invited_by_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

/** Tradução 1:1 das colunas de `doc_requirements` (ver `0061_doc_requirements.sql`). */
export interface DocRequirement {
  id: string;
  tenant_id: string;
  admin_status: UnitAdminStatus;
  doc_type: DocumentType;
  created_at: string;
}
