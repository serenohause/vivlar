import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no dialog
// original (`original-project/src/pages/Brokers.jsx`): nome completo e
// telefone. Quando o tipo é "imobiliaria", a imobiliária também vira
// obrigatória (o `<Select>` do original tem "Imobiliária *"). CPF e e-mail
// são opcionais, igual ao original.
//
// `commission_rate_percentage` é o valor exibido/editado no formulário
// (ex: "5.00" para 5%) — convertido para a fração decimal armazenada no
// banco (`brokers.commission_rate`, ex: 0.05) só no payload de mutation,
// mesma conversão do original (`percentage / 100`).
export const brokerFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome completo.'),
    cpf: z.string().trim().optional(),
    phone: z.string().trim().min(1, 'Informe o telefone.'),
    email: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
    type: z.enum(['autonomo', 'imobiliaria']),
    real_estate_agency_id: z.string().trim().optional(),
    commission_rate_percentage: z.coerce
      .number({ error: 'Informe a taxa de comissão.' })
      .nonnegative('A taxa não pode ser negativa.'),
    commission_split: z.coerce.number().min(0, 'O split não pode ser negativo.').max(100, 'O split não pode passar de 100.'),
    is_active: z.boolean(),
  })
  .refine((data) => data.type !== 'imobiliaria' || Boolean(data.real_estate_agency_id), {
    message: 'Selecione a imobiliária.',
    path: ['real_estate_agency_id'],
  });

export type BrokerFormInput = z.infer<typeof brokerFormSchema>;

/**
 * Payload que de fato sai de `BrokerForm` para as mutations
 * (`useCreateBroker`/`useUpdateBroker`) — campos opcionais normalizados
 * para `null`, `commission_rate_percentage` convertido para a fração
 * decimal (`commission_rate`) e `real_estate_agency_id` zerado quando o
 * tipo é "autonomo" (mesmo critério do original: o vínculo só existe de
 * fato quando `type === 'imobiliaria'`).
 */
export type BrokerMutationPayload = {
  name: string;
  cpf: string | null;
  phone: string;
  email: string | null;
  type: BrokerFormInput['type'];
  real_estate_agency_id: string | null;
  commission_rate: number;
  commission_split: number;
  is_active: boolean;
};
