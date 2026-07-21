import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no dialog
// original (`original-project/src/pages/RealEstateAgencies.jsx`): nome e
// % de comissão. CNPJ, e-mail, telefone, endereço e responsável são
// opcionais, igual ao original.
export const realEstateAgencyFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da imobiliária.'),
  cnpj: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  contact_person: z.string().trim().optional(),
  commission_percentage: z.coerce
    .number({ error: 'Informe o percentual de comissão.' })
    .min(0, 'O percentual não pode ser negativo.')
    .max(100, 'O percentual não pode passar de 100.'),
  status: z.enum(['ativa', 'inativa']),
});

export type RealEstateAgencyFormInput = z.infer<typeof realEstateAgencyFormSchema>;

/**
 * Payload que de fato sai de `RealEstateAgencyForm` para as mutations
 * (`useCreateRealEstateAgency`/`useUpdateRealEstateAgency`) — igual a
 * `RealEstateAgencyFormInput`, mas com os campos opcionais normalizados
 * para `null` (em vez de `undefined`/string vazia), já prontos para
 * colunas nullable do banco.
 */
export type RealEstateAgencyMutationPayload = Omit<
  RealEstateAgencyFormInput,
  'cnpj' | 'email' | 'phone' | 'address' | 'contact_person'
> & {
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contact_person: string | null;
};
