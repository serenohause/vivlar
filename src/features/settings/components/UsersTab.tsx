import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Shield, Users, XCircle } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { useAuth } from '@/features/auth/AuthContext';
import { EditMemberRoleDialog } from '@/features/settings/components/EditMemberRoleDialog';
import { InviteUserDialog } from '@/features/settings/components/InviteUserDialog';
import { TENANT_ROLE_LABELS } from '@/features/settings/constants';
import { usePendingInvites, useRevokeInvite, useTenantMembers } from '@/features/settings/hooks';
import type { TenantMember } from '@/features/settings/types';

/** Iniciais a partir do e-mail — mesma lacuna/critério de `getInitials` em `AppShell.tsx` (sem nome estruturado de usuário ainda). */
function initialsFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  return (localPart[0] ?? 'U').toUpperCase();
}

/**
 * Aba "Usuários" (Settings, ver comentário de topo de `SettingsPage.tsx`)
 * — tradução da aba homônima de `Settings.jsx`, com o convite virando
 * "lista de espera" (`tenant_invites`) em vez de criação instantânea de
 * conta (ver `useCreateInvite`). Reproduz o mesmo gate visual do original
 * ("Apenas administradores podem gerenciar usuários") para quem não é
 * `admin` — a RPC `get_tenant_members` já devolve lista vazia sozinha,
 * mas a tela nem chega a montar a tabela/botão de convite nesse caso.
 */
export function UsersTab() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: members, isLoading, isError, refetch } = useTenantMembers();
  const { data: invites } = usePendingInvites();
  const revokeInvite = useRevokeInvite();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TenantMember | null>(null);

  function handleRevoke(id: string) {
    revokeInvite.mutate(id, {
      onSuccess: () => toast.success('Convite revogado.'),
      onError: () => toast.error('Erro ao revogar convite.'),
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-muted-foreground" />
            Usuários do Sistema
          </CardTitle>
          {isAdmin && (
            <Button variant="brand" onClick={() => setInviteOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Convidar Usuário
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!isAdmin ? (
            <div className="py-8 text-center text-muted-foreground">
              <Shield className="mx-auto mb-2 h-12 w-12 text-muted-foreground/40" />
              <p>Apenas administradores podem gerenciar usuários</p>
            </div>
          ) : isLoading ? (
            <LoadingInline />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : (members ?? []).length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : (
            <div className="space-y-3">
              {(members ?? []).map((member) => (
                <div
                  key={member.tenant_user_id}
                  className="flex items-center justify-between rounded-lg bg-muted/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="bg-brand">
                      <AvatarFallback className="bg-brand text-brand-foreground">
                        {initialsFromEmail(member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{member.email}</p>
                      {member.client_name && (
                        <p className="text-sm text-muted-foreground">Vinculado a {member.client_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{TENANT_ROLE_LABELS[member.role]}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => setEditingMember(member)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (invites ?? []).length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Convites Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(invites ?? []).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Convidado como {TENANT_ROLE_LABELS[invite.role]} em{' '}
                      {new Date(invite.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(invite.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Revogar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Só monta os dialogs (e a `useClients()` que eles disparam) para
          quem realmente pode acioná-los — evita uma query de clientes
          desnecessária para comercial/administrativo, que só veem o aviso
          "Apenas administradores..." acima. */}
      {isAdmin && (
        <>
          <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

          {editingMember && (
            <EditMemberRoleDialog
              member={editingMember}
              open={Boolean(editingMember)}
              onOpenChange={(open) => !open && setEditingMember(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
