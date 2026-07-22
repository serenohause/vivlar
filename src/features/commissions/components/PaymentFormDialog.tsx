import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COMMISSION_PAYMENT_METHOD_OPTIONS, formatCurrency } from '@/features/commissions/constants';
import { useCreatePayment, useUpdatePayment } from '@/features/commissions/hooks';
import { commissionPaymentFormSchema, type CommissionPaymentFormInput } from '@/features/commissions/schemas';
import type { CommissionPayment } from '@/features/commissions/types';

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function emptyForm(saldo: number): CommissionPaymentFormInput {
  return {
    valor_pago: saldo > 0 ? Number(saldo.toFixed(2)) : (undefined as unknown as number),
    data_pagamento: todayIsoDate(),
    payment_method: 'PIX',
    payment_reference: '',
    comprovante_url: '',
    observacoes: '',
  };
}

function formFromPayment(payment: CommissionPayment): CommissionPaymentFormInput {
  return {
    valor_pago: payment.valor_pago,
    data_pagamento: payment.data_pagamento,
    payment_method: payment.payment_method ?? 'PIX',
    payment_reference: payment.payment_reference ?? '',
    comprovante_url: payment.comprovante_url ?? '',
    observacoes: payment.observacoes ?? '',
  };
}

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string;
  /** Pagamento em edição — presente = "Editar Pagamento", ausente = "Registrar Pagamento" (fiel a `isEditPaymentDialogOpen`/`isPaymentDialogOpen` de `CommissionDetail.jsx`). */
  payment?: CommissionPayment | null;
  /**
   * Saldo disponível para validação em tempo real: saldo atual da comissão
   * (modo criação) ou saldo atual + valor do próprio pagamento em edição
   * (modo edição — o pagamento sendo editado "libera" seu valor atual de
   * volta ao saldo antes de validar o novo valor). Calculado pela tela a
   * partir dos dados já carregados (`CommissionDetailPage`), fiel a
   * `saldoDisponivel` no original.
   */
  saldoDisponivel: number;
}

/** Tradução dos diálogos "Registrar Pagamento"/"Editar Pagamento" de `CommissionDetail.jsx` — mesmo formulário reaproveitado para os dois modos (fiel ao original, que compartilha `paymentData`/os mesmos campos entre as duas ações). */
export function PaymentFormDialog({ open, onOpenChange, commissionId, payment, saldoDisponivel }: PaymentFormDialogProps) {
  const isEdit = Boolean(payment);
  const [formData, setFormData] = useState<CommissionPaymentFormInput>(payment ? formFromPayment(payment) : emptyForm(saldoDisponivel));
  const [error, setError] = useState<string | null>(null);

  const createPayment = useCreatePayment(commissionId);
  const updatePayment = useUpdatePayment(commissionId);
  const isPending = createPayment.isPending || updatePayment.isPending;

  useEffect(() => {
    if (open) {
      setFormData(payment ? formFromPayment(payment) : emptyForm(saldoDisponivel));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id]);

  function setField<K extends keyof CommissionPaymentFormInput>(field: K, value: CommissionPaymentFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  const excedeSaldo = typeof formData.valor_pago === 'number' && formData.valor_pago > saldoDisponivel + 0.01;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = commissionPaymentFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    if (parsed.data.valor_pago > saldoDisponivel + 0.01) {
      setError(`Valor informado excede o saldo disponível. Saldo disponível: ${formatCurrency(saldoDisponivel)}`);
      return;
    }

    const payload = {
      valor_pago: parsed.data.valor_pago,
      data_pagamento: parsed.data.data_pagamento,
      payment_method: parsed.data.payment_method,
      payment_reference: parsed.data.payment_reference || null,
      comprovante_url: parsed.data.comprovante_url || null,
      observacoes: parsed.data.observacoes || null,
    };

    if (isEdit && payment) {
      updatePayment.mutate(
        { id: payment.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Pagamento editado com sucesso.');
            handleClose();
          },
          onError: (mutationError) => setError(mutationError.message),
        }
      );
    } else {
      createPayment.mutate(payload, {
        onSuccess: () => {
          toast.success('Pagamento registrado com sucesso.');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Pagamento' : 'Registrar Pagamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Valor Pago (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor_pago ?? ''}
                onChange={(e) => setField('valor_pago', e.target.value === '' ? (undefined as unknown as number) : Number(e.target.value))}
                placeholder="0.00"
              />
              <div className="mt-1 rounded border border-blue-200 bg-blue-50 p-2">
                <p className="text-xs font-medium text-blue-900">
                  Saldo disponível{isEdit ? ' (com este pagamento)' : ''}: {formatCurrency(saldoDisponivel)}
                </p>
                {excedeSaldo && <p className="mt-1 text-xs text-destructive">Valor excede o saldo disponível</p>}
              </div>
            </div>
            <div>
              <Label>Data do Pagamento *</Label>
              <Input type="date" value={formData.data_pagamento} onChange={(e) => setField('data_pagamento', e.target.value)} />
            </div>
            <div>
              <Label>Método de Pagamento *</Label>
              <Select value={formData.payment_method} onValueChange={(value) => setField('payment_method', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMISSION_PAYMENT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referência/Protocolo</Label>
              <Input
                value={formData.payment_reference ?? ''}
                onChange={(e) => setField('payment_reference', e.target.value)}
                placeholder="ID da transação, comprovante..."
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes ?? ''}
                onChange={(e) => setField('observacoes', e.target.value)}
                placeholder="Anotações adicionais..."
                rows={3}
              />
            </div>
            <div>
              <Label>Comprovante (URL, opcional)</Label>
              <Input value={formData.comprovante_url ?? ''} onChange={(e) => setField('comprovante_url', e.target.value)} placeholder="https://..." />
            </div>
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={isPending || excedeSaldo}>
              {isPending ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
