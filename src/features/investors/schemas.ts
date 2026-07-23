import { z } from 'zod';

/** Sentinela para "Sem investidor"/"Nenhum" nos `<Select>` de investidor — Radix `Select.Item` não aceita `value=""`, mesmo critério de `NO_RESPONSIBLE` em `MaintenanceDetailPage`. */
export const NO_INVESTOR = '__none__';

// Diálogo "Novo/Editar Investidor" — fiel a `Investors.jsx` (`InvestorForm`):
// só `nome` é obrigatório (único campo sem fallback vazio no formulário
// original), o resto é opcional.
export const investorFormSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do investidor.'),
  documento: z.string().trim().optional(),
  tipo: z.enum(['PF', 'PJ']),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
  telefone: z.string().trim().optional(),
  status: z.enum(['ATIVO', 'INATIVO']),
  observacoes: z.string().trim().optional(),
});

export type InvestorFormInput = z.infer<typeof investorFormSchema>;

export type InvestorMutationPayload = {
  nome: string;
  documento: string | null;
  tipo: InvestorFormInput['tipo'];
  email: string | null;
  telefone: string | null;
  status: InvestorFormInput['status'];
  observacoes: string | null;
};

// Dialog "Vincular a Projeto" (`project_investors`) — tela nova, sem
// equivalente no original (ver ACHADO em `0042_project_investors.sql`).
// Todos os 4 campos sugeridos pelo achado são obrigatórios: sem eles o
// vínculo não tem utilidade nenhuma (nome de exibição em branco, ou
// aporte/percentual que ninguém preencheu).
export const projectInvestorFormSchema = z.object({
  project_id: z.string().trim().min(1, 'Selecione o projeto.'),
  nome_exibicao: z.string().trim().min(1, 'Informe como o investidor aparece neste projeto.'),
  valor_aportado: z.coerce.number().nonnegative('O valor aportado não pode ser negativo.'),
  percentual_participacao: z.coerce
    .number()
    .min(0, 'O percentual não pode ser negativo.')
    .max(100, 'O percentual não pode passar de 100.'),
});

export type ProjectInvestorFormInput = z.infer<typeof projectInvestorFormSchema>;

export type ProjectInvestorMutationPayload = ProjectInvestorFormInput;

// Diálogo "Novo/Editar Aporte" — fiel a `InvestmentContributions.jsx`
// (`ContributionForm`): `project_id`/`valor`/`data` obrigatórios
// (`required` no original), `investor_id` opcional (vazio = capital próprio
// da construtora, ver `investment_contributions.investor_id` em `types.ts`).
export const investmentContributionFormSchema = z.object({
  project_id: z.string().trim().min(1, 'Selecione o projeto.'),
  investor_id: z.string().trim().optional(),
  valor: z.coerce.number().positive('Informe um valor maior que zero.'),
  data: z.string().trim().min(1, 'Informe a data.'),
  tipo: z.enum(['APORTE', 'REFORCO', 'AJUSTE']),
  status: z.enum(['PREVISTO', 'CONFIRMADO']),
  observacoes: z.string().trim().optional(),
  comprovante_url: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\//.test(value), 'Informe uma URL válida (http:// ou https://).'),
  comprovante_nome: z.string().trim().optional(),
});

export type InvestmentContributionFormInput = z.infer<typeof investmentContributionFormSchema>;

export type InvestmentContributionMutationPayload = {
  project_id: string;
  investor_id: string | null;
  valor: number;
  data: string;
  tipo: InvestmentContributionFormInput['tipo'];
  status: InvestmentContributionFormInput['status'];
  observacoes: string | null;
  comprovante_url: string | null;
  comprovante_nome: string | null;
};

// Diálogo "Novo/Editar Retorno" — fiel a `InvestmentReturns.jsx`
// (`ReturnForm`): `project_id`/`return_type`/`valor`/`data` obrigatórios,
// `investor_id` obrigatório PARA TODO TIPO EXCETO "DIVIDENDO_VIVLAR" (regra
// de negócio confirmada no `disabled` do botão de submit original —
// `formData.return_type !== "DIVIDENDO_VIVLAR" && !formData.investor_id`).
export const investmentReturnFormSchema = z
  .object({
    project_id: z.string().trim().min(1, 'Selecione o projeto.'),
    return_type: z.enum(['PRINCIPAL', 'DIVIDENDO_INVESTIDOR', 'DIVIDENDO_VIVLAR']),
    investor_id: z.string().trim().optional(),
    valor: z.coerce.number().positive('Informe um valor maior que zero.'),
    data: z.string().trim().min(1, 'Informe a data.'),
    status: z.enum(['PREVISTO', 'PAGO']),
    observacoes: z.string().trim().optional(),
  })
  .refine((data) => data.return_type === 'DIVIDENDO_VIVLAR' || Boolean(data.investor_id), {
    message: 'Selecione o investidor — obrigatório para este tipo de retorno.',
    path: ['investor_id'],
  });

export type InvestmentReturnFormInput = z.infer<typeof investmentReturnFormSchema>;

export type InvestmentReturnMutationPayload = {
  project_id: string;
  investor_id: string | null;
  valor: number;
  data: string;
  return_type: InvestmentReturnFormInput['return_type'];
  status: InvestmentReturnFormInput['status'];
  observacoes: string | null;
};
