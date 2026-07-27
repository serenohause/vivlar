import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TenantRole } from '@/features/auth/types';
import { useClients } from '@/features/clients/hooks';
import { TENANT_ROLE_OPTIONS } from '@/features/settings/constants';
import { useUpdateMemberRole } from '@/features/settings/hooks';
import { editMemberRoleSchema } from '@/features/settings/schemas';
import type { TenantMember } from '@/features/settings/types';

interface EditMemberRoleDialogProps {
  member: TenantMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog "Editar Usuário" (ícone de lápis por linha, aba Usuários) —
 * tradução de `handleUpdateUser`/`updateUserMutation` em `Settings.jsx`,
 * trocando `app_profile` (3 valores) por `tenant_role` (5 valores) e
 * `User.update` por 2 updates diretos (`tenant_users` + `clients`, ver
 * `useUpdateMemberRole`). É AQUI que o vínculo `clients.user_id` de um
 * convite de papel `cliente` é confirmado de verdade, depois que a pessoa
 * já aceitou o convite e apareceu como membro (fluxo de 2 passos
 * documentado em `InviteUserDialog`).
 */
export function EditMemberRoleDialog({ member, open, onOpenChange }: EditMemberRoleDialogProps) {
  const [role, setRole] = useState<TenantRole>(member.role);
  const [clientId, setClientId] = useState(member.client_id ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useClients();
  const updateMemberRole = useUpdateMemberRole();

  useEffect(() => {
    if (open) {
      setRole(member.role);
      setClientId(member.client_id ?? '');
      setError(null);
    }
  }, [open, member]);

  // Mesmo critério do original: cliente sem usuário vinculado ainda, OU já
  // vinculado a ESTE membro (para não sumir da lista quando reabre o dialog).
  const selectableClients = (clients ?? []).filter((c) => !c.user_id || c.user_id === member.user_id);

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = editMemberRoleSchema.safeParse({ role, client_id: clientId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    updateMemberRole.mutate(
      {
        tenantUserId: member.tenant_user_id,
        userId: member.user_id,
        role: parsed.data.role,
        clientId: parsed.data.role === 'cliente' ? (parsed.data.client_id ?? null) : null,
        previousClientId: member.client_id,
      },
      {
        onSuccess: () => {
          toast.success('Usuário atualizado com sucesso.');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Usuário</Label>
              <div className="rounded-lg bg-muted p-3 text-sm text-foreground">{member.email}</div>
            </div>
            <div>
              <Label>Papel</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  setRole(value as TenantRole);
                  if (value !== 'cliente') setClientId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_ROLE_OPTIONS.map(([roleValue, label]) => (
                    <SelectItem key={roleValue} value={roleValue}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {role === 'cliente' && (
              <div>
                <Label>Vincular ao Cliente *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.cpf ? `- ${c.cpf}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={updateMemberRole.isPending}>
              {updateMemberRole.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
