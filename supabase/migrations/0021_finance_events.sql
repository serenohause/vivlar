-- 0021_finance_events.sql
-- Financeiro: `finance_events` — log de auditoria da carteira financeira
-- (do original `src/pages/FinanceDetail.jsx`, aba "Timeline", e
-- `src/components/unit/FinanceTabNew.jsx`, mesmo fluxo embutido na tela de
-- unidade).
--
-- `tipo_evento`: enum tem 6 valores, não 5 — o levantamento inicial listava
-- `CRIACAO_PARCELA`/`EDICAO_PARCELA`/`CANCELAMENTO_PARCELA`/
-- `BAIXA_PAGAMENTO`/`STATUS_FINANCIAMENTO` (confirmados em
-- `FinanceDetail.jsx`), mas `src/components/unit/FinanceTabNew.jsx` linha
-- 136 também cria evento `CRIACAO_CARTEIRA` quando a finance_account é
-- criada automaticamente ao lançar a primeira parcela de uma unidade —
-- fluxo real, não do checkup fora de escopo. Adicionado ao enum.
--
-- `OBSERVACAO` (usado em `src/components/finance/financeCheckup.jsx` para
-- eventos de merge/dedup automático) NÃO incluído: `financeCheckup.jsx` é a
-- ferramenta "FinanceCheckup", explicitamente fora de escopo desta leva
-- (confirmado com o usuário) — se o checkup for portado depois, o enum
-- ganha esse valor via `/new-feature`.
--
-- `installment_id` NULLABLE: confirmado — o evento `CRIACAO_CARTEIRA` é
-- criado antes de qualquer parcela existir (`FinanceTabNew.jsx`), sem
-- installment_id.
--
-- Sem soft-delete/updated_at: é um log, mesmo padrão de
-- `activities`/`status_transitions` do CRM (0015/0016). Nenhum código do
-- fluxo em escopo chama `FinanceEvent.update`/`.delete` — a leitura em
-- `FinanceDetail.jsx`/`FinanceTabNew.jsx` filtra defensivamente por
-- `!e.is_deleted`, mas nada nunca seta esse campo como true (herança do
-- SDK genérico do Base44, que expõe `is_deleted` em toda entidade por
-- padrão da plataforma — não uma feature de soft-delete real para
-- FinanceEvent especificamente). A única leva que efetivamente chama
-- `FinanceEvent.update` é `financeCheckup.jsx`, fora de escopo.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0017.

-- 1. Enum do tipo de evento.
create type finance_event_type as enum (
  'criacao_carteira',
  'criacao_parcela',
  'edicao_parcela',
  'cancelamento_parcela',
  'baixa_pagamento',
  'status_financiamento'
);

-- 2. finance_events
create table finance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  finance_account_id uuid not null references finance_accounts(id),
  installment_id uuid references payment_installments(id),

  tipo_evento finance_event_type not null,
  descricao text,

  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table finance_events is
  'Log de auditoria (timeline) de uma finance_account — write-once, sem '
  'update/delete no fluxo em escopo. installment_id nullable: o evento '
  'criacao_carteira não tem parcela associada ainda.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4).
create index finance_events_tenant_id_finance_account_id_idx
  on finance_events (tenant_id, finance_account_id);

create index finance_events_tenant_id_installment_id_idx
  on finance_events (tenant_id, installment_id);

-- Sem trigger de updated_at: tabela e um log, sem coluna updated_at (igual
-- a activities/status_transitions).

-- ---------------------------------------------------------------------
-- Grants explicitos. Log write-once: apenas select/insert a `authenticated`
-- (mesmo critério de status_transitions em 0016/0017 — sem update/delete,
-- nada a `anon`).
-- ---------------------------------------------------------------------
grant select, insert on public.finance_events to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `finance_events` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
