-- 0026_commission_payments.sql
-- Comissões: `commission_payments` — baixa de pagamento (total ou parcial)
-- de uma commission (do original `src/pages/CommissionDetail.jsx`,
-- `registerPaymentMutation`/`editPaymentMutation`/`deletePaymentMutation`).
--
-- Editável e soft-deletável (NÃO write-once, diferente de
-- commission_adjustments): confirmado via grep em `src` que existe
-- `CommissionPayment.create(...)` **e** `CommissionPayment.update(...)`
-- (editPaymentMutation, linha ~408) **e** soft-delete via
-- `CommissionPayment.update(id, { is_deleted: true, deleted_at,
-- deleted_by_user_id })` (deletePaymentMutation, linha ~470). Mesmo
-- critério já usado para `payment_installments` (0020) — auditoria
-- completa e trigger `set_updated_at()`.
--
-- `payment_method`: texto livre, não enum — confirmado no dialog
-- (CommissionDetail.jsx usa <Select> com opções fixas na UI, mas o valor
-- gravado é string livre, sem validação de enum no `.create`/`.update`),
-- mesmo padrão já usado em `payment_installments.metodo_pagamento` (0020).
--
-- `comprovante_url`: campo de texto (URL), sem upload real de arquivo
-- nesta leva — mesmo padrão de `commission_adjustments.attachment_url` e
-- `payment_installments.comprovante_url`.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0020.

-- 1. commission_payments
create table commission_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  commission_id uuid not null references commissions(id),

  valor_pago numeric(14, 2) not null,
  data_pagamento date not null,
  payment_method text,
  payment_reference text,
  comprovante_url text,
  observacoes text,

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

comment on table commission_payments is
  'Baixa de pagamento (total ou parcial) de uma commission. Editável e '
  'soft-deletável — confirmado via CommissionPayment.update em '
  'editPaymentMutation (edição) e deletePaymentMutation (soft delete) no '
  'original, diferente de commission_adjustments (write-once). Cada '
  'pagamento/edição/exclusão dispara recálculo de commissions.total_pago/'
  'saldo/status pela aplicação, não por trigger no banco.';

comment on column commission_payments.payment_method is
  'Texto livre (ex: PIX, BOLETO, TRANSFERENCIA) — mesmo critério de '
  'payment_installments.metodo_pagamento (0020): a UI oferece opções fixas '
  'num <Select>, mas o schema não valida contra enum.';

-- 2. Índice composto (docs/SCHEMA_PLAN.md secao 4).
create index commission_payments_tenant_id_commission_id_idx
  on commission_payments (tenant_id, commission_id);

-- 3. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_commission_payments_updated_at
  before update on commission_payments
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0020: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted = true).
-- ---------------------------------------------------------------------
grant select, insert, update on public.commission_payments to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `commission_payments` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
