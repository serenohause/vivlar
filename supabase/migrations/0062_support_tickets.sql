-- 0062_support_tickets.sql
-- Suporte (aba "Conta" de Settings.jsx): `support_tickets` — cobre por
-- ora só o caso de uso "solicitar exclusão de conta". `type` modelado
-- como enum aberto a crescer (não é um texto livre nem um enum
-- hiper-específico de exclusão), para acomodar outros tipos de ticket no
-- futuro sem trocar a modelagem da coluna, mesmo que hoje só exista um
-- valor.
--
-- tenant_id: derivado do usuário que abre o ticket (claim tenant_id do
-- JWT), não anônimo — mesma observação já feita para `public_leads`
-- (0057) mas no sentido oposto: aqui o padrão comum do projeto (claim de
-- JWT) se aplica normalmente, sem RPC/trigger especial de resolução.
--
-- user_name nullable: hoje não existe "nome completo" estruturado de
-- usuário em nenhuma tabela do projeto (lacuna já registrada em
-- AppShell.tsx/getInitials) — fica NULL até essa lacuna ser resolvida em
-- outro módulo.
--
-- SEM soft-delete: ticket resolvido vira `status = 'resolvido'`, não é
-- apagado — mesmo raciocínio de `tenant_invites` (status já cumpre o
-- papel que soft-delete cumpriria).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente.

-- 1. Enum de tipo de ticket (aberto a crescer — só 1 valor por ora).
create type support_ticket_type as enum (
  'account_deletion'
);

-- 2. Enum de prioridade.
create type support_ticket_priority as enum (
  'low',
  'medium',
  'high'
);

-- 3. Enum de status do ticket.
create type support_ticket_status as enum (
  'aberto',
  'em_andamento',
  'resolvido'
);

-- 4. support_tickets
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  user_id uuid not null references auth.users(id),
  user_email text not null,
  user_name text,

  type support_ticket_type not null,
  subject text not null,
  description text not null,

  priority support_ticket_priority not null default 'medium',
  status support_ticket_status not null default 'aberto',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table support_tickets is
  'Ticket de suporte aberto por um usuário do tenant. Cobre por ora só o '
  'caso de uso "solicitar exclusão de conta" (aba Conta de Settings.jsx); '
  'type é um enum aberto a crescer para outros tipos futuros. tenant_id '
  'vem do claim de JWT de quem abre o ticket (fluxo autenticado normal, '
  'não anônimo).';

comment on column support_tickets.user_name is
  'Nullable: não existe nome completo estruturado de usuário em nenhuma '
  'tabela do projeto ainda (lacuna já registrada em AppShell.tsx/'
  'getInitials). Fica NULL até essa lacuna ser resolvida em outro módulo.';

comment on column support_tickets.type is
  'Enum aberto a crescer — hoje só account_deletion, mas nomeado para '
  'acomodar outros tipos de ticket sem remodelar a coluna.';

-- 5. Índices compostos (tenant_id primeiro, padrão do projeto).
create index support_tickets_tenant_id_created_at_idx
  on support_tickets (tenant_id, created_at);

create index support_tickets_tenant_id_status_idx
  on support_tickets (tenant_id, status);

create index support_tickets_tenant_id_user_id_idx
  on support_tickets (tenant_id, user_id);

-- 6. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_support_tickets_updated_at
  before update on support_tickets
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0030/0042/0060: nao
-- confiar no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: resolucao
-- de ticket e sempre UPDATE de status, nunca remocao de linha.
-- ---------------------------------------------------------------------
grant select, insert, update on public.support_tickets to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `support_tickets` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Esperado: quem abre o ticket enxerga só
-- os proprios (select/insert restrito a user_id = auth.uid() do tenant
-- certo), enquanto admin do tenant enxerga/gerencia todos os do tenant —
-- diferenciacao de escopo dentro do mesmo tenant, nao so isolamento entre
-- tenants.
-- ---------------------------------------------------------------------
