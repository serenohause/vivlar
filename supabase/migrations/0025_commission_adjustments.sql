-- 0025_commission_adjustments.sql
-- Comissões: `commission_adjustments` — ajuste (desconto/acréscimo/bônus)
-- aplicado a uma commission (do original `src/pages/CommissionDetail.jsx`,
-- `addAdjustmentMutation`).
--
-- Write-once, sem soft-delete/updated_at: confirmado via grep em todo o
-- `src` que só existe `CommissionAdjustment.create(...)` — nenhum
-- `.update(`/`.delete(`. A UI filtra defensivamente por `!a.is_deleted`
-- (linha 127), mas nada nunca seta esse campo — mesmo padrão já
-- documentado para `finance_events` em 0021 (herança do SDK genérico do
-- Base44, que expõe `is_deleted` em toda entidade por padrão da
-- plataforma, não uma feature real desta tabela). Log write-once: ajuste
-- lançado, não editado depois.
--
-- `attachment_url`/`attachment_name`/`attachment_uploaded_at`/
-- `attachment_uploaded_by_user_id`: confirmados 1:1 em
-- `addAdjustmentMutation` (CommissionDetail.jsx linhas 300-304) — campo de
-- texto (URL), sem upload real de arquivo nesta leva, mesmo padrão já
-- usado em `payment_installments.comprovante_url` (0020).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0016 (mesmo critério de write-once já usado ali).

-- 1. Enum de tipo de ajuste. Confirmado em CommissionDetail.jsx
--    (ADJUSTMENT_CONFIG: DESCONTO/ACRESCIMO/BONUS).
create type commission_adjustment_type as enum (
  'desconto',
  'acrescimo',
  'bonus'
);

-- 2. commission_adjustments
create table commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  commission_id uuid not null references commissions(id),

  type commission_adjustment_type not null,
  amount numeric(14, 2) not null,
  reason text,

  -- Anexo (URL de texto — sem upload real nesta leva, ver topo do arquivo)
  attachment_url text,
  attachment_name text,
  attachment_uploaded_at timestamptz,
  attachment_uploaded_by_user_id uuid references auth.users(id),

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table commission_adjustments is
  'Ajuste (desconto/acréscimo/bônus) aplicado a uma commission — log '
  'write-once, sem update/delete no fluxo original (confirmado via grep: '
  'só há CommissionAdjustment.create). Cada ajuste dispara recálculo de '
  'commissions.gross_value/saldo pela aplicação (CommissionDetail.jsx), não '
  'por trigger no banco.';

comment on column commission_adjustments.amount is
  'Valor absoluto do ajuste (sempre positivo) — o sinal (soma ou subtrai '
  'de gross_value) é determinado pelo `type` na aplicação '
  '(ADJUSTMENT_CONFIG.sign em CommissionDetail.jsx), não armazenado aqui.';

-- 3. Índice composto (docs/SCHEMA_PLAN.md secao 4).
create index commission_adjustments_tenant_id_commission_id_idx
  on commission_adjustments (tenant_id, commission_id);

-- Sem trigger de updated_at: tabela é um log write-once, sem coluna
-- updated_at (mesmo padrão de activities/status_transitions/finance_events).

-- ---------------------------------------------------------------------
-- Grants explicitos. Log write-once: apenas select/insert a `authenticated`
-- (mesmo critério de status_transitions/finance_events em 0016/0017/0021 —
-- sem update/delete, nada a `anon`).
-- ---------------------------------------------------------------------
grant select, insert on public.commission_adjustments to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `commission_adjustments` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
