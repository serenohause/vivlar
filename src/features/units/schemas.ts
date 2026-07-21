import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no dialog
// original (`original-project/src/pages/Units.jsx`): SKU, empreendimento e
// valor de venda. O resto é opcional, igual ao original — mas o formulário
// aqui inclui também os campos "próprios da unidade" que o dialog original
// não editava (área do lote, quartos, vagas, suítes, pavimentos, posição
// solar, observações públicas e simulação MCMV), confirmados como dentro do
// escopo combinado (`original-project/src/pages/UnitDetail.jsx` — informações
// básicas — e `original-project/src/components/espelho/UnitModal.jsx`, que
// os lê).
export const unitFormSchema = z.object({
  sku: z.string().trim().min(1, 'Informe o SKU.'),
  project_id: z.string().trim().min(1, 'Selecione o empreendimento.'),
  bloco: z.string().trim().optional(),
  tipologia: z.string().trim().optional(),
  area_m2: z.coerce.number().positive('A área precisa ser maior que zero.').optional(),
  area_lote_m2: z.coerce.number().positive('A área do lote precisa ser maior que zero.').optional(),
  quartos: z.coerce.number().int().nonnegative().optional(),
  vagas: z.coerce.number().int().nonnegative().optional(),
  suites: z.coerce.number().int().nonnegative().optional(),
  pavimentos: z.coerce.number().int().nonnegative().optional(),
  posicao_solar: z.string().trim().optional(),

  list_price: z.coerce.number({ error: 'Informe o valor de venda.' }).positive('O valor precisa ser maior que zero.'),
  status: z.enum(['disponivel', 'reservada', 'vendida', 'bloqueada']),
  notes: z.string().trim().optional(),

  // Espelho de Vendas (site público) — fallback para os equivalentes de
  // `projects` quando ausente (regra do frontend público, não do form aqui;
  // ver comentário em 0008_units.sql).
  observacoes_publica: z.string().trim().optional(),
  entrada_minima: z.coerce.number().nonnegative().optional(),
  subsidio_simulado: z.coerce.number().nonnegative().optional(),
  parcela_simulada: z.coerce.number().nonnegative().optional(),
});

export type UnitFormInput = z.infer<typeof unitFormSchema>;

/**
 * Payload que de fato sai de `UnitForm` para as mutations
 * (`useCreateUnit`/`useUpdateUnit`) — igual a `UnitFormInput`, mas com os
 * campos opcionais normalizados para `null` (em vez de `undefined`/string
 * vazia), já prontos para colunas nullable do banco. `admin_status` não faz
 * parte deste payload — igual ao original, a criação não define pipeline
 * administrativo, e a edição de `admin_status` é uma mutation própria
 * (`useUpdateUnitAdminStatus`, ver `hooks.ts`).
 */
export type UnitMutationPayload = Omit<
  UnitFormInput,
  | 'bloco'
  | 'tipologia'
  | 'area_m2'
  | 'area_lote_m2'
  | 'quartos'
  | 'vagas'
  | 'suites'
  | 'pavimentos'
  | 'posicao_solar'
  | 'notes'
  | 'observacoes_publica'
  | 'entrada_minima'
  | 'subsidio_simulado'
  | 'parcela_simulada'
> & {
  bloco: string | null;
  tipologia: string | null;
  area_m2: number | null;
  area_lote_m2: number | null;
  quartos: number | null;
  vagas: number | null;
  suites: number | null;
  pavimentos: number | null;
  posicao_solar: string | null;
  notes: string | null;
  observacoes_publica: string | null;
  entrada_minima: number | null;
  subsidio_simulado: number | null;
  parcela_simulada: number | null;
};
