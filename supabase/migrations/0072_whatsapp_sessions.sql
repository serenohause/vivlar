-- 0072_whatsapp_sessions.sql
-- Módulo "Sessões WhatsApp" (`original-project/src/pages/
-- WhatsAppSessions.jsx`). Tela puramente de LEITURA no original: a única
-- chamada à entidade é `base44.entities.WhatsAppSession.filter(
-- { is_deleted: false }, "-last_message_at", 100)`. Confirmado por leitura
-- integral do arquivo e busca em todo o repo (frontend + as 22 edge
-- functions do `original-project`): NENHUM código cria, atualiza ou envia
-- mensagem via esta entidade. É uma tabela de estado que, no sistema
-- original, seria alimentada por um bot externo de WhatsApp que nunca foi
-- trazido para este repositório (ou uma feature que ficou pela metade) —
-- decisão explícita do usuário: não inventar esse bot/integração aqui,
-- só replicar schema+RLS+tela de leitura com a mesma fidelidade (nenhuma).
--
-- Sem `.jsonc` de entidade exportado para `WhatsAppSession` (diferente de
-- `PublicLead`) — campos abaixo vêm só de inferência de uso no JSX:
-- phone, flow_type (enum MANUTENCAO/CORRETOR/INDEFINIDO), state (texto
-- livre, chave de state machine sem vocabulário fechado conhecido —
-- exemplos vistos: "aguardando_cpf", "menu_principal"), status (enum
-- ATIVA/CONCLUIDA/EXPIRADA/ESCALADA), last_message_at.
--
-- `state` como text (não enum): mesma decisão já tomada em
-- `notifications.type` (0064) quando o vocabulário de valores não é
-- fechado/conhecido. Uma state machine de bot de WhatsApp ganha estados
-- novos a cada ajuste de fluxo de conversa; travar isso em enum forçaria
-- alterar o schema a cada mudança de comportamento de um bot que nem
-- existe neste código-fonte.
--
-- Enums em minúsculo (`manutencao`/`corretor`/`indefinido`,
-- `ativa`/`concluida`/`expirada`/`escalada`): o original usa maiúsculo
-- (MANUTENCAO, ATIVA, ...), mas mantém a convenção já estabelecida no
-- schema novo (ver `deal_sales_stage`/`unit_admin_status`/
-- `public_lead_status` em 0008/0014/0057) — tradução de valor para a UI
-- fica a cargo da aplicação, não do banco.
--
-- SEM RPC de criação/atualização/envio de mensagem, de propósito: não há
-- nenhuma lógica de negócio a proteger (nenhum código no original decide
-- "quando" ou "como" uma sessão nasce ou muda de estado — isso viveria no
-- bot externo hipotético, fora deste repositório). Criar uma RPC aqui
-- seria inventar um contrato de escrita que não existe em lugar nenhum do
-- sistema original. O único caminho de escrita é INSERT/UPDATE direto por
-- quem tiver RLS de permissão (equipe interna do tenant, via
-- rls-guardian) — mesmo espírito do "sem mecanismo de escrita" já
-- registrado em notifications (0064) e finance_checkup (0068) para os
-- casos em que não existe regra de negócio a validar.
--
-- last_message_at NULLABLE: o JSX trata explicitamente o caso ausente
-- (`session.last_message_at ? format(...) : "—"`), então uma sessão pode
-- existir sem nunca ter tido mensagem registrada (ex: criada pelo bot no
-- primeiro contato, antes de qualquer mensagem ser persistida).
--
-- RLS: NÃO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` na próxima etapa, com teste de isolamento correspondente,
-- antes de qualquer dado real trafegar por esta tabela.

-- 1. Enum de tipo de fluxo do bot.
create type whatsapp_flow_type as enum (
  'manutencao',
  'corretor',
  'indefinido'
);

-- 2. Enum de status da sessão.
create type whatsapp_session_status as enum (
  'ativa',
  'concluida',
  'expirada',
  'escalada'
);

-- 3. whatsapp_sessions
create table whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  phone text not null,
  flow_type whatsapp_flow_type not null default 'indefinido',
  state text,
  status whatsapp_session_status not null default 'ativa',
  last_message_at timestamptz,

  -- Soft delete padrão do projeto.
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table whatsapp_sessions is
  'Espelha o estado de conversas de um bot de WhatsApp externo que não '
  'existe neste repositório (nenhum código do original — frontend ou '
  'edge functions — cria/atualiza esta entidade). Tela original '
  '(WhatsAppSessions.jsx) é só leitura: filter(is_deleted=false, '
  '-last_message_at, 100). Sem RPC de escrita de propósito: não há '
  'lógica de negócio a proteger, só INSERT/UPDATE direto via RLS.';

comment on column whatsapp_sessions.state is
  'Chave livre de state machine (ex: "aguardando_cpf", '
  '"menu_principal"), não enum: vocabulário não é fechado/conhecido — '
  'mesma decisão já tomada em notifications.type (0064) para casos '
  'assim. Cresceria mal em enum a cada ajuste de fluxo de conversa do '
  'bot.';

comment on column whatsapp_sessions.last_message_at is
  'Nullable: o original trata explicitamente o caso ausente '
  '(fallback "—" na UI) — sessão pode existir sem mensagem registrada '
  'ainda.';

-- 4. Índices compostos (tenant_id primeiro, padrão do projeto).
create index whatsapp_sessions_tenant_id_last_message_at_idx
  on whatsapp_sessions (tenant_id, last_message_at desc);

create index whatsapp_sessions_tenant_id_status_idx
  on whatsapp_sessions (tenant_id, status);

create index whatsapp_sessions_tenant_id_flow_type_idx
  on whatsapp_sessions (tenant_id, flow_type);

-- 5. Trigger de updated_at (reutiliza a função criada em 0001, não recria).
create trigger set_whatsapp_sessions_updated_at
  before update on whatsapp_sessions
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explícitos. Mesmo padrão de 0007/0008/0024/0030/0042/0060/0062/
-- 0064: não confiar no default privilege do schema. Só `authenticated`
-- (equipe interna do tenant) — nenhum fluxo `anon` toca esta tabela.
-- Sem delete: remoção é sempre soft-delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.whatsapp_sessions to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `whatsapp_sessions` ainda NÃO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na próxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
