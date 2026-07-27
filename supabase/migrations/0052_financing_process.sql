-- 0052_financing_process.sql
-- Portal do Cliente (Módulo 11) — correção de rota: o schema anterior
-- (0048/0049/0050/0051) foi desenhado em cima de `src/pages/
-- ClientPortal.jsx`, que é uma página órfã (não linkada em `Layout.jsx`,
-- nunca navegável). O portal do cliente REAL é o conjunto de 3 páginas
-- ligadas em `Layout.jsx` (seção "PORTAL DO CLIENTE"): `ClientUnit.jsx`,
-- `ClientFinance.jsx`, `ClientMaintenance.jsx`. Das três, só
-- `ClientFinance.jsx` precisa de tabela nova — `ClientUnit.jsx` usa apenas
-- `clients`/`deals`/`units`/`projects` (já existentes) e
-- `ClientMaintenance.jsx` usa apenas `maintenance_requests` (já existente,
-- 0037) — nenhuma coluna faltando em nenhuma das duas.
--
-- `financing_process` (entidade `FinancingProcess` no original): processo
-- de financiamento bancário de uma `finance_account`, exibido em duas
-- telas — `ClientFinance.jsx` (portal do cliente, só leitura) e
-- `FinanceDetail.jsx` (lado admin, também só leitura). Confirmado
-- `grep -rn "FinancingProcess" src` no projeto inteiro: só esses dois
-- arquivos usam a entidade, e nenhum dos dois cria/edita
-- (`FinancingProcess.create`/`.update` não aparece em lugar nenhum de
-- `src`) — o processo é alimentado fora do app (ex.: direto no admin do
-- Base44), não por um formulário na aplicação. Fica registrado como
-- observação, não como constraint: não há regra de "quem escreve" para
-- confirmar aqui.
--
-- Campos confirmados — mesmos 4 usados nas DUAS telas
-- (`ClientFinance.jsx` linhas 247-259, `FinanceDetail.jsx` linhas
-- 513-523), sem nenhum campo adicional em nenhuma das duas:
--   - `finance_account_id`: FK obrigatória — vínculo usado no filter
--     `financing.finance_account_id === account.id` (ClientFinance.jsx
--     linha 145-147) e no filter direto por query
--     (`FinancingProcess.filter({ finance_account_id: accountId })`,
--     FinanceDetail.jsx linha 95).
--   - `banco`: texto livre (`financing.banco`, sem enum/lista fixa em
--     nenhuma das duas telas).
--   - `status`: enum com 8 valores — confirmados idênticos em
--     `FINANCING_STATUS_COLORS` nas DUAS telas (ClientFinance.jsx linhas
--     25-34, FinanceDetail.jsx linhas 52-61): NAO_INICIADO,
--     DOCUMENTOS_PENDENTES, EM_ANALISE, APROVADO, ASSINATURA, LIBERADO,
--     REPROVADO, CANCELADO. Nenhuma outra tela usa a entidade, então não
--     há valor adicional a confirmar.
--   - `valor_aprovado`: numeric, nullable — só exibido quando truthy em
--     ambas as telas (`financing.valor_aprovado &&`/`|| 0`), nunca
--     obrigatório.
--
-- `is_deleted`: soft delete padrão do projeto. Confirmado no filter das
-- duas telas (`.filter({ is_deleted: false })`/`.filter((f) =>
-- !f.is_deleted)`) — mesmo padrão de toda outra tabela do domínio.
-- `deleted_at`/`deleted_by_user_id` seguem o mesmo padrão mesmo sem uso
-- direto confirmado em `src` (consistência com todas as outras tabelas de
-- soft delete do projeto, nenhuma tela do original testa esses dois campos
-- isoladamente em lugar nenhum do domínio).
--
-- Cardinalidade não confirmada: `ClientFinance.jsx` (linha 145-147) filtra
-- `financing_process` por `finance_account_id` e pega só o primeiro
-- resultado (`[0]`) em vez de assumir 1:1 — não há `unique` aqui de
-- propósito, para não inventar uma constraint que o original não impõe
-- (pode haver mais de um processo de financiamento histórico por conta,
-- ex. banco trocado).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente
-- — mesmo padrão de 0001/.../0051, incluindo o caso `tenant_role =
-- 'cliente'` lendo só o financiamento da própria `finance_account`
-- (introduzido em 0051).

-- 1. Enum de status. Confirmado idêntico em FINANCING_STATUS_COLORS nas
--    duas telas que usam a entidade (ClientFinance.jsx e
--    FinanceDetail.jsx).
create type financing_status as enum (
  'nao_iniciado',
  'documentos_pendentes',
  'em_analise',
  'aprovado',
  'assinatura',
  'liberado',
  'reprovado',
  'cancelado'
);

-- 2. financing_process
create table financing_process (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamento
  finance_account_id uuid not null references finance_accounts(id),

  banco text,
  status financing_status not null default 'nao_iniciado',
  valor_aprovado numeric(14, 2),

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

comment on table financing_process is
  'Processo de financiamento bancário de uma finance_account '
  '(ClientFinance.jsx no portal do cliente, FinanceDetail.jsx no admin — '
  'ambas só leitura no original, sem create/update em nenhum lugar de '
  'src). Não é 1:1 com finance_accounts de propósito: o original filtra '
  'por finance_account_id e pega o primeiro resultado, sem assumir '
  'unicidade.';

comment on column financing_process.banco is
  'Texto livre — sem enum/lista fixa confirmada em nenhuma das duas telas '
  'que exibem o campo.';

comment on column financing_process.status is
  '8 valores confirmados idênticos em FINANCING_STATUS_COLORS nas duas '
  'telas que usam a entidade (ClientFinance.jsx e FinanceDetail.jsx).';

comment on column financing_process.valor_aprovado is
  'Nullable — exibido só quando truthy em ambas as telas, nunca '
  'obrigatório no original.';

-- 3. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index financing_process_tenant_id_created_at_idx
  on financing_process (tenant_id, created_at);

create index financing_process_tenant_id_finance_account_id_idx
  on financing_process (tenant_id, finance_account_id);

create index financing_process_tenant_id_status_idx
  on financing_process (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_financing_process_updated_at
  before update on financing_process
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/.../0050: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.financing_process to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `financing_process` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
