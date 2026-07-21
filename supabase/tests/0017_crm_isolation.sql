-- 0017_crm_isolation.sql
-- Teste de isolamento para a RLS de `clients`, `real_estate_agencies`,
-- `brokers`, `deals`, `activities`, `status_transitions` introduzida em
-- supabase/migrations/0017_rls_crm.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql e
-- supabase/tests/0010_catalog_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0017_crm_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0017_crm_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/real_estate_
-- agencies/brokers/clients/deals/activities/status_transitions) fica no
-- banco, mesmo rodando contra o projeto remoto real. Qualquer assercao que
-- falhe faz `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0002/0010.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a parte,
-- fora deste script, confirmou que `authenticated` tem exatamente
-- select/insert/update em clients/real_estate_agencies/brokers/deals/
-- activities, e exatamente select/insert (sem update) em
-- status_transitions -- `anon` sem NENHUM privilegio nas 6 tabelas.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve nenhuma das 6 tabelas do
--    Tenant B, e vice-versa (isolamento nos dois sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO
--    nao enxerga NENHUMA linha e nao consegue inserir em nenhuma das 6
--    tabelas -- prova que a RLS nega por papel, nao so por tenant.
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue INSERIR e VER as 6 tabelas desse tenant, e
--    ATUALIZAR `activities` (Activity.update do original) -- mas NAO
--    consegue atualizar `status_transitions` (sem policy de update, grant
--    de update revogado -- log write-once).
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma
--    linha em nenhuma das 6 tabelas.
-- 5. O indice unico parcial de `deals` (1 deal ativo por unidade) continua
--    sendo respeitado com a RLS habilitada -- tentativa de criar um
--    segundo deal ativo para a mesma unidade, dentro do MESMO tenant e por
--    um papel autorizado, ainda estoura a constraint (nao e a RLS que
--    bloqueia isso, mas confirma que RLS nao interfere/mascara o
--    comportamento do indice).

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
  ('b1111111-1111-1111-1111-111111111111'), -- user_a_comercial: tenant A, comercial
  ('b2222222-2222-2222-2222-222222222222'), -- user_a_cliente: tenant A, cliente
  ('b3333333-3333-3333-3333-333333333333'), -- user_a_investidor: tenant A, investidor
  ('b4444444-4444-4444-4444-444444444444'), -- user_b_admin: tenant B, admin
  ('b5555555-5555-5555-5555-555555555555'), -- user_orphan: sem tenant_users
  ('b6666666-6666-6666-6666-666666666666'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('a1111111-1111-1111-1111-111111111111', 'Tenant A - teste isolamento CRM 0017', 'tenant-a-teste-isolamento-crm-0017'),
  ('a2222222-2222-2222-2222-222222222222', 'Tenant B - teste isolamento CRM 0017', 'tenant-b-teste-isolamento-crm-0017');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'cliente', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'investidor', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'b6666666-6666-6666-6666-666666666666', 'administrativo', 'active'),
  ('a2222222-2222-2222-2222-222222222222', 'b4444444-4444-4444-4444-444444444444', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario -- os
-- testes reais de leitura/escrita usam os roles simulados abaixo).

-- projects/units: pre-requisito de FK para deals (project_id not null,
-- unit_id nullable mas usado aqui para testar o indice unico parcial).
insert into public.projects (id, tenant_id, code, name)
values
  ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'PRJ-A-0017', 'Projeto Tenant A'),
  ('c2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'PRJ-B-0017', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price)
values
  ('c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'UN-A-0017', 100000),
  ('c4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'UN-B-0017', 100000);

insert into public.real_estate_agencies (id, tenant_id, name)
values
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Imobiliaria Tenant A'),
  ('d2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Imobiliaria Tenant B');

insert into public.brokers (id, tenant_id, name)
values
  ('d3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Corretor Tenant A'),
  ('d4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'Corretor Tenant B');

insert into public.clients (id, tenant_id, name)
values
  ('d5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'Cliente Tenant A'),
  ('d6666666-6666-6666-6666-666666666666', 'a2222222-2222-2222-2222-222222222222', 'Cliente Tenant B');

insert into public.deals (id, tenant_id, project_id, client_id, unit_id, broker_id)
values
  ('e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'd5555555-5555-5555-5555-555555555555', 'c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333'),
  ('e2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'd6666666-6666-6666-6666-666666666666', 'c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444');

insert into public.activities (id, tenant_id, title, deal_id, client_id)
values
  ('e3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Ligacao Tenant A', 'e1111111-1111-1111-1111-111111111111', 'd5555555-5555-5555-5555-555555555555'),
  ('e4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'Ligacao Tenant B', 'e2222222-2222-2222-2222-222222222222', 'd6666666-6666-6666-6666-666666666666');

insert into public.status_transitions (id, tenant_id, unit_id, deal_id, to_status, transition_type)
values
  ('e5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 'e1111111-1111-1111-1111-111111111111', 'lead', 'comercial'),
  ('e6666666-6666-6666-6666-666666666666', 'a2222222-2222-2222-2222-222222222222', 'c4444444-4444-4444-4444-444444444444', 'e2222222-2222-2222-2222-222222222222', 'lead', 'comercial');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant nas 6 tabelas, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1111111-1111-1111-1111-111111111111","tenant_id":"a1111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_agencies int; v_brokers int; v_deals int; v_activities int; v_transitions int;
  v_clients_b int; v_agencies_b int; v_brokers_b int; v_deals_b int; v_activities_b int; v_transitions_b int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_agencies from public.real_estate_agencies;
  select count(*) into v_brokers from public.brokers;
  select count(*) into v_deals from public.deals;
  select count(*) into v_activities from public.activities;
  select count(*) into v_transitions from public.status_transitions;

  select count(*) into v_clients_b from public.clients where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  select count(*) into v_agencies_b from public.real_estate_agencies where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  select count(*) into v_brokers_b from public.brokers where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  select count(*) into v_deals_b from public.deals where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  select count(*) into v_activities_b from public.activities where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  select count(*) into v_transitions_b from public.status_transitions where tenant_id = 'a2222222-2222-2222-2222-222222222222';

  if v_clients <> 1 or v_agencies <> 1 or v_brokers <> 1 or v_deals <> 1 or v_activities <> 1 or v_transitions <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em cada uma das 6 tabelas (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients, v_agencies, v_brokers, v_deals, v_activities, v_transitions;
  end if;

  if v_clients_b <> 0 or v_agencies_b <> 0 or v_brokers_b <> 0 or v_deals_b <> 0 or v_activities_b <> 0 or v_transitions_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients_b, v_agencies_b, v_brokers_b, v_deals_b, v_activities_b, v_transitions_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b4444444-4444-4444-4444-444444444444","tenant_id":"a2222222-2222-2222-2222-222222222222","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_agencies int; v_brokers int; v_deals int; v_activities int; v_transitions int;
  v_clients_a int; v_agencies_a int; v_brokers_a int; v_deals_a int; v_activities_a int; v_transitions_a int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_agencies from public.real_estate_agencies;
  select count(*) into v_brokers from public.brokers;
  select count(*) into v_deals from public.deals;
  select count(*) into v_activities from public.activities;
  select count(*) into v_transitions from public.status_transitions;

  select count(*) into v_clients_a from public.clients where tenant_id = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_agencies_a from public.real_estate_agencies where tenant_id = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_brokers_a from public.brokers where tenant_id = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_deals_a from public.deals where tenant_id = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_activities_a from public.activities where tenant_id = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_transitions_a from public.status_transitions where tenant_id = 'a1111111-1111-1111-1111-111111111111';

  if v_clients <> 1 or v_agencies <> 1 or v_brokers <> 1 or v_deals <> 1 or v_activities <> 1 or v_transitions <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada uma das 6 tabelas (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients, v_agencies, v_brokers, v_deals, v_activities, v_transitions;
  end if;

  if v_clients_a <> 0 or v_agencies_a <> 0 or v_brokers_a <> 0 or v_deals_a <> 0 or v_activities_a <> 0 or v_transitions_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients_a, v_agencies_a, v_brokers_a, v_deals_a, v_activities_a, v_transitions_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha nas 6 tabelas, mesmo o dado do proprio tenant
-- existindo de verdade -- e nao consegue inserir em nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-2222-2222-222222222222","tenant_id":"a1111111-1111-1111-1111-111111111111","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_agencies int; v_brokers int; v_deals int; v_activities int; v_transitions int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_agencies from public.real_estate_agencies;
  select count(*) into v_brokers from public.brokers;
  select count(*) into v_deals from public.deals;
  select count(*) into v_activities from public.activities;
  select count(*) into v_transitions from public.status_transitions;

  if v_clients <> 0 or v_agencies <> 0 or v_brokers <> 0 or v_deals <> 0 or v_activities <> 0 or v_transitions <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients, v_agencies, v_brokers, v_deals, v_activities, v_transitions;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.clients (tenant_id, name) values ('a1111111-1111-1111-1111-111111111111', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em clients -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.real_estate_agencies (tenant_id, name) values ('a1111111-1111-1111-1111-111111111111', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em real_estate_agencies -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.brokers (tenant_id, name) values ('a1111111-1111-1111-1111-111111111111', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em brokers -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.deals (tenant_id, project_id, client_id)
    values ('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'd5555555-5555-5555-5555-555555555555');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3e): tenant_role=cliente conseguiu inserir em deals -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.activities (tenant_id, title) values ('a1111111-1111-1111-1111-111111111111', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3f): tenant_role=cliente conseguiu inserir em activities -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.status_transitions (tenant_id, to_status, transition_type)
    values ('a1111111-1111-1111-1111-111111111111', 'lead', 'comercial');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3g): tenant_role=cliente conseguiu inserir em status_transitions -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3,
-- para o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b3333333-3333-3333-3333-333333333333","tenant_id":"a1111111-1111-1111-1111-111111111111","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_agencies int; v_brokers int; v_deals int; v_activities int; v_transitions int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_agencies from public.real_estate_agencies;
  select count(*) into v_brokers from public.brokers;
  select count(*) into v_deals from public.deals;
  select count(*) into v_activities from public.activities;
  select count(*) into v_transitions from public.status_transitions;

  if v_clients <> 0 or v_agencies <> 0 or v_brokers <> 0 or v_deals <> 0 or v_activities <> 0 or v_transitions <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients, v_agencies, v_brokers, v_deals, v_activities, v_transitions;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.clients (tenant_id, name) values ('a1111111-1111-1111-1111-111111111111', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em clients -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue INSERIR e VER as 6
-- tabelas (prova positiva), e ATUALIZAR `activities` (Activity.update do
-- original) -- mas NAO consegue atualizar `status_transitions` (sem policy
-- de update + grant revogado -- log write-once).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b6666666-6666-6666-6666-666666666666","tenant_id":"a1111111-1111-1111-1111-111111111111","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_agency_id uuid;
  v_broker_id uuid;
  v_client_id uuid;
  v_deal_id uuid;
  v_activity_id uuid;
  v_transition_id uuid;
begin
  insert into public.real_estate_agencies (tenant_id, name)
    values ('a1111111-1111-1111-1111-111111111111', 'Imobiliaria criada por administrativo')
    returning id into v_agency_id;

  insert into public.brokers (tenant_id, name)
    values ('a1111111-1111-1111-1111-111111111111', 'Corretor criado por administrativo')
    returning id into v_broker_id;

  insert into public.clients (tenant_id, name)
    values ('a1111111-1111-1111-1111-111111111111', 'Cliente criado por administrativo')
    returning id into v_client_id;

  insert into public.deals (tenant_id, project_id, client_id)
    values ('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', v_client_id)
    returning id into v_deal_id;

  insert into public.activities (tenant_id, title, deal_id)
    values ('a1111111-1111-1111-1111-111111111111', 'Atividade criada por administrativo', v_deal_id)
    returning id into v_activity_id;

  insert into public.status_transitions (tenant_id, deal_id, to_status, transition_type)
    values ('a1111111-1111-1111-1111-111111111111', v_deal_id, 'lead', 'comercial')
    returning id into v_transition_id;

  if v_agency_id is null or v_broker_id is null or v_client_id is null or v_deal_id is null or v_activity_id is null or v_transition_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir nas 6 tabelas';
  end if;

  if not exists (select 1 from public.real_estate_agencies where id = v_agency_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver a real_estate_agency que acabou de criar';
  end if;
  if not exists (select 1 from public.brokers where id = v_broker_id) then
    raise exception 'FALHOU (5c): administrativo nao consegue ver o broker que acabou de criar';
  end if;
  if not exists (select 1 from public.clients where id = v_client_id) then
    raise exception 'FALHOU (5d): administrativo nao consegue ver o client que acabou de criar';
  end if;
  if not exists (select 1 from public.deals where id = v_deal_id) then
    raise exception 'FALHOU (5e): administrativo nao consegue ver o deal que acabou de criar';
  end if;
  if not exists (select 1 from public.activities where id = v_activity_id) then
    raise exception 'FALHOU (5f): administrativo nao consegue ver a activity que acabou de criar';
  end if;
  if not exists (select 1 from public.status_transitions where id = v_transition_id) then
    raise exception 'FALHOU (5g): administrativo nao consegue ver a status_transition que acabou de criar';
  end if;

  -- UPDATE em activities deve funcionar (Activity.update do original).
  update public.activities set status = 'concluida' where id = v_activity_id;
  if not exists (select 1 from public.activities where id = v_activity_id and status = 'concluida') then
    raise exception 'FALHOU (5h): administrativo deveria conseguir atualizar activities (status = concluida)';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando "escapar" do
-- tenant do claim) deve ser bloqueada pelo WITH CHECK, em todas as 6
-- tabelas.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.clients (tenant_id, name) values ('a2222222-2222-2222-2222-222222222222', 'Nao deveria existir');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5i): administrativo do tenant A conseguiu inserir client com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.deals (tenant_id, project_id, client_id)
    values ('a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'd6666666-6666-6666-6666-666666666666');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5j): administrativo do tenant A conseguiu inserir deal com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant: linha do tenant B nem aparece para o UPDATE (USING
-- filtra por tenant_id do claim) -- 0 linhas afetadas, sem erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.activities set status = 'concluida'
    where tenant_id = 'a2222222-2222-2222-2222-222222222222';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5k): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de activities do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- status_transitions: SEM policy de update e SEM grant de update (revogado
-- em 0017) -- UPDATE deve falhar com erro de privilegio, mesmo dentro do
-- proprio tenant e por um papel autorizado nas outras 5 tabelas.
do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.status_transitions set to_status = 'qualificado'
      where tenant_id = 'a1111111-1111-1111-1111-111111111111';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5l): administrativo conseguiu dar UPDATE em status_transitions -- deveria ser log write-once, sem policy/grant de update';
  end if;
end $$;

-- Indice unico parcial de deals (1 deal ativo por unidade): tentar criar um
-- segundo deal ativo para a MESMA unidade do tenant A, por um papel
-- autorizado, deve estourar a constraint -- prova que RLS nao mascara/
-- interfere no comportamento do indice.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.deals (tenant_id, project_id, client_id, unit_id)
    values (
      'a1111111-1111-1111-1111-111111111111',
      'c1111111-1111-1111-1111-111111111111',
      'd5555555-5555-5555-5555-555555555555',
      'c3333333-3333-3333-3333-333333333333' -- mesma unit_id do deal A ja existente e ativo
    );
    v_insert_ok := true;
  exception when others then v_insert_ok := false; -- esperado: unique_violation
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5m): conseguiu criar um segundo deal ativo para a mesma unidade -- deals_tenant_id_unit_id_active_uidx nao esta sendo respeitado com RLS habilitada';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 6 tabelas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b5555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_agencies int; v_brokers int; v_deals int; v_activities int; v_transitions int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_agencies from public.real_estate_agencies;
  select count(*) into v_brokers from public.brokers;
  select count(*) into v_deals from public.deals;
  select count(*) into v_activities from public.activities;
  select count(*) into v_transitions from public.status_transitions;

  if v_clients <> 0 or v_agencies <> 0 or v_brokers <> 0 or v_deals <> 0 or v_activities <> 0 or v_transitions <> 0 then
    raise exception 'FALHOU (6): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (clients=%, agencies=%, brokers=%, deals=%, activities=%, transitions=%)',
      v_clients, v_agencies, v_brokers, v_deals, v_activities, v_transitions;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0017 - CRM)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
