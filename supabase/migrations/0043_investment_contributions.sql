-- 0043_investment_contributions.sql
-- Aportes de investimento: `investment_contributions` — cada entrada de
-- capital em um projeto, de um investidor externo ou da própria
-- construtora (do original `src/pages/InvestmentContributions.jsx`;
-- docs/DOMAIN_MAP.md seção "InvestmentContribution").
--
-- `investor_id` NULLABLE: sem investidor = capital próprio da construtora
-- (confirmado em docs/DOMAIN_MAP.md e em
-- `aggregateContributionsByInvestor`, investmentResultHelpers.jsx, que usa
-- `c.investor_id || "outros"` como chave de agrupamento).
--
-- `tipo`/`status`: enums confirmados em InvestmentContributions.jsx.
-- `tipo` default 'APORTE' (caso mais comum — entrada inicial de capital,
-- distinto de REFORCO/AJUSTE). `status` default 'PREVISTO', mesmo critério
-- de "estado inicial antes da confirmação" já usado em
-- `payment_installments.status`/`commissions.status`.
--
-- `comprovante_url`/`comprovante_nome`: confirmado que NÃO há upload real
-- de arquivo em nenhuma tela do original (grep: nenhum
-- `<input type="file">`/chamada de upload em InvestmentContributions.jsx —
-- só exibição condicional se o campo já vier preenchido). Mantidos como
-- texto/URL simples, mesmo padrão já aceito em
-- `payment_installments.comprovante_url` (0020) e
-- `commission_payments.comprovante_url`/`commission_adjustments.
-- attachment_url` (0025/0026) — sem bucket de Storage novo.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente.

-- 1. Enum de tipo de aporte. Confirmado em InvestmentContributions.jsx.
create type investment_contribution_type as enum (
  'APORTE',
  'REFORCO',
  'AJUSTE'
);

-- 2. Enum de status do aporte. Confirmado em InvestmentContributions.jsx.
create type investment_contribution_status as enum (
  'PREVISTO',
  'CONFIRMADO'
);

-- 3. investment_contributions
create table investment_contributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  project_id uuid not null references projects(id),
  -- Nullable: sem investidor = capital próprio da construtora (ver
  -- comentário no topo do arquivo).
  investor_id uuid references investors(id),

  valor numeric(14, 2) not null,
  data date not null,

  tipo investment_contribution_type not null default 'APORTE',
  status investment_contribution_status not null default 'PREVISTO',

  observacoes text,
  comprovante_url text,
  comprovante_nome text,

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

comment on table investment_contributions is
  'Aporte de capital em um projeto, de um investidor externo ou da própria '
  'construtora (investor_id null = capital próprio) — '
  'InvestmentContributions.jsx.';

comment on column investment_contributions.investor_id is
  'Nullable: sem investidor = capital próprio da construtora, confirmado '
  'em docs/DOMAIN_MAP.md e usado como chave "outros" em '
  'aggregateContributionsByInvestor (investmentResultHelpers.jsx).';

comment on column investment_contributions.comprovante_url is
  'URL/texto simples, sem upload real de arquivo (nenhuma tela do '
  'original faz upload) — mesmo padrão de payment_installments.'
  'comprovante_url (0020) e commission_payments.comprovante_url (0026).';

-- 4. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index investment_contributions_tenant_id_created_at_idx
  on investment_contributions (tenant_id, created_at);

create index investment_contributions_tenant_id_project_id_idx
  on investment_contributions (tenant_id, project_id);

create index investment_contributions_tenant_id_investor_id_idx
  on investment_contributions (tenant_id, investor_id);

create index investment_contributions_tenant_id_status_idx
  on investment_contributions (tenant_id, status);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_investment_contributions_updated_at
  before update on investment_contributions
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030/0034/0037/
-- 0041/0042: nao confiar no default privilege do schema, conceder select/
-- insert/update explicitamente a `authenticated`, nada a `anon`. Sem
-- delete: exclusao e sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.investment_contributions to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `investment_contributions` ainda NAO tem Row Level
-- Security habilitada. Responsabilidade do subagente `rls-guardian` na
-- proxima etapa, com teste de isolamento correspondente, antes de qualquer
-- dado real trafegar por esta tabela. Mesmo padrao esperado de 0017/0027/
-- 0032/0036/0039: select/insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera investidores no produto real), sem delete.
-- ---------------------------------------------------------------------
