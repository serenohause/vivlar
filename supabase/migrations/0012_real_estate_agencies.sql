-- 0012_real_estate_agencies.sql
-- CRM/Vendas: `real_estate_agencies` — imobiliária parceira (do original
-- `src/pages/RealEstateAgencies.jsx`). Existe antes de `brokers` porque
-- `brokers.real_estate_agency_id` referencia esta tabela (FK nullable,
-- setada quando o corretor é do tipo `imobiliaria`).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

-- 1. Enum de status da imobiliária. Confirmado em
--    `src/pages/RealEstateAgencies.jsx` (Select de status no dialog:
--    `ATIVA`/`INATIVA`).
create type agency_status as enum (
  'ativa',
  'inativa'
);

-- 2. real_estate_agencies
create table real_estate_agencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Identificação
  name text not null,
  cnpj text,
  email text,
  phone text,
  address text,
  contact_person text,

  -- Comercial
  commission_percentage numeric(5, 2) not null default 30,
  status agency_status not null default 'ativa',

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

comment on table real_estate_agencies is
  'Imobiliária parceira, vinculada a corretores do tipo "imobiliaria" '
  '(brokers.real_estate_agency_id). commission_percentage é o quanto a '
  'imobiliária fica da comissão total; o corretor fica com o restante via '
  'brokers.commission_split.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4). Não listado
--    explicitamente no plano da leva, mas toda tabela com tenant_id precisa
--    de ao menos um índice composto começando por ele (CLAUDE.md) — status
--    é o filtro mais comum na tela de listagem (`agencies.filter(a =>
--    a.status === 'ATIVA')`, usado em Brokers.jsx).
create index real_estate_agencies_tenant_id_status_idx
  on real_estate_agencies (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_real_estate_agencies_updated_at
  before update on real_estate_agencies
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.real_estate_agencies to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `real_estate_agencies` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
