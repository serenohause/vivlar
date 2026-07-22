-- 0019_finance_accounts.sql
-- Financeiro: `finance_accounts` — carteira financeira de uma unidade
-- vendida (do original `src/pages/Finance.jsx`, `src/pages/FinanceDetail.jsx`
-- e `src/components/unit/FinanceTabNew.jsx`, que é o modelo em uso ativo —
-- ver `docs/ARCHITECTURE.md` sobre `VendaFinanceira`/`ParcelasEntrada`
-- (`FinanceTab.jsx`, legado) não terem sido portados). Uma unidade tem uma
-- carteira ativa por vez, mas pode ter mais de uma ao longo do tempo
-- (distrato + nova venda) — sem índice único parcial aqui porque o
-- original de fato tolera múltiplas carteiras ativas por unidade
-- simultaneamente (ver `financeCheckup.jsx`, que detecta e resolve isso
-- como uma inconsistência de dados a ser corrigida manualmente, não uma
-- regra de banco).
--
-- `contract_id` NÃO incluído: existe no original (`FinanceDetail.jsx` linha
-- 138, `FinanceTabNew.jsx` linha 125), mas `contracts` ainda não existe
-- neste schema (módulo futuro de Documentos/Contratos) — decisão confirmada
-- com o usuário nesta leva. Quando `contracts` for criado, `finance_accounts`
-- ganha essa FK via `/new-feature`.
--
-- `FinancingProcess` (processo de financiamento bancário) NÃO modelado:
-- confirmado via grep que só há `.filter(...)` no original
-- (`ClientFinance.jsx`, `FinanceDetail.jsx`), nenhum `.create(...)` — schema
-- incerto, já registrado como adiado em `docs/ARCHITECTURE.md`.
--
-- `deal_id` NULLABLE: confirmado em `FinanceTabNew.jsx` (`deal_id: deal?.id
-- || ""`) — pode não haver deal com sales_stage=VENDIDO no momento em que a
-- carteira é criada (fallback automático).
--
-- `status`: enum tem 3 valores, não só `ativa` como o levantamento inicial
-- supunha — confirmado em `Finance.jsx` (STATUS_COLORS e filtro de Select
-- listam `ATIVA`/`FINALIZADA`/`CANCELADA`). Nenhum fluxo do original
-- efetivamente cria com `FINALIZADA`/`CANCELADA` (só `ATIVA` no `.create`),
-- mas são valores de domínio válidos usados na UI — mantidos no enum.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0017.

-- 1. Enum de status da carteira financeira.
create type finance_account_status as enum (
  'ativa',
  'finalizada',
  'cancelada'
);

-- 2. finance_accounts
create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos
  unit_id uuid not null references units(id),
  client_id uuid not null references clients(id),
  deal_id uuid references deals(id),
  project_id uuid not null references projects(id),

  -- Valor de referência da venda (financeHelpers.jsx usa isso como base do
  -- % quitado e do saldo em aberto).
  valor_venda_total numeric(14, 2) not null default 0,

  status finance_account_status not null default 'ativa',

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

comment on table finance_accounts is
  'Carteira financeira de uma unidade vendida — agrupa as parcelas '
  '(payment_installments) e o log de eventos (finance_events) de uma venda. '
  'Sem contract_id (contracts ainda não existe) e sem ligação com '
  'FinancingProcess (schema incerto no original, adiado).';

comment on column finance_accounts.deal_id is
  'Nullable: confirmado em src/components/unit/FinanceTabNew.jsx — a '
  'carteira pode ser criada automaticamente sem um deal VENDIDO '
  'correspondente no momento (fallback `deal?.id || ""`).';

comment on column finance_accounts.status is
  'ativa/finalizada/cancelada — os 3 valores usados na UI do original '
  '(Finance.jsx). Só "ativa" é efetivamente setada pelo fluxo de criação '
  'automática de carteira; os outros dois são estados alcançados por '
  'edição manual.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4 + filtros de tela).
create index finance_accounts_tenant_id_unit_id_idx
  on finance_accounts (tenant_id, unit_id);

create index finance_accounts_tenant_id_client_id_idx
  on finance_accounts (tenant_id, client_id);

-- Não pedido explicitamente na leva, mas mesmo padrão de deals/units:
-- status e project_id são filtros de tela (Finance.jsx: `statusFilter`,
-- `projectFilter`).
create index finance_accounts_tenant_id_status_idx
  on finance_accounts (tenant_id, status);

create index finance_accounts_tenant_id_project_id_idx
  on finance_accounts (tenant_id, project_id);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_finance_accounts_updated_at
  before update on finance_accounts
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0011: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.finance_accounts to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `finance_accounts` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
