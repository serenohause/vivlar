-- 0015_activities.sql
-- CRM/Vendas: `activities` — log de atividades/interações do funil de
-- vendas (ligação, WhatsApp, visita, pendência etc).
--
-- FORMATO UNIFICADO: o original cria registros de Activity com campos
-- diferentes em pontos diferentes do código —
-- `src/pages/DealDetail.jsx` (canônico: `title`, `type`, `due_date`,
-- `description`, `status`) vs. `src/pages/CRM.jsx` handleSaveActivity
-- (legado: `activity_type`, `next_action_date`, `completed`,
-- `completed_at`). Decisão já registrada em `docs/ARCHITECTURE.md`:
-- unificar em um único formato — `title`, `type`, `description`,
-- `due_date`, `priority`, `status`, `deal_id`, `client_id`, `unit_id`. Esta
-- migration implementa esse formato; a tradução do fluxo legado de
-- CRM.jsx para esse formato é responsabilidade do `frontend-builder`.
--
-- ACHADO A CONFIRMAR: `DealDetail.jsx` linha ~463 chama
-- `Activity.update(id, { status: "CONCLUIDA" })` para marcar uma atividade
-- como concluída — ou seja, o registro É editável depois de criado, não é
-- só um log write-once. Mesmo assim, seguimos a instrução explícita desta
-- leva (sem `updated_at`, sem soft-delete) porque foi pedido dessa forma;
-- se o rastreio de "quando o status mudou" for necessário depois, isso
-- exige uma migration própria adicionando `updated_at` + trigger
-- `set_updated_at()`.
--
-- `due_date` é `date`, não `timestamptz`: confirmado pelo input
-- `type="date"` em `DealDetail.jsx`.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

-- 1. Enum de tipo de atividade. Confirmado em
--    `src/components/shared/Constants.jsx` (ACTIVITY_TYPE_LABELS).
create type activity_type as enum (
  'ligacao',
  'whatsapp',
  'documento',
  'visita',
  'pendencia',
  'outro'
);

-- 2. Enum de prioridade. Confirmado em `src/pages/CRM.jsx`
--    (activityForm.priority: MEDIA como default; ALTA/BAIXA usados em
--    outras telas do mesmo domínio, ex. DocumentChecklist.jsx).
create type activity_priority as enum (
  'alta',
  'media',
  'baixa'
);

-- 3. Enum de status da atividade. Confirmado em `src/pages/DealDetail.jsx`
--    e `src/pages/UnitDetail.jsx` (ABERTA / CONCLUIDA / CANCELADA).
create type activity_status as enum (
  'aberta',
  'concluida',
  'cancelada'
);

-- 4. activities
create table activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  title text not null,
  type activity_type not null default 'outro',
  description text,
  due_date date,
  priority activity_priority,
  status activity_status not null default 'aberta',

  -- Relacionamentos — todos nullable: uma atividade pode ser de um deal,
  -- de um cliente (sem deal ainda) ou de uma unidade, dependendo de onde
  -- foi criada.
  deal_id uuid references deals(id),
  client_id uuid references clients(id),
  unit_id uuid references units(id),

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table activities is
  'Log de atividades/interações do funil de vendas (ligação, WhatsApp, '
  'visita, pendência etc). Formato unificado — ver docs/ARCHITECTURE.md. '
  'Sem updated_at/soft-delete por decisão desta leva, embora o original '
  'edite status via Activity.update (ver comentário no topo do arquivo).';

-- 5. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index activities_tenant_id_deal_id_idx
  on activities (tenant_id, deal_id);

create index activities_tenant_id_client_id_idx
  on activities (tenant_id, client_id);

create index activities_tenant_id_unit_id_idx
  on activities (tenant_id, unit_id);

-- Sem trigger de updated_at: tabela nao tem essa coluna (ver comentario
-- no topo do arquivo).

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.activities to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `activities` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
