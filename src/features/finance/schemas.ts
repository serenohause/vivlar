import { z } from 'zod';

// Diálogo "Criar Carteira Financeira" — não existe como tela própria no
// original (a carteira nasce lazy, dentro da mutation de criar a primeira
// parcela, ver `src/components/unit/FinanceTabNew.jsx` linhas 116-140).
// Simplificação combinada nesta leva: um diálogo explícito acionado a
// partir de `UnitDetailPage` (ver `CreateFinanceAccountDialog`), com
// cliente/valor de venda pré-preenchidos a partir do negócio "vendido" da
// unidade quando existir — mesma origem de dado do fallback automático do
// original (`deal?.client_id`, `unit.list_price`). `unit_id`/`project_id`
// vêm do contexto (unidade corrente), não deste formulário.
export const financeAccountFormSchema = z.object({
  client_id: z.string().trim().min(1, 'Selecione o cliente.'),
  valor_venda_total: z.coerce.number().nonnegative('O valor não pode ser negativo.'),
});

export type FinanceAccountFormInput = z.infer<typeof financeAccountFormSchema>;

export type FinanceAccountMutationPayload = {
  unit_id: string;
  project_id: string;
  client_id: string;
  deal_id: string | null;
  valor_venda_total: number;
};

// Diálogo "Nova/Editar Parcela" — campos obrigatórios fiéis a
// `FinanceDetail.jsx`/`FinanceTabNew.jsx`
// (`disabled={!formData.vencimento || !formData.valor_previsto}`). Tipo tem
// default "entrada" no diálogo original (`tipo: "ENTRADA"`).
export const installmentFormSchema = z.object({
  tipo: z.enum(['sinal', 'entrada', 'parcela', 'reforco', 'intermediaria', 'valor_financiado', 'subsidio', 'outros']),
  descricao: z.string().trim().optional(),
  numero_parcela: z.coerce.number().int('Informe um número inteiro.').positive('Informe um número maior que zero.').optional(),
  vencimento: z.string().trim().min(1, 'Informe o vencimento.'),
  valor_previsto: z.coerce.number().positive('Informe um valor maior que zero.'),
  observacoes: z.string().trim().optional(),
});

export type InstallmentFormInput = z.infer<typeof installmentFormSchema>;

export type InstallmentMutationPayload = {
  tipo: InstallmentFormInput['tipo'];
  descricao: string | null;
  numero_parcela: number | null;
  vencimento: string;
  valor_previsto: number;
  observacoes: string | null;
};

// Diálogo "Registrar Pagamento" — fiel ao fluxo de baixa de
// `baixarPagamentoMutation` (`FinanceDetail.jsx`/`FinanceTabNew.jsx`), que
// no original baixa direto sem diálogo (`valor_pago: installment.valor_previsto`,
// `data_pagamento: hoje`, sem pedir método/comprovante). Enriquecido aqui
// com um diálogo simples para capturar `metodo_pagamento`/`comprovante_url`
// — campos que já existem no schema (0020_payment_installments.sql) mas o
// original nunca preenche neste ponto do fluxo. Valor e data vêm
// pré-preenchidos (valor previsto da parcela, hoje) e continuam editáveis.
export const registerPaymentFormSchema = z.object({
  valor_pago: z.coerce.number().positive('Informe um valor maior que zero.'),
  data_pagamento: z.string().trim().min(1, 'Informe a data do pagamento.'),
  metodo_pagamento: z.string().trim().optional(),
  comprovante_url: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\//.test(value), 'Informe uma URL válida (http:// ou https://).'),
});

export type RegisterPaymentFormInput = z.infer<typeof registerPaymentFormSchema>;

export type RegisterPaymentMutationPayload = {
  valor_pago: number;
  data_pagamento: string;
  metodo_pagamento: string | null;
  comprovante_url: string | null;
};

// Diálogo "Registrar Cobrança" de `InadimplenciaManagerPage` — tradução do
// dialog "Registrar Ação de Cobrança" de `AcoesCobranca`
// (`InadimplenciaManager.jsx`), que só pedia `observacoes` (ação/canal
// ficavam implícitos: sempre `'MANUAL'`/`'MANUAL'`). Aqui `acao`/`canal`
// viram campos explícitos do formulário — o schema real tem 5 valores de
// `acao` e `canal` é texto livre (ver `types.ts`), então vale deixar o
// usuário escolher em vez de hardcodar `'manual'`/`'MANUAL'` sempre.
// `data_execucao`/`status` não são deste formulário: gravados pela mutation
// (`useRegisterCobranca`) como "agora"/`'enviado'`, fiel ao original
// (`data_execucao: new Date().toISOString(), status: 'ENVIADO'`).
export const registerCobrancaFormSchema = z.object({
  acao: z.enum(['lembrete_amigavel', 'primeira_cobranca', 'segunda_cobranca', 'cobranca_formal', 'manual']),
  canal: z.string().trim().min(1, 'Selecione o canal.'),
  observacoes: z.string().trim().optional(),
});

export type RegisterCobrancaFormInput = z.infer<typeof registerCobrancaFormSchema>;

export type RegisterCobrancaMutationPayload = {
  acao: RegisterCobrancaFormInput['acao'];
  canal: string;
  observacoes: string | null;
};
