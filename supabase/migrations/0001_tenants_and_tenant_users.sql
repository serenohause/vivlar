-- 0001_tenants_and_tenant_users.sql
-- Fundação multitenant: tabela raiz `tenants` + vínculo humano<->tenant
-- `tenant_users` (equipe interna, clientes e investidores compartilham a
-- mesma tabela de vínculo; o que diferencia o acesso é a RLS, não o schema
-- — ver docs/SCHEMA_PLAN.md secao 1).
--
-- CONVENCAO PARA PROXIMAS MIGRATIONS (decidido com o usuario):
-- toda FK de `tenant_id` em tabelas de negocio usa `references tenants(id)`
-- SEM `on delete cascade`. O default do Postgres (`NO ACTION`, equivalente
-- a RESTRICT para este efeito) deve ser mantido: nao e possivel apagar um
-- tenant que ainda tem dados vinculados. Offboarding de tenant e um
-- processo manual, nunca uma operacao de um clique via CASCADE.
--
-- RLS: NAO configurada nesta migration. E responsabilidade do subagente
-- `rls-guardian` (proxima etapa) habilitar RLS e escrever as policies para
-- `tenants` e `tenant_users`, com teste de isolamento correspondente.

-- 1. Extensao para gen_random_uuid()
create extension if not exists "pgcrypto";

-- 2. Enum de papel dentro do tenant
create type tenant_role as enum (
  'admin',
  'comercial',
  'administrativo',
  'cliente',
  'investidor'
);

-- 3. Enum de status do vinculo usuario<->tenant
create type tenant_user_status as enum (
  'invited',
  'active',
  'suspended'
);

-- 4. Funcao utilitaria para manter updated_at atualizado
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 5. tenants — raiz do sistema (uma incorporadora/construtora cliente da
--    plataforma). Tabela global: nao tem tenant_id porque ela PROPRIA e a
--    raiz de isolamento de todas as demais tabelas de negocio.
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table tenants is
  'Raiz do sistema multitenant. Cada linha e uma incorporadora/construtora '
  'cliente da plataforma. Tabela global, sem tenant_id.';

create trigger set_tenants_updated_at
  before update on tenants
  for each row
  execute function set_updated_at();

-- 6. tenant_users — vinculo humano<->tenant. Alimenta o custom claim
--    tenant_id no JWT (hook de access token do Supabase); sem uma linha
--    aqui o usuario nao carrega tenant_id no token e a RLS das demais
--    tabelas nao tem como funcionar.
create table tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references auth.users(id),
  role tenant_role not null,
  status tenant_user_status not null default 'invited',
  invited_by_user_id uuid references auth.users(id),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table tenant_users is
  'Vinculo humano<->tenant, usado para todo tipo de pessoa associada a um '
  'tenant (equipe interna, cliente comprador, investidor). Fonte do custom '
  'claim tenant_id no JWT.';

create index tenant_users_tenant_id_role_idx
  on tenant_users (tenant_id, role);

create trigger set_tenant_users_updated_at
  before update on tenant_users
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `tenants` e `tenant_users` ainda NAO tem Row Level
-- Security habilitada. Isso deve ser feito pelo subagente `rls-guardian`
-- na proxima etapa, junto com o teste de isolamento correspondente, antes
-- de qualquer dado real trafegar por essas tabelas.
-- ---------------------------------------------------------------------
