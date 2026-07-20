import { z } from 'zod';

// Mesma regra usada no backend (create_tenant_with_admin, 0005_create_tenant_rpc.sql):
// letras minúsculas, números e hífen simples entre segmentos.
export const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const emailSchema = z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.');

export const passwordSchema = z.string().min(6, 'A senha precisa ter no mínimo 6 caracteres.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupAccountSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirme a senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type SignupAccountInput = z.infer<typeof signupAccountSchema>;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da empresa.'),
  slug: z
    .string()
    .trim()
    .min(2, 'Informe um identificador.')
    .regex(slugRegex, 'Use apenas letras minúsculas, números e hífen simples entre segmentos (ex: minha-empresa).'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
