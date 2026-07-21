-- 0008_units.sql
-- Catálogo: `units` — unidade dentro de um projeto (do original
-- `src/pages/Units.jsx` e `src/pages/UnitDetail.jsx`, só os campos
-- próprios da unidade — aba de informações básicas). Fora de escopo aqui
-- (confirmado com o usuário): abas de financeiro, vistoria, documentos e
-- timeline de atividades do `UnitDetail.jsx` original — pertencem a
-- módulos futuros (Financeiro, Vistorias, Documentos, CRM).
--
-- `active_deal_id` PROPOSITALMENTE NAO incluído nesta migration: no
-- original é uma FK para `Deal` (garante que uma unidade só tem 1 negócio
-- ativo por vez), mas `deals` ainda não existe (módulo de CRM é futuro —
-- ver docs/SCHEMA_PLAN.md secao 5, migration 0008 do plano original:
-- `units_active_deal_id`). Quando `deals` for criado, essa coluna entra
-- via `ALTER TABLE units ADD COLUMN active_deal_id ...` em migration
-- própria, seguindo exatamente o mesmo padrão de `tenant_id` sem `on
-- delete cascade` já estabelecido em 0001.
--
-- Campos de simulação MCMV pública (`entrada_minima`, `subsidio_simulado`,
-- `parcela_simulada`) e `observacoes_publica` confirmados em
-- `src/components/espelho/UnitModal.jsx` (modal de detalhe da unidade no
-- site público) — existem e são usados no original, mesmo sem aparecer no
-- dialog administrativo de `Units.jsx`.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), tabela por tabela, com teste de isolamento
-- correspondente — igual ao padrão de 0001.

-- 1. Enum de status comercial da unidade.
create type unit_status as enum (
  'disponivel',
  'reservada',
  'vendida',
  'bloqueada'
);

-- 2. Enum de status administrativo (pipeline MCMV) da unidade. Ordem
--    confirmada em src/pages/Units.jsx (ADMIN_STATUS_CONFIG) e
--    src/pages/ProjectDetail.jsx (ADMIN_STATUS_ORDER).
create type unit_admin_status as enum (
  'laudo_engenharia',
  'em_conformidade',
  'cliente_conforme',
  'contrato_caixa',
  'cartorio',
  'registro_pago',
  'registrado',
  'entrega_casa',
  'entregue',
  'distrato'
);

-- 3. units
create table units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  project_id uuid not null references projects(id),

  -- Identificação e características
  sku text not null,
  bloco text,
  tipologia text,
  area_m2 numeric(10, 2),
  area_lote_m2 numeric(10, 2),
  quartos integer,
  vagas integer,
  suites integer,
  pavimentos integer,
  posicao_solar text,

  -- Comercial
  list_price numeric(14, 2) not null,
  status unit_status not null default 'disponivel',
  admin_status unit_admin_status,
  notes text,

  -- Simulação MCMV pública (espelho de vendas) — fallback para os
  -- equivalentes de projects quando ausente (regra aplicada no frontend,
  -- não no banco: ver src/components/espelho/UnitModal.jsx).
  observacoes_publica text,
  entrada_minima numeric(14, 2),
  subsidio_simulado numeric(14, 2),
  parcela_simulada numeric(14, 2),

  -- Soft delete
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  -- Auditoria
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, project_id, sku)
);

comment on table units is
  'Unidade comercial de um projeto (SKU). Só campos próprios da unidade — '
  'financeiro, vistoria, documentos e timeline pertencem a módulos futuros. '
  'Sem active_deal_id ainda: depende de deals (CRM), fora desta leva.';

comment on column units.admin_status is
  'Pipeline administrativo/documental MCMV. Nullable: unidade recém-criada '
  'ainda não entrou no pipeline (sem default no original — ver '
  'src/pages/Units.jsx, formData não inclui admin_status na criação).';

-- 4. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index units_tenant_id_project_id_idx
  on units (tenant_id, project_id);

create index units_tenant_id_status_idx
  on units (tenant_id, status);

create index units_tenant_id_admin_status_idx
  on units (tenant_id, admin_status);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_units_updated_at
  before update on units
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Grants explicitos. Mesmo padrao de 0007_projects.sql: nao confiar no
--    default privilege do schema, conceder select/insert/update
--    explicitamente a `authenticated`, nada a `anon` (sem fluxo publico
--    ainda nesta tabela).
-- ---------------------------------------------------------------------
grant select, insert, update on public.units to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `units` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
