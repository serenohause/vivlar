import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateBroker } from '@/features/brokers/hooks';
import type { Broker } from '@/features/brokers/types';
import { createBrokerInlineSchema, type CreateBrokerInlineInput } from '@/features/deals/schemas';

const EMPTY_FORM: CreateBrokerInlineInput = { name: '', phone: '', email: '', cpf: '', commission_rate_percentage: 5 };

interface CreateBrokerInlineProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (broker: Broker) => void;
}

/**
 * Tradução de `original-project/src/components/crm/CreateBrokerInline.jsx`
 * — cadastro rápido de corretor sem sair do fluxo de criar negócio.
 * Reaproveita `useCreateBroker()` (mesma mutation do cadastro completo em
 * `features/brokers/hooks.ts`), mas com formulário reduzido: sem os campos
 * tipo/imobiliária/split do cadastro completo (o dialog original também não
 * tinha) — corretor criado por aqui é sempre `autonomo`, sem split de
 * comissão (0%); quem precisar de outro tipo edita depois em Corretores.
 * Sem checagem de CPF duplicado: `brokers.cpf` não tem constraint de
 * unicidade neste schema (ver comentário em `0013_brokers.sql` — nunca
 * confirmado no original, fora de escopo).
 */
export function CreateBrokerInline({ open, onOpenChange, onSuccess }: CreateBrokerInlineProps) {
  const [formData, setFormData] = useState<CreateBrokerInlineInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const createBroker = useCreateBroker();

  function setField<K extends keyof CreateBrokerInlineInput>(field: K, value: CreateBrokerInlineInput[K]) {
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

    const parsed = createBrokerInlineSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createBroker.mutate(
      {
        name: parsed.data.name,
        cpf: parsed.data.cpf || null,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        type: 'autonomo',
        real_estate_agency_id: null,
        commission_rate: parsed.data.commission_rate_percentage / 100,
        commission_split: 0,
        is_active: true,
      },
      {
        onSuccess: (broker) => {
          onSuccess(broker);
          handleClose();
        },
        onError: () => {
          setError('Erro ao criar corretor. Tente novamente.');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Corretor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Completo *</Label>
              <Input value={formData.name} onChange={(e) => setField('name', e.target.value)} placeholder="Maria Corretora" />
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
                placeholder="maria@exemplo.com"
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={formData.cpf} onChange={(e) => setField('cpf', e.target.value)} placeholder="000.000.000-00" />
              <p className="mt-1 text-xs text-muted-foreground">Opcional</p>
            </div>
            <div>
              <Label>Comissão Padrão (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.commission_rate_percentage}
                onChange={(e) => setField('commission_rate_percentage', Number(e.target.value))}
                placeholder="5.0"
              />
              <p className="mt-1 text-xs text-muted-foreground">Percentual de comissão sobre o valor da venda</p>
            </div>

            <FormError message={error} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={createBroker.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createBroker.isPending}>
              {createBroker.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                'Salvar Corretor'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
