import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no dialog
// original (`original-project/src/pages/Clients.jsx`): nome completo e CPF.
// Telefone, e-mail, endereço e observações são opcionais, igual ao
// original. CPF é nullable no banco (ver 0011_clients.sql), mas o
// "obrigatório" é regra de formulário, não de schema — mesma decisão já
// registrada na migration.
export const clientFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome completo.'),
  cpf: z.string().trim().min(1, 'Informe o CPF.'),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

/**
 * Payload que de fato sai de `ClientForm` para as mutations
 * (`useCreateClient`/`useUpdateClient`) — igual a `ClientFormInput`, mas com
 * os campos opcionais normalizados para `null` (em vez de `undefined`/
 * string vazia), já prontos para colunas nullable do banco.
 */
export type ClientMutationPayload = Omit<ClientFormInput, 'phone' | 'email' | 'address' | 'notes'> & {
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};
