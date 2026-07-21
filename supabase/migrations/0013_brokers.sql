-- 0013_brokers.sql
-- CRM/Vendas: `brokers` — corretor, autônomo ou vinculado a uma imobiliária
-- (do original `src/pages/Brokers.jsx` e
-- `src/components/crm/CreateBrokerInline.jsx`).
--
-- `cpf` SEM constraint de unicidade nesta migration: o original
-- (`CreateBrokerInline.jsx`) valida unicidade de CPF via query no client
-- antes de criar (`Broker.filter({ cpf })`), mas isso não foi confirmado no
-- escopo desta leva (só `clients.cpf` teve unicidade parcial pedida
-- explicitamente). Pode ser adicionado depois via migration própria se
-- confirmado como regra de negócio real, não só validação incidental do
-- client.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

-- 1. Enum de tipo de corretor. Confirmado em `src/pages/Brokers.jsx`
--    (Select "Tipo de Corretor": AUTONOMO / IMOBILIARIA).
create type broker_type as enum (
  'autonomo',
  'imobiliaria'
);

-- 2. brokers
create table brokers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Identificação
  name text not null,
  cpf text,
  phone text,
  email text,

  -- Vínculo com imobiliária (quando type = 'imobiliaria')
  type broker_type not null default 'autonomo',
  real_estate_agency_id uuid references real_estate_agencies(id),

  -- Comissão
  commission_rate numeric(6, 4) not null default 0.05,
  commission_split numeric(5, 2) not null default 70,
  is_active boolean not null default true,

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

comment on table brokers is
  'Corretor de vendas, autônomo ou vinculado a uma imobiliária parceira '
  '(real_estate_agency_id). commission_rate é a taxa sobre o valor de venda '
  'da unidade; commission_split é o % que o corretor fica quando vinculado '
  'a uma imobiliária (o restante fica com a imobiliária, via '
  'real_estate_agencies.commission_percentage).';

comment on column brokers.real_estate_agency_id is
  'Nullable: só preenchido quando type = ''imobiliaria''. Corretor autônomo '
  'não tem imobiliária associada.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4). Não listados
--    explicitamente no plano da leva, mas toda tabela com tenant_id precisa
--    de ao menos um índice composto começando por ele (CLAUDE.md).
create index brokers_tenant_id_real_estate_agency_id_idx
  on brokers (tenant_id, real_estate_agency_id);

create index brokers_tenant_id_is_active_idx
  on brokers (tenant_id, is_active);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_brokers_updated_at
  before update on brokers
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.brokers to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `brokers` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
