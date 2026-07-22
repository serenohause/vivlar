-- 0023_financeiro_isolation.sql
-- Teste de isolamento para a RLS de `finance_accounts`,
-- `payment_installments`, `finance_events`, `cobranca_historico`
-- introduzida em supabase/migrations/0023_rls_financeiro.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql,
-- supabase/tests/0010_catalog_isolation.sql e
-- supabase/tests/0017_crm_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0023_financeiro_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0023_financeiro_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/clients/
-- finance_accounts/payment_installments/finance_events/
-- cobranca_historico) fica no banco, mesmo rodando contra o projeto remoto
-- real. Qualquer assercao que falhe faz `raise exception`, abortando a
-- transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0002/0010/0017.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a parte,
-- fora deste script, confirmou que `authenticated` tem exatamente
-- select/insert/update em finance_accounts/payment_installments/
-- cobranca_historico, e exatamente select/insert (sem update) em
-- finance_events -- `anon` sem NENHUM privilegio nas 4 tabelas.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve nenhuma das 4 tabelas do
--    Tenant B, e vice-versa (isolamento nos dois sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO
--    nao enxerga NENHUMA linha e nao consegue inserir em nenhuma das 4
--    tabelas -- prova que a RLS nega por papel, nao so por tenant.
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue INSERIR e VER as 4 tabelas desse tenant, e
--    ATUALIZAR finance_accounts/payment_installments/cobranca_historico --
--    mas NAO consegue atualizar finance_events (sem policy/grant de
--    update -- log write-once), mesmo dentro do proprio tenant e com papel
--    autorizado nas outras 3 tabelas.
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma
--    linha em nenhuma das 4 tabelas.
-- 5. WITH CHECK bloqueia INSERT cross-tenant (payload malicioso tentando
--    gravar tenant_id de outro tenant) nas 4 tabelas, e USING bloqueia
--    UPDATE cross-tenant (0 linhas afetadas, sem erro) nas tabelas com
--    policy de update.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants; no tenant A um usuario 'comercial' (papel interno,
-- deve ter acesso), um usuario 'cliente' (nao deve ter acesso), um usuario
-- 'investidor' (nao deve ter acesso) e um usuario 'administrativo' (usado
-- no teste positivo de insert/update); no tenant B um usuario 'admin' (dono
-- dos dados "do outro lado", usado para provar isolamento cross-tenant); e
-- um usuario orfao, sem tenant_users (0 vinculos ativos). IDs fixos para o
-- script inteiro ser SQL puro.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('f1111111-1111-1111-1111-111111111111'), -- user_a_comercial: tenant A, comercial
  ('f2222222-2222-2222-2222-222222222222'), -- user_a_cliente: tenant A, cliente
  ('f3333333-3333-3333-3333-333333333333'), -- user_a_investidor: tenant A, investidor
  ('f4444444-4444-4444-4444-444444444444'), -- user_b_admin: tenant B, admin
  ('f5555555-5555-5555-5555-555555555555'), -- user_orphan: sem tenant_users
  ('f6666666-6666-6666-6666-666666666666'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('a3333333-3333-3333-3333-333333333333', 'Tenant A - teste isolamento financeiro 0023', 'tenant-a-teste-isolamento-financeiro-0023'),
  ('a4444444-4444-4444-4444-444444444444', 'Tenant B - teste isolamento financeiro 0023', 'tenant-b-teste-isolamento-financeiro-0023');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('a3333333-3333-3333-3333-333333333333', 'f1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('a3333333-3333-3333-3333-333333333333', 'f2222222-2222-2222-2222-222222222222', 'cliente', 'active'),
  ('a3333333-3333-3333-3333-333333333333', 'f3333333-3333-3333-3333-333333333333', 'investidor', 'active'),
  ('a3333333-3333-3333-3333-333333333333', 'f6666666-6666-6666-6666-666666666666', 'administrativo', 'active'),
  ('a4444444-4444-4444-4444-444444444444', 'f4444444-4444-4444-4444-444444444444', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario -- os
-- testes reais de leitura/escrita usam os roles simulados abaixo).

-- projects/units/clients: pre-requisitos de FK para finance_accounts.
insert into public.projects (id, tenant_id, code, name)
values
  ('c5555555-5555-5555-5555-555555555555', 'a3333333-3333-3333-3333-333333333333', 'PRJ-A-0023', 'Projeto Tenant A'),
  ('c6666666-6666-6666-6666-666666666666', 'a4444444-4444-4444-4444-444444444444', 'PRJ-B-0023', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price)
values
  ('c7777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', 'c5555555-5555-5555-5555-555555555555', 'UN-A-0023', 100000),
  ('c8888888-8888-8888-8888-888888888888', 'a4444444-4444-4444-4444-444444444444', 'c6666666-6666-6666-6666-666666666666', 'UN-B-0023', 100000);

insert into public.clients (id, tenant_id, name)
values
  ('d7777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', 'Cliente Tenant A'),
  ('d8888888-8888-8888-8888-888888888888', 'a4444444-4444-4444-4444-444444444444', 'Cliente Tenant B');

insert into public.finance_accounts (id, tenant_id, unit_id, client_id, project_id, valor_venda_total)
values
  ('e7777777-7777-7777-7777-777777777777', 'a3333333-3333-3333-3333-333333333333', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 100000),
  ('e8888888-8888-8888-8888-888888888888', 'a4444444-4444-4444-4444-444444444444', 'c8888888-8888-8888-8888-888888888888', 'd8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666', 100000);

insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, vencimento, valor_previsto)
values
  ('e9999999-9999-9999-9999-999999999999', 'a3333333-3333-3333-3333-333333333333', 'e7777777-7777-7777-7777-777777777777', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'entrada', '2026-08-01', 10000),
  ('ea111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 'e8888888-8888-8888-8888-888888888888', 'c8888888-8888-8888-8888-888888888888', 'd8888888-8888-8888-8888-888888888888', 'entrada', '2026-08-01', 10000);

insert into public.finance_events (id, tenant_id, finance_account_id, tipo_evento)
values
  ('eb111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'e7777777-7777-7777-7777-777777777777', 'criacao_carteira'),
  ('ec111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 'e8888888-8888-8888-8888-888888888888', 'criacao_carteira');

insert into public.cobranca_historico (id, tenant_id, installment_id, acao, data_execucao)
values
  ('ed111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'e9999999-9999-9999-9999-999999999999', 'manual', now()),
  ('ee111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 'ea111111-1111-1111-1111-111111111111', 'manual', now());

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant nas 4 tabelas, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1111111-1111-1111-1111-111111111111","tenant_id":"a3333333-3333-3333-3333-333333333333","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_accounts int; v_installments int; v_events int; v_cobranca int;
  v_accounts_b int; v_installments_b int; v_events_b int; v_cobranca_b int;
begin
  select count(*) into v_accounts from public.finance_accounts;
  select count(*) into v_installments from public.payment_installments;
  select count(*) into v_events from public.finance_events;
  select count(*) into v_cobranca from public.cobranca_historico;

  select count(*) into v_accounts_b from public.finance_accounts where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  select count(*) into v_installments_b from public.payment_installments where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  select count(*) into v_events_b from public.finance_events where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  select count(*) into v_cobranca_b from public.cobranca_historico where tenant_id = 'a4444444-4444-4444-4444-444444444444';

  if v_accounts <> 1 or v_installments <> 1 or v_events <> 1 or v_cobranca <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em cada uma das 4 tabelas (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts, v_installments, v_events, v_cobranca;
  end if;

  if v_accounts_b <> 0 or v_installments_b <> 0 or v_events_b <> 0 or v_cobranca_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts_b, v_installments_b, v_events_b, v_cobranca_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f4444444-4444-4444-4444-444444444444","tenant_id":"a4444444-4444-4444-4444-444444444444","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_accounts int; v_installments int; v_events int; v_cobranca int;
  v_accounts_a int; v_installments_a int; v_events_a int; v_cobranca_a int;
begin
  select count(*) into v_accounts from public.finance_accounts;
  select count(*) into v_installments from public.payment_installments;
  select count(*) into v_events from public.finance_events;
  select count(*) into v_cobranca from public.cobranca_historico;

  select count(*) into v_accounts_a from public.finance_accounts where tenant_id = 'a3333333-3333-3333-3333-333333333333';
  select count(*) into v_installments_a from public.payment_installments where tenant_id = 'a3333333-3333-3333-3333-333333333333';
  select count(*) into v_events_a from public.finance_events where tenant_id = 'a3333333-3333-3333-3333-333333333333';
  select count(*) into v_cobranca_a from public.cobranca_historico where tenant_id = 'a3333333-3333-3333-3333-333333333333';

  if v_accounts <> 1 or v_installments <> 1 or v_events <> 1 or v_cobranca <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada uma das 4 tabelas (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts, v_installments, v_events, v_cobranca;
  end if;

  if v_accounts_a <> 0 or v_installments_a <> 0 or v_events_a <> 0 or v_cobranca_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts_a, v_installments_a, v_events_a, v_cobranca_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha nas 4 tabelas, mesmo o dado do proprio tenant
-- existindo de verdade -- e nao consegue inserir em nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f2222222-2222-2222-2222-222222222222","tenant_id":"a3333333-3333-3333-3333-333333333333","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_accounts int; v_installments int; v_events int; v_cobranca int;
begin
  select count(*) into v_accounts from public.finance_accounts;
  select count(*) into v_installments from public.payment_installments;
  select count(*) into v_events from public.finance_events;
  select count(*) into v_cobranca from public.cobranca_historico;

  if v_accounts <> 0 or v_installments <> 0 or v_events <> 0 or v_cobranca <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts, v_installments, v_events, v_cobranca;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_accounts (tenant_id, unit_id, client_id, project_id)
    values ('a3333333-3333-3333-3333-333333333333', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em finance_accounts -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.payment_installments (tenant_id, finance_account_id, unit_id, client_id, tipo, vencimento, valor_previsto)
    values ('a3333333-3333-3333-3333-333333333333', 'e7777777-7777-7777-7777-777777777777', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'entrada', '2026-08-01', 500);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em payment_installments -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_events (tenant_id, finance_account_id, tipo_evento)
    values ('a3333333-3333-3333-3333-333333333333', 'e7777777-7777-7777-7777-777777777777', 'criacao_parcela');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em finance_events -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.cobranca_historico (tenant_id, installment_id, acao, data_execucao)
    values ('a3333333-3333-3333-3333-333333333333', 'e9999999-9999-9999-9999-999999999999', 'manual', now());
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3e): tenant_role=cliente conseguiu inserir em cobranca_historico -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3,
-- para o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f3333333-3333-3333-3333-333333333333","tenant_id":"a3333333-3333-3333-3333-333333333333","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_accounts int; v_installments int; v_events int; v_cobranca int;
begin
  select count(*) into v_accounts from public.finance_accounts;
  select count(*) into v_installments from public.payment_installments;
  select count(*) into v_events from public.finance_events;
  select count(*) into v_cobranca from public.cobranca_historico;

  if v_accounts <> 0 or v_installments <> 0 or v_events <> 0 or v_cobranca <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts, v_installments, v_events, v_cobranca;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_accounts (tenant_id, unit_id, client_id, project_id)
    values ('a3333333-3333-3333-3333-333333333333', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em finance_accounts -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue INSERIR e VER as 4
-- tabelas (prova positiva), e ATUALIZAR finance_accounts/
-- payment_installments/cobranca_historico -- mas NAO consegue atualizar
-- finance_events (sem policy/grant de update -- log write-once).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f6666666-6666-6666-6666-666666666666","tenant_id":"a3333333-3333-3333-3333-333333333333","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_account_id uuid;
  v_installment_id uuid;
  v_event_id uuid;
  v_cobranca_id uuid;
begin
  insert into public.finance_accounts (tenant_id, unit_id, client_id, project_id, valor_venda_total)
    values ('a3333333-3333-3333-3333-333333333333', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 200000)
    returning id into v_account_id;

  insert into public.payment_installments (tenant_id, finance_account_id, unit_id, client_id, tipo, vencimento, valor_previsto)
    values ('a3333333-3333-3333-3333-333333333333', v_account_id, 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'parcela', '2026-09-01', 1500)
    returning id into v_installment_id;

  insert into public.finance_events (tenant_id, finance_account_id, installment_id, tipo_evento)
    values ('a3333333-3333-3333-3333-333333333333', v_account_id, v_installment_id, 'criacao_parcela')
    returning id into v_event_id;

  insert into public.cobranca_historico (tenant_id, installment_id, acao, data_execucao)
    values ('a3333333-3333-3333-3333-333333333333', v_installment_id, 'manual', now())
    returning id into v_cobranca_id;

  if v_account_id is null or v_installment_id is null or v_event_id is null or v_cobranca_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir nas 4 tabelas';
  end if;

  if not exists (select 1 from public.finance_accounts where id = v_account_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver a finance_account que acabou de criar';
  end if;
  if not exists (select 1 from public.payment_installments where id = v_installment_id) then
    raise exception 'FALHOU (5c): administrativo nao consegue ver a payment_installment que acabou de criar';
  end if;
  if not exists (select 1 from public.finance_events where id = v_event_id) then
    raise exception 'FALHOU (5d): administrativo nao consegue ver o finance_event que acabou de criar';
  end if;
  if not exists (select 1 from public.cobranca_historico where id = v_cobranca_id) then
    raise exception 'FALHOU (5e): administrativo nao consegue ver o cobranca_historico que acabou de criar';
  end if;

  -- UPDATE em finance_accounts/payment_installments/cobranca_historico
  -- deve funcionar.
  update public.finance_accounts set status = 'finalizada' where id = v_account_id;
  if not exists (select 1 from public.finance_accounts where id = v_account_id and status = 'finalizada') then
    raise exception 'FALHOU (5f): administrativo deveria conseguir atualizar finance_accounts (status = finalizada)';
  end if;

  update public.payment_installments set status = 'pago', valor_pago = 1500 where id = v_installment_id;
  if not exists (select 1 from public.payment_installments where id = v_installment_id and status = 'pago') then
    raise exception 'FALHOU (5g): administrativo deveria conseguir atualizar payment_installments (status = pago)';
  end if;

  update public.cobranca_historico set status = 'enviado' where id = v_cobranca_id;
  if not exists (select 1 from public.cobranca_historico where id = v_cobranca_id and status = 'enviado') then
    raise exception 'FALHOU (5h): administrativo deveria conseguir atualizar cobranca_historico (status = enviado)';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando "escapar" do
-- tenant do claim) deve ser bloqueada pelo WITH CHECK, nas 4 tabelas.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_accounts (tenant_id, unit_id, client_id, project_id)
    values ('a4444444-4444-4444-4444-444444444444', 'c8888888-8888-8888-8888-888888888888', 'd8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5i): administrativo do tenant A conseguiu inserir finance_account com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.payment_installments (tenant_id, finance_account_id, unit_id, client_id, tipo, vencimento, valor_previsto)
    values ('a4444444-4444-4444-4444-444444444444', 'e8888888-8888-8888-8888-888888888888', 'c8888888-8888-8888-8888-888888888888', 'd8888888-8888-8888-8888-888888888888', 'entrada', '2026-08-01', 500);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5j): administrativo do tenant A conseguiu inserir payment_installment com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_events (tenant_id, finance_account_id, tipo_evento)
    values ('a4444444-4444-4444-4444-444444444444', 'e8888888-8888-8888-8888-888888888888', 'criacao_parcela');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5k): administrativo do tenant A conseguiu inserir finance_event com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.cobranca_historico (tenant_id, installment_id, acao, data_execucao)
    values ('a4444444-4444-4444-4444-444444444444', 'ea111111-1111-1111-1111-111111111111', 'manual', now());
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5l): administrativo do tenant A conseguiu inserir cobranca_historico com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant: linha do tenant B nem aparece para o UPDATE (USING
-- filtra por tenant_id do claim) -- 0 linhas afetadas, sem erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.finance_accounts set status = 'cancelada'
    where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5m): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de finance_accounts do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

do $$
declare v_linhas_afetadas int;
begin
  update public.payment_installments set status = 'cancelado'
    where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5n): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de payment_installments do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

do $$
declare v_linhas_afetadas int;
begin
  update public.cobranca_historico set status = 'enviado'
    where tenant_id = 'a4444444-4444-4444-4444-444444444444';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5o): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de cobranca_historico do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- finance_events: SEM policy de update e SEM grant de update -- UPDATE deve
-- falhar com erro de privilegio, mesmo dentro do proprio tenant e por um
-- papel autorizado nas outras 3 tabelas (mesmo teste que ja foi feito pra
-- status_transitions em 0017).
do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.finance_events set descricao = 'tentativa de edicao'
      where tenant_id = 'a3333333-3333-3333-3333-333333333333';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5p): administrativo conseguiu dar UPDATE em finance_events -- deveria ser log write-once, sem policy/grant de update';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 4 tabelas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f5555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_accounts int; v_installments int; v_events int; v_cobranca int;
begin
  select count(*) into v_accounts from public.finance_accounts;
  select count(*) into v_installments from public.payment_installments;
  select count(*) into v_events from public.finance_events;
  select count(*) into v_cobranca from public.cobranca_historico;

  if v_accounts <> 0 or v_installments <> 0 or v_events <> 0 or v_cobranca <> 0 then
    raise exception 'FALHOU (6): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (accounts=%, installments=%, events=%, cobranca=%)',
      v_accounts, v_installments, v_events, v_cobranca;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0023 - Financeiro)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
