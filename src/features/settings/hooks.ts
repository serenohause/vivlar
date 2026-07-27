import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { TenantRole } from '@/features/auth/types';
import type { DocRequirement, TenantInvite, TenantMember } from '@/features/settings/types';
import { supabase } from '@/lib/supabase';

const TENANT_MEMBERS_QUERY_KEY = ['tenant-members'] as const;
const TENANT_INVITES_QUERY_KEY = ['tenant-invites'] as const;
const DOC_REQUIREMENTS_QUERY_KEY = ['doc-requirements'] as const;

/**
 * Lista de membros do tenant (aba "Usuários") via `get_tenant_members()`
 * (RPC `security definer`, ver `0063_rls_configuracoes.sql`) — a própria
 * função já se protege (devolve lista vazia para quem não for `admin`), mas
 * a query só é disparada para `admin` mesmo assim (mesmo padrão de
 * `useNavigationBadges`, `features/dashboard/hooks.ts`: não bate a API para
 * quem certamente não tem nada a ver).
 */
export function useTenantMembers() {
  const { tenantRole } = useAuth();

  return useQuery({
    queryKey: TENANT_MEMBERS_QUERY_KEY,
    queryFn: async (): Promise<TenantMember[]> => {
      const { data, error } = await supabase.rpc('get_tenant_members');
      if (error) throw error;
      return data ?? [];
    },
    enabled: tenantRole === 'admin',
  });
}

/** Convites pendentes do tenant — só `admin` enxerga (RLS `tenant_invites_select_admin`). */
export function usePendingInvites() {
  const { tenantRole } = useAuth();

  return useQuery({
    queryKey: TENANT_INVITES_QUERY_KEY,
    queryFn: async (): Promise<TenantInvite[]> => {
      const { data, error } = await supabase
        .from('tenant_invites')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: tenantRole === 'admin',
  });
}

/**
 * Registra um convite em `tenant_invites` (RLS `tenant_invites_insert_admin`
 * garante que só `admin` do próprio tenant consegue). Convite fica `pending`
 * até a pessoa se cadastrar com o mesmo e-mail (aceite automático,
 * `accept_pending_invite()`, ver `useAcceptPendingInvite` em
 * `features/auth/hooks.ts`) — se o papel for `cliente`, o vínculo
 * `clients.user_id` NÃO é feito aqui (o convite não tem `user_id` ainda, só
 * e-mail): fica para o admin voltar depois e usar "editar papel" no membro
 * já aceito (ver `useUpdateMemberRole` abaixo) — fluxo real de 2 passos,
 * documentado também na UI (`InviteUserDialog`).
 */
export function useCreateInvite() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: TenantRole }) => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { error } = await supabase.from('tenant_invites').insert({
        tenant_id: tenantId,
        email,
        role,
        invited_by_user_id: user?.id ?? null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TENANT_INVITES_QUERY_KEY });
    },
  });
}

/** Revoga um convite pendente (`status = 'revoked'`) — sem policy de DELETE, histórico não se apaga (ver `0060_tenant_invites.sql`). */
export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tenant_invites').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TENANT_INVITES_QUERY_KEY });
    },
  });
}

/**
 * Troca o papel de um membro já existente (`UPDATE tenant_users`, RLS
 * `tenant_users_update_admin_same_tenant` desde `0002`) e, se o papel novo
 * ou antigo envolver `cliente`, ajusta o vínculo em `clients.user_id` —
 * seta quando o novo papel é `cliente` (linkando ao `clientId` escolhido),
 * remove (`= null`) quando o membro SAIU de `cliente` para outro papel. 2
 * updates sem RPC transacional: operação administrativa rara, mesmo
 * critério de simplicidade já usado em outras mutations de baixo risco do
 * projeto (ver `useUploadDocument`, `features/documents/hooks.ts`).
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      tenantUserId: string;
      userId: string;
      role: TenantRole;
      clientId: string | null;
      previousClientId: string | null;
    }) => {
      const { tenantUserId, userId, role, clientId, previousClientId } = input;

      const { error: roleError } = await supabase.from('tenant_users').update({ role }).eq('id', tenantUserId);
      if (roleError) throw roleError;

      if (role === 'cliente' && clientId) {
        const { error } = await supabase.from('clients').update({ user_id: userId }).eq('id', clientId);
        if (error) throw error;
      } else if (role !== 'cliente' && previousClientId) {
        const { error } = await supabase.from('clients').update({ user_id: null }).eq('id', previousClientId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TENANT_MEMBERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/** `doc_requirements` do tenant — leitura liberada para admin/comercial/administrativo (RLS `doc_requirements_select_tenant_team`). */
export function useDocRequirements() {
  return useQuery({
    queryKey: DOC_REQUIREMENTS_QUERY_KEY,
    queryFn: async (): Promise<DocRequirement[]> => {
      const { data, error } = await supabase.from('doc_requirements').select('*');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Exclui um requisito de documento customizado (DELETE real, sem
 * soft-delete — mesmo comportamento do botão de lixeira do original, ver
 * `0061_doc_requirements.sql`). RLS restringe a `admin`
 * (`doc_requirements_delete_admin`).
 */
export function useDeleteDocRequirement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doc_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOC_REQUIREMENTS_QUERY_KEY });
    },
  });
}

/**
 * Solicitação de exclusão de conta (aba "Conta", "Zona de Perigo") — cria 1
 * ticket em `support_tickets` (`type = 'account_deletion'`), RLS garante
 * que qualquer autenticado só insere o PRÓPRIO ticket
 * (`support_tickets_insert_own`). Sem ação automática de exclusão de
 * verdade — mesmo comportamento do original (`Settings.jsx`,
 * `deleteAccountMutation`): é um pedido para a equipe de suporte tratar.
 */
export function useRequestAccountDeletion() {
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!tenantId || !user) throw new Error('Usuário não identificado.');

      const { error } = await supabase.from('support_tickets').insert({
        tenant_id: tenantId,
        user_id: user.id,
        user_email: user.email ?? '',
        type: 'account_deletion',
        subject: 'Solicitação de exclusão de conta',
        description: `Usuário ${user.email ?? user.id} solicitou a exclusão permanente de sua conta.`,
        priority: 'high',
      });

      if (error) throw error;
    },
  });
}
