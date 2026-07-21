-- 0011_clients.sql
-- CRM/Vendas: `clients` — cliente comprador (do original `src/pages/Clients.jsx`
-- e `src/pages/ClientDetail.jsx`). Núcleo do CRM: só os campos próprios do
-- cliente. Negociações (`deals`), atividades (`activities`) e comissões
-- (módulo futuro) ficam de fora desta tabela.
--
-- `user_id`: confirmado em `docs/DOMAIN_MAP.md` e no fluxo de
-- `src/pages/CRM.jsx` (createMutation/updateStageMutation) — quando um Deal
-- vira VENDIDO, o original convida um usuário (`base44.users.inviteUser`) e
-- vincula `Client.user_id` a ele. Nullable: a maioria dos clientes nunca
-- vira usuário do portal. Nenhuma lógica de convite é implementada aqui —
-- só a coluna, que é pré-requisito de schema para quando o portal do
-- cliente existir.
--
-- `unique(tenant_id, cpf)` parcial (`where cpf is not null`): CPF é
-- obrigatório no dialog de criação (`Clients.jsx`, campo `required`), mas
-- nullable no schema porque não há garantia de que todo registro histórico
-- tenha CPF preenchido (dado importado, por exemplo) — o "not null" fica a
-- cargo da validação de formulário (Zod), não do banco.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Identificação
  name text not null,
  cpf text,
  phone text,
  email text,
  address text,
  notes text,

  -- Vínculo com portal do cliente (Supabase Auth). Nullable e não usado
  -- ainda — ver comentário acima.
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

-- Índice único parcial (em vez de `unique(tenant_id, cpf)` na tabela): CPF
-- é nullable no schema (ver comentário acima), e um `unique` comum não
-- bloquearia múltiplos NULLs mesmo assim, mas a cláusula `where` deixa
-- explícita a intenção — só aplica a unicidade quando cpf está preenchido.
create unique index clients_tenant_id_cpf_uidx
  on clients (tenant_id, cpf)
  where cpf is not null;

comment on table clients is
  'Cliente comprador. Núcleo do CRM — negociações (deals), atividades e '
  'comissões ficam em tabelas próprias. user_id é o vínculo futuro com o '
  'portal do cliente (Supabase Auth), ainda não usado por nenhuma tela.';

comment on column clients.user_id is
  'Vínculo com auth.users, setado quando um Deal vira "vendido" (convite '
  'automático no original) ou por convite manual em Settings. Nullable: a '
  'maioria dos clientes nunca acessa o portal.';

-- Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index clients_tenant_id_user_id_idx
  on clients (tenant_id, user_id);

-- Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_clients_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon` (sem fluxo publico/anonimo aqui).
-- ---------------------------------------------------------------------
grant select, insert, update on public.clients to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `clients` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
