-- 0023_rls_financeiro.sql
-- RLS do Financeiro: `finance_accounts`, `payment_installments`,
-- `finance_events`, `cobranca_historico`. Fecha a lacuna deixada de
-- proposito em 0019-0022 (RLS PENDENTE), seguindo exatamente o padrao ja
-- estabelecido em 0002/0010/0017
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, nunca tenant_id vindo
-- do client/body da requisicao).
--
-- REGRA DE AUTORIZACAO (mesma leva do CRM, 0017): so a equipe interna do
-- tenant mexe no financeiro. `tenant_role in ('admin', 'comercial',
-- 'administrativo')` do tenant certo (via claim) tem select/insert nas 4
-- tabelas, e update onde fizer sentido (ver por tabela abaixo).
-- `cliente`/`investidor` NAO tem nenhuma policy aqui -- RLS nega tudo por
-- padrao pra eles, de proposito (portal do cliente ver a propria conta
-- financeira e feature futura, nao esta em escopo nesta leva).
--
-- SEM POLICY DE DELETE em `finance_accounts`/`payment_installments`/
-- `cobranca_historico`: exclusao e sempre soft delete (`is_deleted = true`
-- via UPDATE, ja coberto pela policy de UPDATE dessas 3 tabelas).
-- `finance_events` e log write-once, sem coluna is_deleted -- tambem sem
-- policy de delete (nem faz sentido cogitar exclusao fisica de log).
--
-- UPDATE em finance_events -- decisao ja tomada pelo schema-architect na
-- migration 0021 (mesmo criterio de status_transitions em 0016/0017): log
-- write-once, SEM policy de UPDATE. So ha `FinanceEvent.create`/`.filter`
-- no fluxo em escopo -- a unica leva que chama `FinanceEvent.update` e
-- `financeCheckup.jsx`, explicitamente fora de escopo (ver comentario em
-- 0021_finance_events.sql).
--
-- GRANTS: 0019/0020/0022 ja concederam `select, insert, update` a
-- `authenticated` (correto para finance_accounts/payment_installments/
-- cobranca_historico -- todas tem update policy abaixo). 0021 concedeu
-- exatamente `select, insert` (sem update) a `authenticated` em
-- finance_events -- correto, coerente com a ausencia de policy de UPDATE
-- ali. Nada concedido a `anon` em nenhuma das 4 -- confirmado por
-- auditoria pos-push em information_schema.role_table_grants (ver commit).
-- Nenhum REVOKE necessario aqui (diferente de 0017/status_transitions,
-- onde 0016 tinha concedido update por engano) -- os grants de 0019-0022
-- ja saem corretos.

-- =======================================================================
-- 1. finance_accounts
-- =======================================================================

alter table public.finance_accounts enable row level security;

create policy "finance_accounts_select_tenant_team"
  on public.finance_accounts
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "finance_accounts_insert_tenant_team"
  on public.finance_accounts
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "finance_accounts_update_tenant_team"
  on public.finance_accounts
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "finance_accounts_select_tenant_team" on public.finance_accounts is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao financeiro interno nesta '
  'leva (portal do cliente ver a propria conta e feature futura).';

-- =======================================================================
-- 2. payment_installments
-- =======================================================================

alter table public.payment_installments enable row level security;

create policy "payment_installments_select_tenant_team"
  on public.payment_installments
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "payment_installments_insert_tenant_team"
  on public.payment_installments
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "payment_installments_update_tenant_team"
  on public.payment_installments
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "payment_installments_select_tenant_team" on public.payment_installments is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao financeiro interno nesta '
  'leva.';

-- =======================================================================
-- 3. finance_events
-- =======================================================================

alter table public.finance_events enable row level security;

create policy "finance_events_select_tenant_team"
  on public.finance_events
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "finance_events_insert_tenant_team"
  on public.finance_events
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE de proposito: log write-once (ver comentario no
-- topo do arquivo e em 0021_finance_events.sql). Grant de update tambem
-- nao foi concedido em 0021 -- nada a revogar aqui.

comment on policy "finance_events_select_tenant_team" on public.finance_events is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao financeiro interno nesta '
  'leva. Sem policy de UPDATE: log write-once, mesmo criterio de '
  'status_transitions (0016/0017) -- so FinanceEvent.create/.filter no '
  'fluxo em escopo.';

-- =======================================================================
-- 4. cobranca_historico
-- =======================================================================

alter table public.cobranca_historico enable row level security;

create policy "cobranca_historico_select_tenant_team"
  on public.cobranca_historico
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "cobranca_historico_insert_tenant_team"
  on public.cobranca_historico
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "cobranca_historico_update_tenant_team"
  on public.cobranca_historico
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "cobranca_historico_select_tenant_team" on public.cobranca_historico is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao financeiro interno nesta '
  'leva.';

-- =======================================================================
-- Grants: nenhuma correcao necessaria -- reafirmacao auditavel.
-- =======================================================================

-- finance_accounts/payment_installments/cobranca_historico ja tem
-- exatamente `select, insert, update` concedido a `authenticated` desde
-- 0019/0020/0022 (grant e cumulativo/idempotente -- reconceder aqui so
-- adicionaria ruido). finance_events ja tem exatamente `select, insert`
-- desde 0021 -- coerente com a ausencia de policy de UPDATE acima. Nada
-- concedido a `anon` em nenhuma das 4 tabelas. Confirmado via auditoria
-- pos-push em information_schema.role_table_grants (ver commit) que:
--   * finance_accounts/payment_installments/cobranca_historico:
--     authenticated tem exatamente select/insert/update; anon, nenhum
--     privilegio.
--   * finance_events: authenticated tem exatamente select/insert; anon,
--     nenhum privilegio.
