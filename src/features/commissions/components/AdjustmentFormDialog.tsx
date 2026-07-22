import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COMMISSION_ADJUSTMENT_CONFIG } from '@/features/commissions/constants';
import { useCreateAdjustment } from '@/features/commissions/hooks';
import { commissionAdjustmentFormSchema, type CommissionAdjustmentFormInput } from '@/features/commissions/schemas';
import type { CommissionAdjustmentType } from '@/features/commissions/types';

const EMPTY_FORM: CommissionAdjustmentFormInput = {
  type: 'desconto',
  amount: undefined as unknown as number,
  reason: '',
  attachment_url: '',
  attachment_name: '',
};

interface AdjustmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commissionId: string;
}

/**
 * Tradução do diálogo "Adicionar Ajuste" de `CommissionDetail.jsx`
 * (`isAdjustmentDialogOpen`/`addAdjustmentMutation`). O campo "Anexo" do
 * original faz upload real de arquivo (`base44.integrations.Core.UploadFile`)
 * — aqui vira um campo de URL de texto, mesmo padrão já usado em
 * `RegisterPaymentDialog` (módulo Financeiro) para `comprovante_url`.
 */
export function AdjustmentFormDialog({ open, onOpenChange, commissionId }: AdjustmentFormDialogProps) {
  const [formData, setFormData] = useState<CommissionAdjustmentFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createAdjustment = useCreateAdjustment(commissionId);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM);
      setError(null);
    }
  }, [open]);

  function setField<K extends keyof CommissionAdjustmentFormInput>(field: K, value: CommissionAdjustmentFormInput[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = commissionAdjustmentFormSchema.safeParse(formData);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Verifique os dados informados.');
      return;
    }

    createAdjustment.mutate(
      {
        type: parsed.data.type,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        attachment_url: parsed.data.attachment_url || null,
        attachment_name: parsed.data.attachment_url ? parsed.data.attachment_name || null : null,
      },
      {
        onSuccess: () => {
          toast.success('Ajuste adicionado.');
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
          <DialogTitle>Adicionar Ajuste</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={formData.type} onValueChange={(value) => setField('type', value as CommissionAdjustmentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMISSION_ADJUSTMENT_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount ?? ''}
                onChange={(e) => setField('amount', e.target.value === '' ? (undefined as unknown as number) : Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setField('reason', e.target.value)}
                placeholder="Descreva o motivo do ajuste..."
                rows={3}
              />
            </div>
            <div>
              <Label>Anexo (URL, opcional)</Label>
              <Input
                value={formData.attachment_url ?? ''}
                onChange={(e) => setField('attachment_url', e.target.value)}
                placeholder="https://..."
              />
              <p className="mt-1 text-xs text-muted-foreground">Link do documento que autorize o ajuste (opcional).</p>
            </div>
            {formData.attachment_url && (
              <div>
                <Label>Nome do Anexo</Label>
                <Input
                  value={formData.attachment_name ?? ''}
                  onChange={(e) => setField('attachment_name', e.target.value)}
                  placeholder="Ex: contrato_assinado.pdf"
                />
              </div>
            )}
            <FormError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={createAdjustment.isPending}>
              {createAdjustment.isPending ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
