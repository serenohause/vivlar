import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/features/finance/constants';
import { useRegisterPayment } from '@/features/finance/hooks';
import { registerPaymentFormSchema, type RegisterPaymentFormInput } from '@/features/finance/schemas';
import type { PaymentInstallment } from '@/features/finance/types';

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

interface RegisterPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  financeAccountId: string;
  installment: PaymentInstallment | null;
}

/**
 * Tradução do fluxo "Registrar Pagamento" (`baixarPagamentoMutation` de
 * `original-project/src/pages/FinanceDetail.jsx`/
 * `src/components/unit/FinanceTabNew.jsx`) — o original baixa direto ao
 * clicar no item do menu, sem diálogo (`valor_pago: installment.valor_previsto`,
 * `data_pagamento: hoje`, sem pedir método/comprovante). Aqui vira um
 * diálogo simples com esses dois campos pré-preenchidos e editáveis, mais
 * `metodo_pagamento`/`comprovante_url` (já existem no schema mas nunca eram
 * preenchidos nesse ponto do fluxo original) — ver comentário em
 * `features/finance/schemas.ts`.
 */
export function RegisterPaymentDialog({ open, onOpenChange, financeAccountId, installment }: RegisterPaymentDialogProps) {
  const [formData, setFormData] = useState<RegisterPaymentFormInput>({
    valor_pago: installment?.valor_previsto ?? 0,
    data_pagamento: todayIsoDate(),
    metodo_pagamento: '',
    comprovante_url: '',
  });
  const [error, setError] = useState<string | null>(null);

  const registerPayment = useRegisterPayment(financeAccountId);

  useEffect(() => {
    if (open && installment) {
      setFormData({
        valor_pago: installment.valor_previsto,
        data_pagamento: todayIsoDate(),
        metodo_pagamento: '',
        comprovante_url: '',
      });
      setError(null);
    }
  }, [open, installment]);

  function setField<K extends keyof RegisterPaymentFormInput>(field: K, value: RegisterPaymentFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!installment) return;

    const parsed = registerPaymentFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    registerPayment.mutate(
      {
        id: installment.id,
        data: {
          valor_pago: parsed.data.valor_pago,
          data_pagamento: parsed.data.data_pagamento,
          metodo_pagamento: parsed.data.metodo_pagamento || null,
          comprovante_url: parsed.data.comprovante_url || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Pagamento registrado com sucesso!');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {installment && (
              <p className="text-sm text-muted-foreground">
                Valor previsto: <span className="font-medium text-foreground">{formatCurrency(installment.valor_previsto)}</span>
              </p>
            )}
            <div>
              <Label>Valor Pago (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor_pago}
                onChange={(e) => setField('valor_pago', Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={formData.data_pagamento} onChange={(e) => setField('data_pagamento', e.target.value)} />
            </div>
            <div>
              <Label>Método de Pagamento</Label>
              <Input
                value={formData.metodo_pagamento ?? ''}
                onChange={(e) => setField('metodo_pagamento', e.target.value)}
                placeholder="Ex: PIX, Boleto, Transferência"
              />
            </div>
            <div>
              <Label>Comprovante (URL)</Label>
              <Input
                value={formData.comprovante_url ?? ''}
                onChange={(e) => setField('comprovante_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={registerPayment.isPending}>
              {registerPayment.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
