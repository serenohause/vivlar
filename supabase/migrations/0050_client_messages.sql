-- 0050_client_messages.sql
-- Portal do Cliente (módulo 11): `client_messages` — mural de mensagens
-- entre a equipe da construtora e o cliente comprador, mostrado em
-- "Mensagens" no original `src/pages/ClientPortal.jsx` (linhas 148-155,
-- 219, 428-473).
--
-- ÓRFÃ NO ORIGINAL, confirmado por grep em todo `original-project/src`
-- (também registrado em `docs/DOMAIN_MAP.md` linha 280): `ClientMessage`
-- só aparece nesse único `.filter()` do Portal do Cliente — nenhuma tela,
-- nem admin nem cliente, tem `.create()`. Mesmo critério de
-- `construction_photos` (0049): criada mesmo assim porque é o que sustenta
-- a réplica fiel da tela (estado vazio real "Nenhuma mensagem ainda",
-- badge de não lidas sempre zerado no lançamento), não uma funcionalidade
-- nova de mensageria bidirecional real.
--
-- `direction`: só o literal `'TO_CLIENT'` aparece confirmado no código-fonte
-- (comparações em `msg.direction === 'TO_CLIENT'`, linhas 219, 454, 459).
-- O branch `else` da UI (linha 461, mostra "Você" como remetente) implica
-- claramente um segundo valor para mensagem do próprio cliente — nunca
-- escrito literalmente em lugar nenhum do `src` (sem `.create()` nenhum),
-- mas a UI já está pronta para os dois sentidos. Modelado como enum de 2
-- valores (`to_client`, `from_client`) por ser a leitura mais direta da
-- UI condicional — mesmo critério de "inferir do uso condicional sem
-- write path confirmado" já usado para `investors.status` (0041).
--
-- `from_user_name`: nome de quem enviou do lado da equipe (`msg.
-- from_user_name || 'Equipe Vivlar'`, linha 460) — só faz sentido quando
-- `direction = 'to_client'`; nullable, sem CHECK amarrando os dois (mesmo
-- critério de nullability sem constraint cruzada já usado em
-- maintenance_requests.scheduled_date, 0037).
--
-- `read_at`: nullable, usado para contar não lidas (`!m.read_at &&
-- m.direction === 'TO_CLIENT'`, linha 219) — sem nenhum `.update()`
-- confirmado que o preencha (mesmo critério de "campo lido mas sem write
-- path localizado", ex.: commissions.paid_at em 0024).
--
-- `created_date` do original (campo automático do Base44) mapeia para
-- `created_at` nesta migration — mesmo critério usado em toda tabela do
-- projeto (nenhuma tabela nova ganhou uma coluna `created_date` própria).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/.../0045/0048/0049.

-- 1. Enum de direção da mensagem. Só 'TO_CLIENT' confirmado no
--    código-fonte; 'FROM_CLIENT' inferido do branch condicional da UI
--    (ver comentário no topo do arquivo).
create type client_message_direction as enum (
  'to_client',
  'from_client'
);

-- 2. client_messages
create table client_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  client_id uuid not null references clients(id),

  direction client_message_direction not null,
  message text not null,

  -- Só relevante quando direction = 'to_client' — ver comentário no topo
  -- do arquivo.
  from_user_name text,

  read_at timestamptz,

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

comment on table client_messages is
  'Mural de mensagens entre equipe e cliente, exibido em "Mensagens" no '
  'Portal do Cliente (ClientPortal.jsx). Órfã no original: só leitura '
  '(.filter()), nenhum .create() em nenhuma tela — sem fluxo real de envio '
  'ainda, mesmo critério de construction_photos (0049).';

comment on column client_messages.direction is
  'to_client = equipe->cliente (único literal confirmado no '
  'código-fonte, "TO_CLIENT"). from_client = cliente->equipe, inferido do '
  'branch condicional da UI ("Você" quando direction != TO_CLIENT), nunca '
  'escrito por nenhum .create() localizado.';

comment on column client_messages.from_user_name is
  'Nome de quem enviou do lado da equipe, exibido quando direction = '
  'to_client (fallback "Equipe Vivlar" na UI se vazio). Nullable, sem '
  'constraint cruzada com direction.';

-- 3. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index client_messages_tenant_id_created_at_idx
  on client_messages (tenant_id, created_at);

create index client_messages_tenant_id_client_id_idx
  on client_messages (tenant_id, client_id);

create index client_messages_tenant_id_read_at_idx
  on client_messages (tenant_id, read_at);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_client_messages_updated_at
  before update on client_messages
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/.../0048/0049: nao confiar
-- no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.client_messages to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `client_messages` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Mesmo padrao esperado de 0017/.../0045:
-- select restrito ao tenant certo via claim, inclusive role `cliente` (só
-- as próprias mensagens, via client_id -> clients.user_id = auth.uid());
-- insert/update restrito a quem for decidido operar isso quando o envio
-- existir de verdade (equipe interna e/ou o próprio cliente marcando
-- read_at), sem delete.
-- ---------------------------------------------------------------------
