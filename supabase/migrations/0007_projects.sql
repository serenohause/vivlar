-- 0007_projects.sql
-- Catálogo: `projects` — empreendimento (do original `src/pages/Projects.jsx`
-- e `src/pages/ProjectDetail.jsx`, só a aba de informações básicas). Fora de
-- escopo aqui (confirmado com o usuário): Resultado Operacional
-- (`total_construction_cost`/`total_indirect_costs`, aba financeira do
-- projeto — módulo futuro) e `broker_responsavel_id` (depende de `brokers`,
-- módulo futuro de CRM).
--
-- Campos de marketing público (`description_public`, `caracteristicas`,
-- `implantacao_svg_url`, `mcmv_faixa`, `entrada_min`, `valor_min`,
-- `valor_max`, `parcela_aprox`, `subsidio_aprox`, `reserva_horas`,
-- `whatsapp_principal`) confirmados contra `src/components/espelho/*` e
-- `src/pages/EspelhoVendas.jsx` (site público "espelho de vendas") —
-- existem e são usados no original, mesmo sem aparecer no dialog de
-- criação/edição de `Projects.jsx`. Nenhuma policy de acesso anônimo é
-- criada nesta migration (isso é RLS, do `rls-guardian`; quando existir,
-- vai restringir a `is_public = true`).
--
-- ORDEM DE CRIAÇÃO DO CATÁLOGO (decisão do schema-architect, documentada
-- aqui e repetida em 0009_terrains.sql): `projects` é criada ANTES de
-- `terrains` porque `terrains.projeto_origem_id` referencia `projects(id)`
-- (FK nullable, setada quando um terreno é transformado em projeto). Criar
-- nesta ordem evita uma migration extra só para essa FK.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), tabela por tabela, com teste de isolamento
-- correspondente — igual ao padrão de 0001.

-- 1. Enum de status do projeto. `totalmente_vendido` confirmado em
--    `src/components/shared/services/projectService.jsx` (`100_VENDIDO`,
--    usado como filtro de status). `ENCERRADO` (legado, migrado para
--    `ENTREGUE` por `migrateProjectStatus` no original) não vira valor de
--    enum aqui — dado legado de uma migração de dados do Base44, não um
--    status válido no schema novo.
create type project_status as enum (
  'planejamento',
  'em_obras',
  'em_vendas',
  'totalmente_vendido',
  'entregue'
);

-- 2. projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Identificação
  code text not null,
  name text not null,
  address text,
  city text,
  state text,
  slug text,
  total_units integer,
  status project_status not null default 'planejamento',
  start_sales_at date,
  closed_at date,
  cycle_start_date date,
  cycle_end_date date,
  notes text,

  -- Espelho de vendas (site público)
  is_public boolean not null default false,
  description_public text,
  caracteristicas text[],
  implantacao_svg_url text,
  mcmv_faixa text,
  entrada_min numeric(14, 2),
  valor_min numeric(14, 2),
  valor_max numeric(14, 2),
  parcela_aprox numeric(14, 2),
  subsidio_aprox numeric(14, 2),
  reserva_horas integer not null default 24,
  whatsapp_principal text,

  -- Soft delete
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  -- Auditoria
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, slug),
  unique (tenant_id, code)
);

comment on table projects is
  'Empreendimento (incorporação). Núcleo do catálogo — só campos básicos e '
  'de marketing público; Resultado Operacional e broker_responsavel_id '
  'ficam para módulos futuros (financeiro do projeto, CRM).';

comment on column projects.reserva_horas is
  'Horas que uma unidade fica travada em nome do lead ao reservar via '
  'espelho de vendas público. Default 24, igual ao fallback usado no '
  'original (src/components/espelho/UnitModal.jsx, LeadForm.jsx).';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4). `unique(tenant_id,
--    slug)` acima já cobre o índice único (tenant_id, slug); o índice
--    abaixo cobre o filtro por status.
create index projects_tenant_id_status_idx
  on projects (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_projects_updated_at
  before update on projects
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Grants explicitos. NAO confiar no default privilege do schema —
--    0003/0004 corrigiram o default para o role `postgres`, mas isso ja
--    causou um erro real de auditoria antes (grant residual encontrado
--    pelo rls-guardian). Toda tabela nova concede explicitamente o minimo
--    bruto que a RLS futura vai precisar: select/insert/update para
--    `authenticated`, nunca delete/truncate/references/trigger. `anon` nao
--    recebe nada aqui — nao ha fluxo publico/anonimo ainda (isso e
--    is_public + policy dedicada, que o rls-guardian cria depois).
-- ---------------------------------------------------------------------
grant select, insert, update on public.projects to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `projects` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
