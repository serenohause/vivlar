import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { INSTALLMENT_TYPE_LABELS, INSTALLMENT_TYPES } from '@/features/finance/constants';
import { useCreateInstallment, useUpdateInstallment } from '@/features/finance/hooks';
import { installmentFormSchema, type InstallmentFormInput } from '@/features/finance/schemas';
import type { PaymentInstallment } from '@/features/finance/types';

const EMPTY_FORM: InstallmentFormInput = {
  tipo: 'entrada',
  descricao: '',
  numero_parcela: undefined,
  vencimento: '',
  valor_previsto: undefined as unknown as number,
  observacoes: '',
};

function formFromInstallment(installment: PaymentInstallment): InstallmentFormInput {
  return {
    tipo: installment.tipo,
    descricao: installment.descricao ?? '',
    numero_parcela: installment.numero_parcela ?? undefined,
    vencimento: installment.vencimento,
    valor_previsto: installment.valor_previsto,
    observacoes: installment.observacoes ?? '',
  };
}

interface InstallmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  financeAccountId: string;
  unitId: string;
  clientId: string;
  /** Parcela em edição — presente = modo "Editar Parcela", ausente = "Nova Parcela" (fiel a `dialog?.mode === "edit"` de `FinanceDetail.jsx`). */
  installment?: PaymentInstallment | null;
}

/** Tradução do diálogo "Nova/Editar Parcela" de `original-project/src/pages/FinanceDetail.jsx`. */
export function InstallmentFormDialog({ open, onOpenChange, financeAccountId, unitId, clientId, installment }: InstallmentFormDialogProps) {
  const isEdit = Boolean(installment);
  const [formData, setFormData] = useState<InstallmentFormInput>(installment ? formFromInstallment(installment) : EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createInstallment = useCreateInstallment(financeAccountId, unitId, clientId);
  const updateInstallment = useUpdateInstallment(financeAccountId);
  const isPending = createInstallment.isPending || updateInstallment.isPending;

  useEffect(() => {
    if (open) {
      setFormData(installment ? formFromInstallment(installment) : EMPTY_FORM);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installment?.id]);

  function setField<K extends keyof InstallmentFormInput>(field: K, value: InstallmentFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = installmentFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    const payload = {
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao || null,
      numero_parcela: parsed.data.numero_parcela ?? null,
      vencimento: parsed.data.vencimento,
      valor_previsto: parsed.data.valor_previsto,
      observacoes: parsed.data.observacoes || null,
    };

    if (isEdit && installment) {
      updateInstallment.mutate(
        { id: installment.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Parcela atualizada com sucesso!');
            handleClose();
          },
          onError: (mutationError) => setError(mutationError.message),
        }
      );
    } else {
      createInstallment.mutate(payload, {
        onSuccess: () => {
          toast.success('Parcela criada com sucesso!');
          handleClose();
        },
        onError: (mutationError) => setError(mutationError.message),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Parcela' : 'Nova Parcela'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={(value) => setField('tipo', value as InstallmentFormInput['tipo'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_TYPES.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {INSTALLMENT_TYPE_LABELS[tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                value={formData.descricao ?? ''}
                onChange={(e) => setField('descricao', e.target.value)}
                placeholder="Ex: 1ª Parcela de Entrada"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Número da Parcela</Label>
                <Input
                  type="number"
                  value={formData.numero_parcela ?? ''}
                  onChange={(e) => setField('numero_parcela', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="1"
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input type="date" value={formData.vencimento} onChange={(e) => setField('vencimento', e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Valor Previsto (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor_previsto ?? ''}
                onChange={(e) => setField('valor_previsto', e.target.value === '' ? (undefined as unknown as number) : Number(e.target.value))}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={formData.observacoes ?? ''} onChange={(e) => setField('observacoes', e.target.value)} rows={3} />
            </div>

            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
