-- 0016_status_transitions.sql
-- CRM/Vendas: `status_transitions` — log de mudanças de estágio/status,
-- tanto do funil comercial de um `deal` (`transition_type = 'comercial'`,
-- ex. `src/pages/DealDetail.jsx`) quanto do pipeline administrativo/MCMV de
-- uma `unit` (`transition_type = 'admin'`, ex. `src/pages/UnitDetail.jsx`).
-- Confirmado também em uso no site público (`src/components/espelho/
-- LeadForm.jsx`, que cria uma transição ao capturar lead).
--
-- `from_status`/`to_status` são `text` livre, não enum: no original os
-- mesmos dois campos guardam valores de dois domínios diferentes
-- (`deal_sales_stage` para transições comerciais, `unit_admin_status` para
-- transições administrativas) — um enum único quebraria um dos dois usos,
-- e dois enums exigiriam duas colunas. Mantido texto livre, validado na
-- aplicação (Zod) quanto ao domínio esperado por `transition_type`.
--
-- `unit_id` e `deal_id` NULLABLE e independentes: confirmado em
-- `src/pages/UnitDetail.jsx` (transições só de unit_id, sem deal_id) e
-- `src/pages/DealDetail.jsx` (transições com unit_id + deal_id juntos).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010.

-- 1. Enum do tipo de transição.
create type status_transition_type as enum (
  'admin',
  'comercial'
);

-- 2. status_transitions
create table status_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  unit_id uuid references units(id),
  deal_id uuid references deals(id),

  from_status text,
  to_status text not null,
  transition_type status_transition_type not null,
  note text,

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table status_transitions is
  'Log de mudanças de estágio/status — funil comercial de um deal '
  '(transition_type = comercial) ou pipeline administrativo/MCMV de uma '
  'unit (transition_type = admin). from_status/to_status são texto livre '
  'porque guardam valores de dois domínios de enum diferentes conforme '
  'transition_type; validação de domínio fica na aplicação.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index status_transitions_tenant_id_unit_id_idx
  on status_transitions (tenant_id, unit_id);

create index status_transitions_tenant_id_deal_id_idx
  on status_transitions (tenant_id, deal_id);

-- Sem trigger de updated_at: tabela e um log, sem coluna updated_at (igual
-- a activities).

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008: nao confiar no default
-- privilege do schema, conceder select/insert/update explicitamente a
-- `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.status_transitions to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `status_transitions` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
