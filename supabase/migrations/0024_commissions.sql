-- 0024_commissions.sql
-- Comissões: `commissions` — comissão de venda de um corretor sobre um
-- `deal` (do original `src/pages/Commissions.jsx` e
-- `src/pages/CommissionDetail.jsx`).
--
-- Nenhum `Commission.create(...)` foi encontrado em todo o `src` (grep
-- confirmado) — o texto do EmptyState em Commissions.jsx ("Comissões são
-- geradas automaticamente ao vender uma unidade") aponta para uma automação
-- do lado da plataforma Base44 que não está no código-fonte exportado,
-- igual ao caso já registrado em 0014 (`deals.commission_rate`/
-- `commission_value` também não têm ligação com este módulo). O schema é
-- desenhado a partir dos campos lidos/escritos via `.update(...)` em
-- `CommissionDetail.jsx`, que é o fluxo real e completo em uso.
--
-- `finalized_by_user_id`: não estava no levantamento inicial da leva, mas
-- `finalizeMutation` (CommissionDetail.jsx) seta esse campo explicitamente
-- junto de `finalized_at`/`is_finalizada` — incluído.
--
-- `paid_at` NÃO incluído: usado em `Commissions.jsx` (KPI "Pago no Mês",
-- filtra `c.paid_at` por mês corrente), mas nenhum `Commission.update(...)`
-- em todo o `src` seta esse campo (nem `finalizeMutation`, nem
-- `registerPaymentMutation`) — é um campo lido mas sem write path
-- confirmado, mesmo critério já usado para `FinancingProcess` (0019) e
-- `OBSERVACAO` (0021). O KPI já está órfão no próprio original; quando o
-- frontend for construído, a métrica deve ser derivada de
-- `commission_payments.data_pagamento` em vez de reintroduzir este campo.
--
-- `unique(tenant_id, deal_id) where not is_deleted`: nenhuma tela do
-- original lista mais de uma comissão por deal — a única referência a
-- array (`dealService.getDealWithDetails`) é código morto, não chamado em
-- lugar nenhum do `src` (grep confirmado). Combinado com `deals.broker_id`
-- ser singular e `DealBroker.create` nunca aparecer (co-corretagem não
-- existe no fluxo real), a leitura mais consistente é "1 comissão por
-- deal". Decisão de julgamento, não 100% certeza — reversível depois se o
-- produto introduzir co-corretagem.
--
-- `gross_value`/`saldo`/`total_pago`: sem trigger de cálculo automático no
-- banco — `CommissionDetail.jsx` recalcula e grava esses 3 campos a cada
-- ajuste/pagamento (aplicação é a fonte de verdade do cálculo, não o
-- banco), mesmo padrão já usado em finance_accounts/payment_installments
-- (nenhum trigger de agregação nessas tabelas também).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0017/0023.

-- 1. Enum de status da comissão. Confirmado em Commissions.jsx/
--    CommissionDetail.jsx (STATUS_CONFIG: A_PAGAR/AGENDADO/PAGO/CANCELADO).
create type commission_status as enum (
  'a_pagar',
  'agendado',
  'pago',
  'cancelado'
);

-- 2. commissions
create table commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos
  broker_id uuid not null references brokers(id),
  deal_id uuid not null references deals(id),
  unit_id uuid not null references units(id),
  project_id uuid not null references projects(id),

  -- Valores
  base_value numeric(14, 2) not null,
  gross_value numeric(14, 2),
  rate numeric(6, 4),
  saldo numeric(14, 2) not null default 0,
  total_pago numeric(14, 2) not null default 0,

  status commission_status not null default 'a_pagar',
  due_date date,

  -- Finalização (trava a comissão contra novos ajustes/pagamentos)
  is_finalizada boolean not null default false,
  finalized_at timestamptz,
  finalized_by_user_id uuid references auth.users(id),

  notes text,

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

comment on table commissions is
  'Comissão de venda de um corretor sobre um deal. gross_value/saldo/'
  'total_pago são recalculados pela aplicação a cada ajuste '
  '(commission_adjustments) ou pagamento (commission_payments) — sem '
  'trigger de agregação no banco. Nenhum Commission.create(...) foi '
  'encontrado no código-fonte original (provável automação da plataforma '
  'Base44 fora do export) — schema desenhado a partir do fluxo de update '
  'em CommissionDetail.jsx.';

comment on column commissions.gross_value is
  'base_value + soma dos ajustes assinados (desconto=negativo, '
  'acrescimo/bonus=positivo). Nullable: só é gravado a partir do primeiro '
  'ajuste (CommissionDetail.jsx); a UI usa `gross_value || base_value` como '
  'fallback antes disso.';

comment on column commissions.is_finalizada is
  'Trava a comissão: CommissionDetail.jsx desabilita novos ajustes/'
  'pagamentos/cancelamento quando true (canManage = hasAccess && '
  '!is_finalizada).';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4 + filtros de tela).
create index commissions_tenant_id_broker_id_idx
  on commissions (tenant_id, broker_id);

create index commissions_tenant_id_status_idx
  on commissions (tenant_id, status);

create index commissions_tenant_id_deal_id_idx
  on commissions (tenant_id, deal_id);

-- Não pedido explicitamente na leva, mas mesmo padrão de deals/finance_accounts:
-- project_id é filtro de tela (Commissions.jsx: `filterProject`).
create index commissions_tenant_id_project_id_idx
  on commissions (tenant_id, project_id);

-- 4. Índice único parcial: no máximo 1 comissão ativa (não excluída) por
--    deal, por tenant. Ver justificativa no comentário do topo do arquivo.
create unique index commissions_tenant_id_deal_id_uidx
  on commissions (tenant_id, deal_id)
  where not is_deleted;

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_commissions_updated_at
  before update on commissions
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0014: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.commissions to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `commissions` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela.
-- ---------------------------------------------------------------------
