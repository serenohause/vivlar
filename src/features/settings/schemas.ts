import { z } from 'zod';

import { emailSchema } from '@/features/auth/schemas';
import { TENANT_ROLE_VALUES } from '@/features/auth/types';

// Dialog "Convidar Usuário" (aba Usuários) — mesma regra do original
// (`Settings.jsx`, `handleInviteUser`): se o papel for `cliente`, é
// obrigatório vincular a um `clients` existente sem `user_id`.
export const inviteUserSchema = z
  .object({
    email: emailSchema,
    role: z.enum(TENANT_ROLE_VALUES, { error: 'Selecione um papel.' }),
    client_id: z.string().trim().optional(),
  })
  .refine((data) => data.role !== 'cliente' || Boolean(data.client_id), {
    message: 'Para o papel Cliente, é obrigatório vincular a um cliente existente.',
    path: ['client_id'],
  });

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

// Dialog "Editar Usuário" (ação de lápis por linha) — mesma regra acima,
// sem o campo `email` (não se edita o e-mail de um membro já vinculado).
export const editMemberRoleSchema = z
  .object({
    role: z.enum(TENANT_ROLE_VALUES, { error: 'Selecione um papel.' }),
    client_id: z.string().trim().optional(),
  })
  .refine((data) => data.role !== 'cliente' || Boolean(data.client_id), {
    message: 'Para o papel Cliente, é obrigatório vincular a um cliente existente.',
    path: ['client_id'],
  });

export type EditMemberRoleInput = z.infer<typeof editMemberRoleSchema>;
