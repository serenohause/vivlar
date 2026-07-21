-- 0009_terrains.sql
-- Catálogo: `terrains` — terreno/pré-projeto (do original
-- `src/pages/Terrains.jsx` e `src/pages/TerrainDetail.jsx`, ignorando o
-- desenho interativo de polígono via Leaflet — `latitude`/`longitude` como
-- colunas numéricas simples cobrem o essencial, confirmado com o usuário).
--
-- ORDEM DE CRIAÇÃO: `terrains` é criada DEPOIS de `projects` (0007) nesta
-- leva porque `terrains.projeto_origem_id` referencia `projects(id)` — FK
-- nullable, setada quando `status = transformado_projeto` (fluxo "criar
-- projeto a partir do terreno" em TerrainDetail.jsx). Decisão documentada
-- também em 0007_projects.sql.
--
-- Nomes de campo do original tinham acento (`matrícula`,
-- `proprietário_atual`, `observações_legais`, `valor_aquisição`,
-- `forma_aquisição`) — normalizados aqui para snake_case ASCII
-- (`matricula`, `proprietario_atual`, `observacoes_legais`,
-- `valor_aquisicao`, `forma_aquisicao`), igual à convenção geral do
-- CLAUDE.md.
--
-- `forma_aquisicao` fica como `text` livre, não enum: os valores vistos em
-- Terrains.jsx (À_VISTA, PARCELADO, PERMUTA, PARCERIA, OUTRO) existem só
-- naquele Select do formulário, sem uso de enum/constante compartilhada em
-- outro lugar do código — decisão de não modelar como enum aqui para não
-- travar esse campo antes de confirmar se essa lista é definitiva.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), tabela por tabela, com teste de isolamento
-- correspondente — igual ao padrão de 0001.

-- 1. Enum de status do terreno.
create type terrain_status as enum (
  'em_prospeccao',
  'em_negociacao',
  'adquirido',
  'descartado',
  'transformado_projeto'
);

-- 2. terrains
create table terrains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Identificação
  code text not null,
  name text not null,
  address text,
  city text,
  state text,
  area_m2 numeric(10, 2) not null,
  status terrain_status not null default 'em_prospeccao',

  -- Dados jurídicos
  matricula text,
  proprietario_atual text,
  observacoes_legais text,
  forma_aquisicao text,

  -- Dados financeiros
  valor_aquisicao numeric(14, 2),
  custos_itbi numeric(14, 2),
  custos_cartorio numeric(14, 2),
  custos_estudos numeric(14, 2),
  custos_corretagem numeric(14, 2),
  custos_outros numeric(14, 2),

  notas text,

  -- Localização (pino simples; desenho de polígono fora de escopo)
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  location_updated_at timestamptz,
  location_updated_by_user_id uuid references auth.users(id),

  -- Transformação em projeto
  projeto_origem_id uuid references projects(id),

  -- Soft delete
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  -- Auditoria
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table terrains is
  'Terreno/pré-projeto, do prospecto à eventual transformação em projeto. '
  'Sem mapa/polígono interativo (Leaflet) — latitude/longitude simples '
  'cobrem o essencial de localização, confirmado com o usuário.';

comment on column terrains.projeto_origem_id is
  'Setado quando status = transformado_projeto (fluxo "Transformar em '
  'Projeto" de TerrainDetail.jsx). Nullable, sem on delete cascade — '
  'segue a convenção geral de FK deste projeto (ver 0001).';

-- 3. Índice composto (docs/SCHEMA_PLAN.md secao 4).
create index terrains_tenant_id_status_idx
  on terrains (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_terrains_updated_at
  before update on terrains
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Grants explicitos. Mesmo padrao de 0007_projects.sql/0008_units.sql:
--    nao confiar no default privilege do schema, conceder
--    select/insert/update explicitamente a `authenticated`, nada a `anon`
--    (sem fluxo publico nesta tabela).
-- ---------------------------------------------------------------------
grant select, insert, update on public.terrains to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `terrains` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
