import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TenantRole } from '@/features/auth/types';
import { useClients } from '@/features/clients/hooks';
import { useCreateInvite } from '@/features/settings/hooks';
import { TENANT_ROLE_OPTIONS } from '@/features/settings/constants';
import { inviteUserSchema } from '@/features/settings/schemas';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyForm = { email: '', role: 'comercial' as TenantRole, client_id: '' };

/**
 * Dialog "Convidar Usuário" (aba Usuários) — tradução do dialog de mesmo
 * nome em `Settings.jsx`, com 2 diferenças deliberadas: (1) 5 papéis reais
 * (`tenant_role`) em vez dos 3 perfis do original; (2) não cria a conta na
 * hora (o original dependia de `base44.users.inviteUser`, que não existe
 * aqui) — só registra o convite em `tenant_invites` (`useCreateInvite`). O
 * vínculo `clients.user_id` para convites de papel `cliente` só acontece
 * DEPOIS que a pessoa aceitar o convite (vira um `tenant_users` de
 * verdade) — o admin precisa voltar aqui e usar "editar papel" naquele
 * momento (ver aviso abaixo do formulário).
 */
export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useClients();
  const createInvite = useCreateInvite();

  useEffect(() => {
    if (open) {
      setFormData(emptyForm);
      setError(null);
    }
  }, [open]);

  const unlinkedClients = (clients ?? []).filter((c) => !c.user_id);

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = inviteUserSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createInvite.mutate(
      { email: parsed.data.email, role: parsed.data.role },
      {
        onSuccess: () => {
          toast.success('Convite registrado com sucesso.');
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
          <DialogTitle>Convidar Usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="invite-email">E-mail</Label>
              <Input
                id="invite-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
                placeholder="usuario@email.com"
              />
            </div>
            <div>
              <Label>Papel</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    role: value as TenantRole,
                    client_id: value === 'cliente' ? current.client_id : '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_ROLE_OPTIONS.map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.role === 'cliente' && (
              <div>
                <Label>Vincular ao Cliente *</Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => setFormData((current) => ({ ...current, client_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.cpf ? `- ${c.cpf}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unlinkedClients.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">Todos os clientes já possuem usuário vinculado</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  O convite guarda só o e-mail e o papel — o vínculo com este cliente é confirmado depois, quando a
                  pessoa aceitar o convite e aparecer na lista de usuários (use a ação de editar papel naquele
                  momento).
                </p>
              </div>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createInvite.isPending}>
              {createInvite.isPending ? 'Convidando...' : 'Convidar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
