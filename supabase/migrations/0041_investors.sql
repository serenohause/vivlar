-- 0041_investors.sql
-- Investidores: `investors` — cadastro de investidor externo (PF/PJ) que
-- aporta capital em projetos da construtora (do original
-- `src/pages/Investors.jsx`; docs/DOMAIN_MAP.md seção "Investor").
--
-- ESCOPO (módulo 10): só o lado interno/admin — a equipe da construtora
-- cadastra e gerencia tudo. Sem portal de autoatendimento do investidor
-- nesta rodada (fica para um módulo futuro de Portal, junto com o do
-- Cliente).
--
-- `documento`/`telefone`: texto livre, sem validação de formato/máscara no
-- banco — mesmo critério já usado em `clients.document`/`clients.phone` e
-- `brokers.document`/`brokers.phone`.
--
-- `tipo` (PF/PJ) e `status` (ATIVO/INATIVO): confirmados em Investors.jsx.
-- `status` default 'ATIVO' — único valor observado no original (não há
-- fluxo de inativação confirmado no `src`, mas o campo existe no form de
-- cadastro), mesmo critério de "provável complemento binário" já usado em
-- outras entidades (ex.: `clients.status`).
--
-- `user_id`: link opcional para quando o investidor tiver login próprio
-- (futuro módulo de Portal). Nullable, sem UI de convite nesta rodada —
-- sempre null na prática até lá. Existe para corrigir um bug real do
-- original: nas telas do "portal do investidor" (fora de escopo, nunca
-- implementadas no `src` exportado) o filtro usado era
-- `investor_id === currentUser.id` (comparando com `User.id`), enquanto as
-- telas administrativas sempre trataram `investor_id` como FK para
-- `Investor.id`. Decisão desta migração: toda FK `investor_id` no schema
-- novo aponta sempre para `investors.id` — `investors.user_id` é o único
-- lugar onde o vínculo com `auth.users` aparece, e só quando/se o portal
-- for construído.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/0017/0023/0027/0032/0036/0039.

-- 1. Enum de tipo de investidor. Confirmado em Investors.jsx.
create type investor_type as enum (
  'PF',
  'PJ'
);

-- 2. Enum de status do investidor. Confirmado em Investors.jsx.
create type investor_status as enum (
  'ATIVO',
  'INATIVO'
);

-- 3. investors
create table investors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  nome text not null,
  documento text,
  email text,
  telefone text,
  tipo investor_type not null,
  status investor_status not null default 'ATIVO',
  observacoes text,

  -- Link opcional para o futuro módulo de Portal do Investidor. Sempre
  -- null nesta rodada (ver comentário no topo do arquivo).
  user_id uuid references auth.users(id),

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

comment on table investors is
  'Cadastro de investidor externo (PF/PJ) que aporta capital em projetos '
  '(Investors.jsx). Escopo desta rodada: só lado interno/admin — a equipe '
  'da construtora cadastra e gerencia tudo, sem portal de autoatendimento.';

comment on column investors.user_id is
  'Link opcional para quando o investidor tiver login próprio (futuro '
  'módulo de Portal, junto com o do Cliente). Sempre null nesta rodada, '
  'sem UI de convite. Corrige um bug real do original onde o "portal do '
  'investidor" comparava investor_id com User.id em vez de Investor.id — '
  'aqui toda FK investor_id aponta sempre para investors.id.';

-- 4. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index investors_tenant_id_created_at_idx
  on investors (tenant_id, created_at);

create index investors_tenant_id_status_idx
  on investors (tenant_id, status);

create index investors_tenant_id_user_id_idx
  on investors (tenant_id, user_id);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_investors_updated_at
  before update on investors
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030/0034/0037:
-- nao confiar no default privilege do schema, conceder select/insert/
-- update explicitamente a `authenticated`, nada a `anon`. Sem delete:
-- exclusao e sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.investors to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `investors` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela. Mesmo padrao esperado de 0017/0027/0032/0036/0039:
-- select/insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera investidores no produto real), sem delete.
-- ---------------------------------------------------------------------
