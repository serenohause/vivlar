-- 0014_deals.sql
-- CRM/Vendas: `deals` — negociação/oportunidade (do original
-- `src/pages/CRM.jsx`, `src/pages/DealDetail.jsx` e
-- `src/components/shared/services/dealService.jsx`). Núcleo do funil de
-- vendas: liga cliente, unidade, projeto e corretor.
--
-- `sales_stage`: unifica os dois campos redundantes do original
-- (`sales_stage` + `opportunity_status`, ver `docs/DOMAIN_MAP.md`) num único
-- enum — decisão já aprovada com o usuário em `docs/SCHEMA_PLAN.md` seção
-- 2.2. `PERDIDO`/`DISTRATADO` (que no original só apareciam via
-- `opportunity_status` ou como valor "extra" de `sales_stage` fora da lista
-- `SALES_STAGES`) viram valores de primeira classe do enum aqui.
--
-- `unit_id` NULLABLE: confirmado em `src/pages/CRM.jsx` (label "Unidade
-- (opcional)" no dialog de criação) — um lead pode existir sem unidade
-- definida ainda.
--
-- `broker_id` NULLABLE: apesar do label "Corretor *" no dialog do original
-- sugerir obrigatório, o código de mutação trata a ausência de broker_id
-- como caso válido (`if (data.unit_id && data.broker_id)` antes de criar
-- comissão) — mantido nullable, igual à decisão já registrada no escopo
-- desta tarefa.
--
-- `commission_rate`/`commission_value`/`final_sale_value`: campos
-- numéricos simples desta tabela, sem ligação com `commissions` (módulo
-- futuro, ainda não existe) — confirmado como fora de escopo.
--
-- Índice único parcial `(tenant_id, unit_id) where is_active and not
-- is_deleted`: reforça em nível de banco a regra "uma unidade só tem 1
-- negócio ativo por vez" (docs/SCHEMA_PLAN.md). Não bloqueia deals
-- históricos não-ativos na mesma unidade (distrato, perda, venda antiga) —
-- só quando is_active = true, que é exatamente o comportamento desejado.
-- unit_id nulo nunca colide na unique index (NULL != NULL em Postgres),
-- mas adicionamos `and unit_id is not null` na cláusula para deixar a
-- intenção explícita.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

-- 1. Enum de estágio comercial do negócio.
create type deal_sales_stage as enum (
  'lead',
  'qualificado',
  'reservado',
  'proposta',
  'vendido',
  'distratado',
  'perdido'
);

-- 2. deals
create table deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos do funil
  project_id uuid not null references projects(id),
  unit_id uuid references units(id),
  client_id uuid not null references clients(id),
  broker_id uuid references brokers(id),

  -- Estágio e valores
  sales_stage deal_sales_stage not null default 'lead',
  expected_sale_value numeric(14, 2),
  final_sale_value numeric(14, 2),
  commission_rate numeric(6, 4),
  commission_value numeric(14, 2),

  -- Datas de controle do funil
  reserved_until timestamptz,
  sold_at timestamptz,
  last_activity_date timestamptz,

  -- Perda
  lost_reason text,

  -- Distrato
  distrato_at timestamptz,
  distrato_reason text,
  distrato_by_user_id uuid references auth.users(id),

  -- Negócio corrente do funil (separado de is_deleted — ver
  -- docs/DOMAIN_MAP.md)
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

comment on table deals is
  'Negociação/oportunidade do funil de vendas. Liga client, unit, project e '
  'broker. sales_stage unifica sales_stage+opportunity_status do original '
  '(decisão registrada em docs/SCHEMA_PLAN.md secao 2.2). Sem ligação com '
  'commissions/documents/contracts — módulos futuros ainda não existem.';

comment on column deals.is_active is
  'Indica se este é o negócio corrente do funil para a unidade — separado '
  'de is_deleted (exclusão lógica). Reforçado pelo índice único parcial '
  'deals_tenant_id_unit_id_active_uidx: só 1 deal ativo por unidade.';

comment on column deals.unit_id is
  'Nullable: um lead/oportunidade pode existir sem unidade definida ainda '
  '(src/pages/CRM.jsx, "Unidade (opcional)").';

comment on column deals.broker_id is
  'Nullable: o dialog do original marca "Corretor *", mas o código de '
  'mutação trata ausência de broker_id como caso válido antes de criar '
  'comissão — mantido nullable.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index deals_tenant_id_unit_id_idx
  on deals (tenant_id, unit_id);

create index deals_tenant_id_client_id_idx
  on deals (tenant_id, client_id);

create index deals_tenant_id_sales_stage_idx
  on deals (tenant_id, sales_stage);

create index deals_tenant_id_broker_id_idx
  on deals (tenant_id, broker_id);

-- Não pedido explicitamente na leva, mas mesmo padrão de units/terrains:
-- project_id é um filtro comum de tela (CRM.jsx: `selectedProject`).
create index deals_tenant_id_project_id_idx
  on deals (tenant_id, project_id);

-- 4. Índice único parcial: só 1 deal ativo por unidade, por tenant.
create unique index deals_tenant_id_unit_id_active_uidx
  on deals (tenant_id, unit_id)
  where is_active and not is_deleted and unit_id is not null;

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_deals_updated_at
  before update on deals
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.deals to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `deals` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
