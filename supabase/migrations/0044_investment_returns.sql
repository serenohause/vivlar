-- 0044_investment_returns.sql
-- Retornos/dividendos de investimento: `investment_returns` — cada
-- devolução de capital ou dividendo pago a um investidor (ou à própria
-- construtora), referente a um projeto (do original
-- `src/pages/InvestmentReturns.jsx`; docs/DOMAIN_MAP.md seção
-- "InvestmentReturn").
--
-- `investor_id` NULLABLE: mesma lógica de `investment_contributions`
-- (0043) — sem investidor = capital próprio da construtora, confirmado em
-- `aggregateReturnsByInvestor` (investmentResultHelpers.jsx, usa
-- `r.investor_id || "outros"`).
--
-- `return_type` NOT NULL, SEM DEFAULT: no original existe uma classe de
-- "retornos legados" sem esse campo, que `ReviewLegacyReturns.jsx`/
-- `migrateInvestmentReturns` tentam reclassificar por heurística de texto
-- (dado legado da plataforma Base44, código de migração pontual). Nesta
-- plataforma nova não há dado legado a herdar — o campo é obrigatório
-- desde o primeiro registro, sem replicar a lógica de fallback/heurística.
--
-- `status`: enum confirmado em InvestmentReturns.jsx. Default 'PREVISTO',
-- mesmo critério de "estado inicial antes da confirmação/pagamento" já
-- usado em `investment_contributions.status` (0043).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente.

-- 1. Enum de tipo de retorno. Confirmado em InvestmentReturns.jsx.
create type investment_return_type as enum (
  'PRINCIPAL',
  'DIVIDENDO_INVESTIDOR',
  'DIVIDENDO_VIVLAR'
);

-- 2. Enum de status do retorno. Confirmado em InvestmentReturns.jsx.
create type investment_return_status as enum (
  'PREVISTO',
  'PAGO'
);

-- 3. investment_returns
create table investment_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  project_id uuid not null references projects(id),
  -- Nullable: sem investidor = capital próprio da construtora (mesma
  -- lógica de investment_contributions.investor_id, 0043).
  investor_id uuid references investors(id),

  valor numeric(14, 2) not null,
  data date not null,

  -- Not null, sem default: ver comentário no topo do arquivo sobre
  -- "retornos legados" do original, não replicado aqui.
  return_type investment_return_type not null,
  status investment_return_status not null default 'PREVISTO',

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

comment on table investment_returns is
  'Retorno/dividendo pago a um investidor (ou à própria construtora, '
  'investor_id null), referente a um projeto — InvestmentReturns.jsx.';

comment on column investment_returns.investor_id is
  'Nullable: sem investidor = capital próprio da construtora, mesma '
  'lógica de investment_contributions.investor_id (0043).';

comment on column investment_returns.return_type is
  'Obrigatório desde o primeiro registro, sem default. O original tem uma '
  'classe de "retornos legados" sem este campo, reclassificada por '
  'heurística de texto (ReviewLegacyReturns.jsx/migrateInvestmentReturns) '
  '— não há dado legado nesta plataforma nova, então essa lógica de '
  'fallback não foi replicada.';

-- 4. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index investment_returns_tenant_id_created_at_idx
  on investment_returns (tenant_id, created_at);

create index investment_returns_tenant_id_project_id_idx
  on investment_returns (tenant_id, project_id);

create index investment_returns_tenant_id_investor_id_idx
  on investment_returns (tenant_id, investor_id);

create index investment_returns_tenant_id_status_idx
  on investment_returns (tenant_id, status);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_investment_returns_updated_at
  before update on investment_returns
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030/0034/0037/
-- 0041/0042/0043: nao confiar no default privilege do schema, conceder
-- select/insert/update explicitamente a `authenticated`, nada a `anon`.
-- Sem delete: exclusao e sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.investment_returns to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `investment_returns` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Mesmo padrao esperado de 0017/0027/0032/
-- 0036/0039: select/insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera investidores no produto real), sem delete.
-- ---------------------------------------------------------------------
