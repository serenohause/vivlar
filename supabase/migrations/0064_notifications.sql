-- 0064_notifications.sql
-- Módulo 15 (Notificações). No original existe um `notificationService.jsx`
-- centralizado com 11 funções, mas só 2 (`notifyInstallmentPaid`/
-- `notifyInstallmentCancelled`, usadas em `FinanceDetail.jsx`) são
-- chamadas de verdade — as outras 9 são código morto, nenhuma tela as
-- invoca. As notificações que de fato disparam vêm de `Notification.
-- create()` direto em 6 pontos do código (`FinanceDetail.jsx` via as 2
-- funções do service, `CRM.jsx`, `CommissionDetail.jsx`,
-- `unitStatusHelpers.jsx`/`UnitDetail.jsx`, `MaintenanceDetail.jsx`,
-- `ClientMaintenance.jsx`), confirmadas por leitura direta de cada
-- arquivo — nenhuma inventada aqui.
--
-- ACHADO DE AUDITORIA (fora de escopo desta migration, reportado para
-- quem portar as chamadas de criação): `LeadForm.jsx` (espelho de vendas
-- público) também chama `Notification.create()` direto (3 pontos:
-- interesse/reserva/lista de espera, audience=ADMIN_ONLY), mas as RPCs
-- públicas que portam esse fluxo (`create_public_lead`/
-- `create_public_reservation`, 0059_rls_espelho_vendas.sql) NUNCA
-- inserem em notifications — chamada não portada, código morto também
-- neste projeto até hoje. Não resolvido aqui (é decisão de RPC/RLS, não
-- de schema); esta migration só garante que a tabela suporta o caso
-- (audience=ADMIN_ONLY, created_by_user_id nulo) se um dia for portado.
--
-- DOIS FORMATOS DE PAYLOAD DIFERENTES no original, unificados aqui numa
-- tabela só (decisão já registrada em docs/ARCHITECTURE.md, seção
-- "Decisões de limpeza"):
--
-- 1) "Mural interno" (maioria dos pontos acima): title/message/type
--    (enum fechado de 9 categorias de negócio)/event_key/severity/
--    audience/link_route/entity_type+entity_id/meta/status/read_at/
--    read_by_user_id/soft-delete. Confirmado em `Notifications.jsx`
--    que é um mural COMPARTILHADO por tenant — não existe "lida por
--    usuário X" individual: se um admin marca como lida ou apaga, some
--    para todo mundo. Por isso status/read_at/read_by_user_id/
--    is_deleted são campos da própria linha, não uma tabela de leitura
--    por usuário à parte (seria menos fiel ao original, que é mais
--    simples que isso).
--
-- 2) "Notificação pessoal pro cliente" (`MaintenanceDetail.jsx`,
--    `ClientMaintenance.jsx`): user_id (FK direto pro destinatário) +
--    title/message/type (valores livres tipo MAINTENANCE_CREATED,
--    completamente fora do enum do modo 1) + related_id (solto, sem
--    FK). Nunca usa severity/audience/event_key/link_route/entity_*.
--
-- `type`: por causa do choque de vocabulário entre os dois modos (9
-- categorias maiúsculas de negócio vs. MAINTENANCE_* livre, sem
-- interseção), optei por `text not null` em vez de enum fechado. Um
-- enum único misturando os dois cresceria mal a cada novo tipo de
-- notificação pessoal (equivalente a alterar o enum a cada feature nova
-- de um domínio que não é o "mural"). Documentado aqui, não é descuido.
--
-- CHECK `chk_notifications_mode`: garante que a linha faça sentido em
-- pelo menos um dos dois modos (audience preenchido = mural, OU user_id
-- preenchido = pessoal). Não impede os dois preenchidos ao mesmo tempo
-- (não é mutuamente exclusivo no original, então não travamos isso
-- aqui).
--
-- `event_key`: sem constraint de unicidade. O original não garante
-- unicidade real (muitos event_keys embutem `Date.now()`, e os que não
-- embutem, tipo `deal_created_${deal.id}`, nunca tiveram idempotência
-- de fato aplicada) — inventar uma constraint rígida agora arrisca
-- quebrar um padrão de uso que nunca foi testado dessa forma.
--
-- `entity_id`/`related_id`: referência polimórfica solta, sem FK real —
-- mesmo padrão já aceito em outras tabelas do projeto para referência
-- polimórfica (ex: `documents`).
--
-- RLS: NÃO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento
-- correspondente. Ponto de atenção para essa etapa: o modo "mural" tem
-- regra de visibilidade por audience x papel do usuário (confirmado em
-- Notifications.jsx: ADMINISTRADOR/USUARIO veem INTERNAL_ONLY+ALL+
-- ADMIN_ONLY; CLIENTE vê só CLIENT_ONLY+ALL) — não é só isolamento por
-- tenant_id, é diferenciação de escopo dentro do mesmo tenant, mesmo
-- espírito do achado já registrado em support_tickets (0062). O modo
-- "pessoal" some por completo do mural — visibilidade deveria ser
-- restrita a user_id = auth.uid() (mais admin, se o produto quiser).

-- 1. Enum de severidade (só modo mural).
create type notification_severity as enum (
  'INFO',
  'ALERTA',
  'CRITICO'
);

-- 2. Enum de audiência (só modo mural). 4 valores confirmados em
-- Notifications.jsx (o DOMAIN_MAP.md estava incompleto, só listava 2).
create type notification_audience as enum (
  'INTERNAL_ONLY',
  'ADMIN_ONLY',
  'ALL',
  'CLIENT_ONLY'
);

-- 3. Enum de status de leitura do mural (só modo mural — modo pessoal
-- nunca lê/escreve este campo no original).
create type notification_status as enum (
  'NOVA',
  'LIDA'
);

-- 4. notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  title text not null,
  message text not null,
  type text not null,

  -- Modo "mural interno" — nullable, modo "pessoal" nunca usa.
  severity notification_severity,
  audience notification_audience,
  event_key text,
  link_route text,
  entity_type text,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  status notification_status not null default 'NOVA',
  read_at timestamptz,
  read_by_user_id uuid references auth.users(id),

  -- Modo "notificação pessoal pro cliente" — nullable, modo "mural"
  -- nunca usa.
  user_id uuid references auth.users(id),
  related_id uuid,

  -- Soft-delete padrão do projeto. Globais na própria linha (mural
  -- compartilhado por tenant, não leitura/exclusão por usuário).
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_notifications_mode
    check (audience is not null or user_id is not null)
);

comment on table notifications is
  'Unifica os 2 formatos de payload do original: "mural interno" '
  '(title/message/type de 9 categorias/severity/audience/event_key/'
  'link_route/entity_type+entity_id/meta) e "notificação pessoal pro '
  'cliente" (user_id/title/message/type livre/related_id). Mural é '
  'COMPARTILHADO por tenant (status/read_at/is_deleted são da própria '
  'linha, não por usuário — confirmado em Notifications.jsx). tenant_id '
  'sempre presente, mesmo no modo pessoal (nasce do contexto de quem '
  'cria, igual a support_tickets/0062).';

comment on column notifications.type is
  'Texto livre, não enum: os 2 modos usam vocabulários sem interseção '
  '(9 categorias maiúsculas de negócio no mural vs. MAINTENANCE_* livre '
  'no pessoal). Um enum único cresceria mal a cada notificação pessoal '
  'nova. Valores do mural confirmados em Notifications.jsx: FINANCEIRO, '
  'COMISSAO, CRM, VENDA, UNIDADE, INVESTIMENTO, INADIMPLENCIA, '
  'DOCUMENTOS, SISTEMA.';

comment on column notifications.audience is
  'Só modo mural. Nullable porque o modo pessoal (user_id preenchido) '
  'nunca usa audience — o destinatário já é direto.';

comment on column notifications.user_id is
  'Só modo pessoal (MaintenanceDetail.jsx/ClientMaintenance.jsx). '
  'Nullable porque o modo mural nunca usa — é compartilhado por tenant, '
  'sem destinatário único.';

comment on column notifications.event_key is
  'Sem constraint de unicidade — o original nunca garantiu idempotência '
  'real (muitos event_keys embutem Date.now()). Campo de apoio, não '
  'fonte de verdade para deduplicação.';

comment on constraint chk_notifications_mode on notifications is
  'Garante que a linha faça sentido em pelo menos um dos 2 modos: '
  'audience preenchido (mural) ou user_id preenchido (pessoal). Não é '
  'mutuamente exclusivo — o original nunca impediu os dois juntos.';

-- 5. Índices compostos (tenant_id primeiro, padrão do projeto).
create index notifications_tenant_id_created_at_idx
  on notifications (tenant_id, created_at);

create index notifications_tenant_id_status_idx
  on notifications (tenant_id, status);

create index notifications_tenant_id_user_id_idx
  on notifications (tenant_id, user_id)
  where user_id is not null;

create index notifications_tenant_id_audience_idx
  on notifications (tenant_id, audience)
  where audience is not null;

-- 6. Trigger de updated_at (reutiliza a função criada em 0001, não recria).
create trigger set_notifications_updated_at
  before update on notifications
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explícitos. Mesmo padrão de 0007/0008/0024/0030/0042/0060/0062:
-- não confiar no default privilege do schema, conceder select/insert/
-- update explicitamente a `authenticated`, nada a `anon` (o único fluxo
-- anônimo que tocaria esta tabela, LeadForm.jsx, não está portado nas
-- RPCs públicas — ver achado no topo). Sem delete: remoção é sempre
-- soft-delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `notifications` ainda NÃO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na próxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Ver nota de escopo dentro do tenant no
-- comentário de topo (mural por audience x papel; pessoal por user_id).
-- ---------------------------------------------------------------------
