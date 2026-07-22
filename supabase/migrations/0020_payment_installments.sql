-- 0020_payment_installments.sql
-- Financeiro: `payment_installments` — parcela individual de uma carteira
-- financeira (do original `src/pages/FinanceDetail.jsx`,
-- `src/components/unit/FinanceTabNew.jsx`, `financeService.jsx`,
-- `financeHelpers.jsx`, `useProjectStats.jsx`).
--
-- `unit_id`/`client_id` desnormalizados de `finance_account_id`:
-- confirmado no original — tanto `FinanceDetail.jsx` quanto
-- `FinanceTabNew.jsx` passam `unit_id`/`client_id` direto no
-- `PaymentInstallment.create(...)`, em vez de derivar via join com
-- `finance_accounts`. Mantido aqui para poder filtrar parcelas por
-- unidade/cliente sem join (usado em `InadimplenciaManager.jsx`:
-- `getUnitSku`, e em `checkUnitAlerts`).
--
-- `tipo`/`status`: enums confirmados 1:1 com os valores usados nos
-- `<Select>` de `FinanceDetail.jsx` e na fonte única de cálculo
-- `financeHelpers.jsx` (`computeInstallmentComputedStatus`,
-- `computeTotalsByType`). `status` é o valor persistido (mudado via
-- mutation/cron `dailyOverdueInstallments`); o "status computado" do
-- original (`PAGO|ATRASADO|PENDENTE|CANCELADO`, derivado de vencimento +
-- status) é lógica de apresentação, não uma coluna adicional.
--
-- `metodo_pagamento`: texto livre, não enum — confirmado em
-- `FinanceDashboard.jsx` (`calculatePaymentMix`), que trata qualquer valor
-- fora de PIX/BOLETO/TRANSFERENCIA como "OUTROS" na agregação, sem validar
-- contra uma lista fixa no schema.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0017.

-- 1. Enums.
create type installment_type as enum (
  'sinal',
  'entrada',
  'parcela',
  'reforco',
  'intermediaria',
  'valor_financiado',
  'subsidio',
  'outros'
);

create type installment_status as enum (
  'previsto',
  'parcial',
  'pago',
  'em_atraso',
  'cancelado'
);

-- 2. payment_installments
create table payment_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos
  finance_account_id uuid not null references finance_accounts(id),
  unit_id uuid not null references units(id),
  client_id uuid not null references clients(id),

  -- Classificação
  tipo installment_type not null,
  descricao text,
  numero_parcela int,
  observacoes text,

  -- Valores e vencimento
  vencimento date not null,
  valor_previsto numeric(14, 2) not null,
  valor_pago numeric(14, 2),
  status installment_status not null default 'previsto',

  -- Baixa de pagamento
  data_pagamento date,
  comprovante_url text,
  metodo_pagamento text,

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

comment on table payment_installments is
  'Parcela individual de uma finance_account. unit_id/client_id são '
  'desnormalizados de finance_account_id (mesmo padrão do original) para '
  'permitir filtro direto sem join — ver comentário no topo do arquivo.';

comment on column payment_installments.metodo_pagamento is
  'Texto livre (ex: PIX, BOLETO, TRANSFERENCIA) — confirmado em '
  'FinanceDashboard.jsx que trata qualquer valor fora de uma lista curta '
  'como "OUTROS" na agregação, sem enum/constraint no original.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index payment_installments_tenant_id_vencimento_idx
  on payment_installments (tenant_id, vencimento);

create index payment_installments_tenant_id_status_idx
  on payment_installments (tenant_id, status);

create index payment_installments_tenant_id_finance_account_id_idx
  on payment_installments (tenant_id, finance_account_id);

-- Não pedido explicitamente na leva, mas unit_id é usado como filtro direto
-- (InadimplenciaManager.jsx: getUnitSku, checkUnitAlerts) graças à
-- desnormalização acima.
create index payment_installments_tenant_id_unit_id_idx
  on payment_installments (tenant_id, unit_id);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_payment_installments_updated_at
  before update on payment_installments
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0011: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.payment_installments to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `payment_installments` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
