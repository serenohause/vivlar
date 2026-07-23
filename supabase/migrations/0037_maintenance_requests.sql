-- 0037_maintenance_requests.sql
-- Manutenção pós-entrega: `maintenance_requests` (assistência técnica depois
-- que a unidade é entregue ao cliente). Do original `src/pages/
-- AdminMaintenance.jsx` (lado interno/operador), `MaintenanceDetail.jsx`
-- (tela de detalhe/atualização) e `src/pages/ClientMaintenance.jsx` (lado
-- cliente, confirmado apenas para decidir nullability/defaults de campos
-- compartilhados — a tela de cliente em si NÃO faz parte desta rodada, ver
-- abaixo).
--
-- ESCOPO: só o lado interno/admin (equipe da construtora abre, agenda e
-- resolve chamados). O cliente final não abre o próprio chamado ainda (sem
-- portal do cliente no projeto) — `client_id` existe só como referência de
-- para quem é o chamado, preenchido pelo operador na criação.
--
-- `project_id`/`unit_id`/`client_id` NOT NULL: confirmado nos dois fluxos de
-- criação do original (createMutation em AdminMaintenance.jsx e
-- ClientMaintenance.jsx) — ambos sempre derivam `project_id` de
-- `unit.project_id` e sempre setam `client_id` (selecionado no form do
-- operador, ou o próprio cliente logado no portal). Nenhum
-- `MaintenanceRequest.create(...)` no `src` omite os três.
--
-- `title`/`description` NOT NULL: campos `required` no form em ambas as
-- telas de criação (AdminMaintenance.jsx linhas 726-742).
--
-- `category`: texto livre, default 'Outros' — 5 sugestões fixas no Select da
-- UI (Hidráulica/Elétrica/Estrutural/Acabamento/Outros), mas sem enum no
-- schema, mesmo critério já usado para `inspection_template_items.category`
-- (0034) e `payment_installments`/`commission_payments.payment_method`
-- (0020/0026).
--
-- `priority`: enum com 3 valores confirmados em PRIORITY_CONFIG
-- (AdminMaintenance.jsx/MaintenanceDetail.jsx): Baixa, Média, Alta. Default
-- 'media', mesmo default do form de criação ("Média").
--
-- `status`: enum com 6 valores confirmados em STATUS_CONFIG (mesmos dois
-- arquivos) e no Select de edição em MaintenanceDetail.jsx: ABERTO,
-- AGENDADO, EM_ANDAMENTO, AGUARDANDO_CLIENTE, RESOLVIDO, CANCELADO. Default
-- 'aberto'.
--
-- `suggested_date`/`scheduled_date`: `date` (não timestamptz) — ambos são
-- `<Input type="date">` no original (AdminMaintenance.jsx linha 786,
-- MaintenanceDetail.jsx linha 501, ClientMaintenance.jsx linha 442), sem
-- componente de hora. `suggested_date` é sugerida pelo cliente ao abrir (só
-- tem write path em ClientMaintenance.jsx, fora de escopo nesta rodada) —
-- mantida nullable no banco desde já, preenchida quando/se o portal do
-- cliente for construído. `scheduled_date` é a data que a equipe agenda —
-- nullable no banco; a regra "obrigatório quando status = AGENDADO" é
-- validada na UI/hook (handleSubmit em MaintenanceDetail.jsx linha 179), não
-- como constraint aqui, conforme pedido.
--
-- `opened_at`: timestamptz not null default now(). No original é setado
-- explicitamente pelo client (`new Date().toISOString()`) no momento do
-- create, sempre em paralelo a `created_at` — default now() cobre o mesmo
-- valor sem exigir que a aplicação sempre o envie.
--
-- `resolved_at`: timestamptz nullable, sem default. Carimbado pela aplicação
-- só quando o status transiciona para RESOLVIDO (updateMutation em
-- MaintenanceDetail.jsx linhas 108-110) — não há trigger de banco para isso,
-- mesmo critério já usado para campos "carimbados no momento certo pela
-- aplicação" em outras tabelas (ex.: inspections.totals_*, 0034).
--
-- `responsible_user_id`: nullable — form de edição em MaintenanceDetail.jsx
-- permite "Nenhum" (SelectItem value={null} linha 520).
--
-- `created_by_user_id`/`updated_by_user_id`: nullable, mesmo critério de
-- FKs de auditoria em todas as tabelas anteriores (documents/inspections),
-- mesmo sempre preenchido na prática pelos dois fluxos de criação do
-- original.
--
-- `operator_notes`: texto livre, nullable — notas internas do operador
-- (Textarea em MaintenanceDetail.jsx linha 539).
--
-- `photos`: `text[] not null default '{}'`, mesmo padrão de array de URLs
-- do original (campo direto na entidade, não uma tabela de mídia separada
-- como `inspection_media` — MaintenanceRequest não tem uma entidade de mídia
-- própria no original). Guarda o PATH do objeto no bucket privado
-- `maintenance-photos` (0038_maintenance_requests_storage.sql), mesma
-- convenção de `documents.file_url`/`inspection_media.file_url` (path, não
-- URL pública). Opcional na criação pelo operador
-- (`photos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined` em
-- AdminMaintenance.jsx linha 204); obrigatório (mínimo 1) na criação pelo
-- cliente (ClientMaintenance.jsx linhas 196-199) — essa regra de "mínimo 1
-- foto" é de fluxo do portal do cliente (fora de escopo nesta rodada), não
-- expressa como constraint no banco.
--
-- Soft delete: mesmo padrão de `documents`/`inspections`
-- (is_deleted/deleted_at/deleted_by_user_id) — confirmado em
-- MaintenanceDetail.jsx (deleteMutation, linhas 150-157): exclusão lógica
-- via UPDATE, nunca DELETE real.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/0017/0023/0027/0032/0036.

-- 1. Enum de prioridade. Confirmado em PRIORITY_CONFIG
--    (AdminMaintenance.jsx/MaintenanceDetail.jsx).
create type maintenance_priority as enum (
  'baixa',
  'media',
  'alta'
);

-- 2. Enum de status do chamado. Confirmado em STATUS_CONFIG e no Select de
--    edição em MaintenanceDetail.jsx.
create type maintenance_status as enum (
  'aberto',
  'agendado',
  'em_andamento',
  'aguardando_cliente',
  'resolvido',
  'cancelado'
);

-- 3. maintenance_requests
create table maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos (todos obrigatórios — ver comentário no topo do arquivo)
  project_id uuid not null references projects(id),
  unit_id uuid not null references units(id),
  client_id uuid not null references clients(id),

  title text not null,
  description text not null,
  category text not null default 'Outros',
  priority maintenance_priority not null default 'media',
  status maintenance_status not null default 'aberto',

  -- Datas sugerida (cliente, portal futuro) e agendada (equipe). Ambas
  -- `date`, não timestamptz (ver comentário no topo do arquivo).
  suggested_date date,
  scheduled_date date,

  opened_at timestamptz not null default now(),
  resolved_at timestamptz,

  responsible_user_id uuid references auth.users(id),
  operator_notes text,

  -- Upload real via Supabase Storage (bucket `maintenance-photos`, ver
  -- 0038_maintenance_requests_storage.sql). Cada elemento guarda o path do
  -- objeto no bucket privado, não uma URL pública.
  photos text[] not null default '{}',

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

comment on table maintenance_requests is
  'Chamado de assistência técnica pós-entrega (AdminMaintenance.jsx/'
  'MaintenanceDetail.jsx). Escopo desta rodada: só lado interno/admin — '
  'client_id é referência de para quem é o chamado, mas o cliente final não '
  'abre o próprio chamado ainda (sem portal do cliente no projeto).';

comment on column maintenance_requests.suggested_date is
  'Data sugerida pelo cliente ao abrir o chamado. Sem write path nesta '
  'rodada (portal do cliente fora de escopo) — nullable, preenchida quando/'
  'se ClientMaintenance.jsx for implementado.';

comment on column maintenance_requests.scheduled_date is
  'Data que a equipe agenda a visita. Nullable no banco: a regra '
  '"obrigatório quando status = AGENDADO" é validada na UI/hook, não como '
  'constraint aqui.';

comment on column maintenance_requests.resolved_at is
  'Carimbado pela aplicação só quando status transiciona para RESOLVIDO '
  '(sem trigger de banco) — nunca um input manual.';

comment on column maintenance_requests.photos is
  'Array de paths de objetos no bucket privado `maintenance-photos` (0038), '
  'não URLs públicas. Opcional na criação pelo operador, obrigatório '
  '(mínimo 1) na criação pelo cliente — regra de fluxo do portal do '
  'cliente, fora de escopo nesta rodada, não expressa como constraint.';

-- 4. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index maintenance_requests_tenant_id_created_at_idx
  on maintenance_requests (tenant_id, created_at);

create index maintenance_requests_tenant_id_project_id_idx
  on maintenance_requests (tenant_id, project_id);

create index maintenance_requests_tenant_id_unit_id_idx
  on maintenance_requests (tenant_id, unit_id);

create index maintenance_requests_tenant_id_client_id_idx
  on maintenance_requests (tenant_id, client_id);

create index maintenance_requests_tenant_id_status_idx
  on maintenance_requests (tenant_id, status);

create index maintenance_requests_tenant_id_responsible_user_id_idx
  on maintenance_requests (tenant_id, responsible_user_id);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_maintenance_requests_updated_at
  before update on maintenance_requests
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030/0034: nao
-- confiar no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.maintenance_requests to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `maintenance_requests` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Mesmo padrao esperado de 0017/0027/0032/
-- 0036: select/insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera manutenção pós-entrega no produto real),
-- sem delete.
-- ---------------------------------------------------------------------
