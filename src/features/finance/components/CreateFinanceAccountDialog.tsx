import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients } from '@/features/clients/hooks';
import { useDeals } from '@/features/deals/hooks';
import type { FinanceAccount } from '@/features/finance/types';
import { useCreateFinanceAccount } from '@/features/finance/hooks';
import { financeAccountFormSchema, type FinanceAccountFormInput } from '@/features/finance/schemas';
import type { Unit } from '@/features/units/types';

interface CreateFinanceAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: Unit;
  onCreated: (account: FinanceAccount) => void;
}

/**
 * Diálogo "Criar Carteira Financeira", acionado a partir de
 * `UnitDetailPage`. Não existe como tela/diálogo próprio no original — a
 * carteira nasce lazy dentro da mutation de criar a primeira parcela (ver
 * `src/components/unit/FinanceTabNew.jsx`, linhas 116-140), sem pedir nada
 * ao usuário além do que já está em `Unit`/`Deal`. Aqui replica a mesma
 * fonte de dado (cliente e valor da venda vêm do negócio "vendido" da
 * unidade quando existir), só tornando a criação um passo explícito —
 * simplificação combinada nesta leva, sinalizada no relatório final.
 */
export function CreateFinanceAccountDialog({ open, onOpenChange, unit, onCreated }: CreateFinanceAccountDialogProps) {
  const { data: clients } = useClients();
  const { data: deals } = useDeals();
  const createFinanceAccount = useCreateFinanceAccount();

  const soldDeal = useMemo(
    () => (deals ?? []).find((deal) => deal.unit_id === unit.id && deal.sales_stage === 'vendido' && deal.is_active),
    [deals, unit.id]
  );

  const [formData, setFormData] = useState<FinanceAccountFormInput>({
    client_id: soldDeal?.client_id ?? '',
    valor_venda_total: soldDeal?.final_sale_value ?? soldDeal?.expected_sale_value ?? unit.list_price ?? 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormData({
        client_id: soldDeal?.client_id ?? '',
        valor_venda_total: soldDeal?.final_sale_value ?? soldDeal?.expected_sale_value ?? unit.list_price ?? 0,
      });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, soldDeal?.id]);

  const sortedClients = useMemo(() => [...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [clients]);

  function setField<K extends keyof FinanceAccountFormInput>(field: K, value: FinanceAccountFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = financeAccountFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createFinanceAccount.mutate(
      {
        unit_id: unit.id,
        project_id: unit.project_id,
        client_id: parsed.data.client_id,
        deal_id: soldDeal?.id ?? null,
        valor_venda_total: parsed.data.valor_venda_total,
      },
      {
        onSuccess: (account) => {
          toast.success('Carteira financeira criada com sucesso!');
          handleClose();
          onCreated(account);
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Carteira Financeira</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={formData.client_id} onValueChange={(value) => setField('client_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {sortedClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {soldDeal && <p className="mt-1 text-xs text-muted-foreground">Pré-preenchido a partir do negócio vendido desta unidade.</p>}
            </div>
            <div>
              <Label>Valor da Venda (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor_venda_total}
                onChange={(e) => setField('valor_venda_total', Number(e.target.value))}
              />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createFinanceAccount.isPending}>
              {createFinanceAccount.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
