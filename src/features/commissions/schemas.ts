import { z } from 'zod';

// Diálogo "Adicionar Ajuste" — fiel a `CommissionDetail.jsx`
// (`addAdjustmentMutation`/`isAdjustmentDialogOpen`), obrigatórios `type`/
// `amount`/`reason` (`disabled={!adjustmentData.amount || !adjustmentData.reason}`).
// `attachment_url`/`attachment_name` substituem o upload real de arquivo do
// original (`base44.integrations.Core.UploadFile`) por um campo de URL de
// texto, mesmo padrão já usado em `payment_installments.comprovante_url`/
// `commission_adjustments.attachment_url` (sem upload real nesta leva).
export const commissionAdjustmentFormSchema = z.object({
  type: z.enum(['desconto', 'acrescimo', 'bonus']),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  reason: z.string().trim().min(1, 'Informe o motivo do ajuste.'),
  attachment_url: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\//.test(value), 'Informe uma URL válida (http:// ou https://).'),
  attachment_name: z.string().trim().optional(),
});

export type CommissionAdjustmentFormInput = z.infer<typeof commissionAdjustmentFormSchema>;

export type CommissionAdjustmentMutationPayload = {
  type: CommissionAdjustmentFormInput['type'];
  amount: number;
  reason: string;
  attachment_url: string | null;
  attachment_name: string | null;
};

// Diálogo "Registrar Pagamento"/"Editar Pagamento" — fiel a
// `CommissionDetail.jsx` (`registerPaymentMutation`/`editPaymentMutation`),
// obrigatórios `valor_pago`/`data_pagamento`/`payment_method`. Validação de
// "não exceder o saldo disponível" não entra aqui (depende da comissão
// carregada no momento do submit, não é uma regra estática de formato) —
// fica nos hooks de mutation (`features/commissions/hooks.ts`), fiel ao
// `throw new Error(...)` dentro de `mutationFn` no original.
export const commissionPaymentFormSchema = z.object({
  valor_pago: z.coerce.number().positive('Informe um valor maior que zero.'),
  data_pagamento: z.string().trim().min(1, 'Informe a data do pagamento.'),
  payment_method: z.string().trim().min(1, 'Selecione o método de pagamento.'),
  payment_reference: z.string().trim().optional(),
  comprovante_url: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\//.test(value), 'Informe uma URL válida (http:// ou https://).'),
  observacoes: z.string().trim().optional(),
});

export type CommissionPaymentFormInput = z.infer<typeof commissionPaymentFormSchema>;

export type CommissionPaymentMutationPayload = {
  valor_pago: number;
  data_pagamento: string;
  payment_method: string;
  payment_reference: string | null;
  comprovante_url: string | null;
  observacoes: string | null;
};

// Diálogo "Agendar Pagamento" — fiel a `CommissionDetail.jsx` (`scheduleMutation`/`isScheduleDialogOpen`).
export const commissionScheduleFormSchema = z.object({
  due_date: z.string().trim().min(1, 'Informe a data de vencimento.'),
});

export type CommissionScheduleFormInput = z.infer<typeof commissionScheduleFormSchema>;

// Diálogo "Cancelar Comissão" — fiel a `CommissionDetail.jsx` (`cancelMutation`/`isCancelDialogOpen`), motivo obrigatório (`disabled={!cancelReason}`).
export const commissionCancelFormSchema = z.object({
  notes: z.string().trim().min(1, 'Informe o motivo do cancelamento.'),
});

export type CommissionCancelFormInput = z.infer<typeof commissionCancelFormSchema>;
