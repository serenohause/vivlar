import { z } from 'zod';

import type { PublicLeadIntent } from '@/features/espelho-vendas/types';

/**
 * Validação de dígito verificador de CPF — tradução mecânica direta de
 * `validarCPF` em `LeadForm.jsx` (original). Nenhum outro lugar do app
 * ainda valida CPF de verdade (o resto do sistema só exige campo
 * preenchido) — ver nota do orquestrador nesta etapa.
 */
export function validarCPF(cpfRaw: string): boolean {
  const cpf = cpfRaw.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === Number(cpf[10]);
}

/** Normaliza telefone BR para `55XXXXXXXXXXX` — tradução 1:1 de `normalizarTelefone` (`LeadForm.jsx`). */
export function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

/**
 * Schema do `LeadForm.jsx` original — validação idêntica (`validate()` do
 * componente): nome completo (mín. 2 palavras), telefone normalizado com ao
 * menos 12 dígitos (DDI+DDD+número), e-mail opcional mas com formato válido
 * quando informado, CPF obrigatório e com dígito verificador válido só
 * quando `intent === 'reserva'`. `superRefine` (em vez de 2 schemas
 * separados por intent) para manter a mesma mensagem/campo-a-campo do
 * original com um único schema parametrizado por `intent`.
 */
export function leadFormSchema(intent: PublicLeadIntent) {
  return z
    .object({
      nome: z.string().trim(),
      telefone: z.string().trim(),
      email: z.string().trim(),
      cpf: z.string().trim(),
    })
    .superRefine((data, ctx) => {
      const nomeWords = data.nome.trim().split(/\s+/).filter(Boolean);
      if (data.nome.trim().length < 3 || nomeWords.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['nome'], message: 'Informe nome completo (mínimo 2 palavras).' });
      }

      const tel = normalizarTelefone(data.telefone);
      if (tel.length < 12) {
        ctx.addIssue({ code: 'custom', path: ['telefone'], message: 'Telefone inválido. Inclua DDD.' });
      }

      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail inválido.' });
      }

      if (intent === 'reserva') {
        if (!data.cpf.trim()) {
          ctx.addIssue({ code: 'custom', path: ['cpf'], message: 'CPF é obrigatório para reservas.' });
        } else if (!validarCPF(data.cpf)) {
          ctx.addIssue({ code: 'custom', path: ['cpf'], message: 'CPF inválido.' });
        }
      }
    });
}

export type LeadFormInput = z.infer<ReturnType<typeof leadFormSchema>>;

export type LeadFormErrors = Partial<Record<keyof LeadFormInput, string>>;

/** Formata o mapa de `ZodError.issues` para `{ campo: mensagem }`, mesmo shape de `errors` no `useState` do original. */
export function formatLeadFormErrors(error: z.ZodError): LeadFormErrors {
  const errors: LeadFormErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof LeadFormInput | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
