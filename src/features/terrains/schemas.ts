import { z } from 'zod';

// Campos obrigatórios seguem exatamente os marcados com "*" no formulário
// original (`original-project/src/pages/Terrains.jsx`): código, nome,
// endereço, cidade, estado e área. O resto é opcional, igual ao original.
export const terrainFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código.'),
  name: z.string().trim().min(1, 'Informe o nome/identificação.'),
  address: z.string().trim().min(1, 'Informe o endereço.'),
  city: z.string().trim().min(1, 'Informe a cidade.'),
  state: z.string().trim().min(1, 'Informe o estado.').max(2, 'Use a sigla do estado (2 letras).'),
  area_m2: z.coerce.number({ error: 'Informe a área em m².' }).positive('A área precisa ser maior que zero.'),
  status: z.enum(['em_prospeccao', 'em_negociacao', 'adquirido', 'descartado', 'transformado_projeto']),

  matricula: z.string().trim().optional(),
  proprietario_atual: z.string().trim().optional(),
  observacoes_legais: z.string().trim().optional(),
  forma_aquisicao: z.string().trim().optional(),

  valor_aquisicao: z.coerce.number().optional(),
  custos_itbi: z.coerce.number().optional(),
  custos_cartorio: z.coerce.number().optional(),
  custos_estudos: z.coerce.number().optional(),
  custos_corretagem: z.coerce.number().optional(),
  custos_outros: z.coerce.number().optional(),

  notas: z.string().trim().optional(),
});

export type TerrainFormInput = z.infer<typeof terrainFormSchema>;

/**
 * Payload que de fato sai de `TerrainForm` para as mutations (`useCreateTerrain`/
 * `useUpdateTerrain`) — igual a `TerrainFormInput`, mas com os campos de texto
 * opcionais normalizados para `null` (em vez de `undefined`/string vazia),
 * já prontos para colunas nullable do banco.
 */
export type TerrainMutationPayload = Omit<
  TerrainFormInput,
  'matricula' | 'proprietario_atual' | 'observacoes_legais' | 'forma_aquisicao' | 'notas'
> & {
  matricula: string | null;
  proprietario_atual: string | null;
  observacoes_legais: string | null;
  forma_aquisicao: string | null;
  notas: string | null;
};

// Localização simples (pino), sem mapa interativo — ver decisão de escopo
// no comentário de `TerrainLocationCard.tsx`.
export const terrainLocationSchema = z.object({
  latitude: z.coerce.number({ error: 'Informe a latitude.' }).min(-90).max(90),
  longitude: z.coerce.number({ error: 'Informe a longitude.' }).min(-180).max(180),
});

export type TerrainLocationInput = z.infer<typeof terrainLocationSchema>;
