import { z } from 'zod';

// Campos obrigatórios seguem exatamente o dialog "Nova Oportunidade" de
// `original-project/src/pages/CRM.jsx`: cliente, corretor e projeto
// marcados com "*" (o botão de submit já fica desabilitado sem os três —
// `disabled={... || !formData.client_id || !formData.project_id ||
// !formData.broker_id}`). Unidade é "(opcional)" — label explícito no
// original. Estágio inicial tem default "LEAD" (`SALES_STAGES[0]`).
export const dealFormSchema = z.object({
  client_id: z.string().trim().min(1, 'Selecione o cliente.'),
  broker_id: z.string().trim().min(1, 'Selecione o corretor.'),
  project_id: z.string().trim().min(1, 'Selecione o projeto.'),
  unit_id: z.string().trim().optional(),
  sales_stage: z.enum(['lead', 'qualificado', 'reservado', 'proposta', 'vendido']),
  expected_sale_value: z.coerce.number().nonnegative('O valor não pode ser negativo.').optional(),
});

export type DealFormInput = z.infer<typeof dealFormSchema>;

/**
 * Payload que sai de `DealForm` para `useCreateDeal` — `unit_id` nulificado
 * quando vazio (nullable no banco, ver 0014_deals.sql).
 */
export type DealMutationPayload = {
  client_id: string;
  broker_id: string | null;
  project_id: string;
  unit_id: string | null;
  sales_stage: DealFormInput['sales_stage'];
  expected_sale_value: number | null;
};

// Campos do diálogo "Nova/Registrar Atividade" — título obrigatório fiel a
// `DealDetail.jsx` (`disabled={!activityFormData.title}`); tipo tem default
// "outro" no banco (0015_activities.sql).
export const activityFormSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título.'),
  type: z.enum(['ligacao', 'whatsapp', 'documento', 'visita', 'pendencia', 'outro']),
  due_date: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export type ActivityFormInput = z.infer<typeof activityFormSchema>;

export type ActivityMutationPayload = {
  title: string;
  type: ActivityFormInput['type'];
  due_date: string | null;
  description: string | null;
};

// Diálogo "Alterar Estágio" de `DealDetail.jsx` — estágio obrigatório
// (`disabled={!selectedStage}`), observação sempre opcional (mesmo quando é
// "Motivo da Perda": o original não bloqueia o submit sem ela).
export const stageChangeFormSchema = z.object({
  to_stage: z.enum(['lead', 'qualificado', 'reservado', 'proposta', 'vendido', 'perdido', 'distratado']),
  note: z.string().trim().optional(),
});

export type StageChangeFormInput = z.infer<typeof stageChangeFormSchema>;

// Formulário simplificado de "Novo Cliente" dentro do fluxo do CRM (dialog
// `CreateClientInline`, `original-project/src/components/crm/CreateClientInline.jsx`)
// — obrigatórios são nome e TELEFONE (diferente do cadastro completo de
// Clientes, `features/clients/schemas.ts`, que exige CPF em vez de
// telefone; os dois dialogs do original têm regras de obrigatoriedade
// diferentes de fato, replicado fielmente aqui em vez de unificar).
export const createClientInlineSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome completo.'),
  phone: z.string().trim().min(1, 'Informe o telefone.'),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
  cpf: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export type CreateClientInlineInput = z.infer<typeof createClientInlineSchema>;

// Formulário simplificado de "Novo Corretor" dentro do fluxo do CRM
// (`CreateBrokerInline.jsx`) — só nome, telefone (obrigatórios), e-mail,
// CPF e comissão padrão (%). Sem campo de tipo/imobiliária (o dialog
// original não tem esses campos) — corretor criado por aqui é sempre
// "autonomo", sem split de comissão (0%); quem precisar de imobiliária ou
// tipo diferente edita depois em Corretores.
export const createBrokerInlineSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome completo.'),
  phone: z.string().trim().min(1, 'Informe o telefone.'),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Informe um e-mail válido.'),
  cpf: z.string().trim().optional(),
  commission_rate_percentage: z.coerce.number().nonnegative('A comissão não pode ser negativa.'),
});

export type CreateBrokerInlineInput = z.infer<typeof createBrokerInlineSchema>;
