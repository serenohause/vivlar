import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateClient } from '@/features/clients/hooks';
import type { Client } from '@/features/clients/types';
import { createClientInlineSchema, type CreateClientInlineInput } from '@/features/deals/schemas';

const EMPTY_FORM: CreateClientInlineInput = { name: '', phone: '', email: '', cpf: '', address: '' };

interface CreateClientInlineProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (client: Client) => void;
}

/**
 * Tradução de `original-project/src/components/crm/CreateClientInline.jsx`
 * — cadastro rápido de cliente sem sair do fluxo de criar negócio, aberto
 * pelo botão "Novo Cliente" dentro do dialog "Nova Oportunidade" do CRM.
 * Reaproveita `useCreateClient()` (mesma mutation do cadastro completo em
 * `features/clients/hooks.ts`), mas com seu próprio formulário/validação —
 * obrigatórios aqui são nome e telefone (CPF opcional), diferente do
 * cadastro completo (nome e CPF obrigatórios): os dois dialogs do original
 * já tinham regras diferentes entre si, replicado fielmente em vez de
 * unificar.
 */
export function CreateClientInline({ open, onOpenChange, onSuccess }: CreateClientInlineProps) {
  const [formData, setFormData] = useState<CreateClientInlineInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const createClient = useCreateClient();

  function setField<K extends keyof CreateClientInlineInput>(field: K, value: CreateClientInlineInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    setFormData(EMPTY_FORM);
    setError(null);
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = createClientInlineSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createClient.mutate(
      {
        name: parsed.data.name,
        cpf: parsed.data.cpf || null,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        address: parsed.data.address || null,
        notes: null,
      },
      {
        onSuccess: (client) => {
          onSuccess(client);
          handleClose();
        },
        onError: (mutationError) => {
          const isDuplicateCpf =
            typeof mutationError === 'object' &&
            mutationError !== null &&
            'code' in mutationError &&
            (mutationError as { code?: string }).code === '23505';
          setError(isDuplicateCpf ? 'Já existe um cliente cadastrado com este CPF.' : 'Erro ao criar cliente. Tente novamente.');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Completo *</Label>
              <Input value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder="João da Silva" />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="(85) 99999-9999"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="joao@exemplo.com"
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={formData.cpf} onChange={(e) => setField('cpf', e.target.value)} placeholder="000.000.000-00" />
              <p className="mt-1 text-xs text-muted-foreground">Se preenchido, não permite duplicação</p>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input
                value={formData.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="Rua, número, bairro"
              />
            </div>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={createClient.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createClient.isPending}>
              {createClient.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Salvar Cliente'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
