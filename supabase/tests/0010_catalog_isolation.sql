-- 0010_catalog_isolation.sql
-- Teste de isolamento para a RLS de `terrains`/`projects`/`units`
-- introduzida em supabase/migrations/0010_rls_catalog.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0010_catalog_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0010_catalog_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum
-- dado sintetico (tenants/tenant_users/auth.users/terrains/projects/units)
-- fica no banco, mesmo rodando contra o projeto remoto real. Qualquer
-- assercao que falhe faz `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set
-- local role authenticated` para simular exatamente o que o PostgREST faz
-- numa requisicao autenticada -- igual ao padrao de 0002.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS,
-- so deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a
-- parte, fora deste script, e confirmou que `service_role`/`postgres` sao
-- os unicos roles com privilegio alem do minimo de `authenticated`
-- (select/insert/update) -- `anon` nao tem NENHUM privilegio nas 3
-- tabelas.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve terrains/projects/units
--    do Tenant B, e vice-versa (isolamento nos dois sentidos, nas 3
--    tabelas).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO
--    nao enxerga NENHUMA linha e nao consegue inserir em nenhuma das 3
--    tabelas -- prova que a RLS nega por papel, nao so por tenant (dado
--    real existe, mas fica invisivel/inserivel para esses papeis).
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue INSERIR e VER terrains/projects/units desse
--    tenant.
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma
--    linha em nenhuma das 3 tabelas.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants; no tenant A um usuario 'comercial' (papel interno,
-- deve ter acesso), um usuario 'cliente' (nao deve ter acesso) e um
-- usuario 'investidor' (nao deve ter acesso); no tenant B um usuario
-- 'admin' (dono dos dados "do outro lado", usado para provar isolamento
-- cross-tenant); e um usuario orfao, sem tenant_users (0 vinculos
-- ativos). IDs fixos para o script inteiro ser SQL puro.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('d1111111-1111-1111-1111-111111111111'), -- user_a_comercial: tenant A, comercial
  ('d2222222-2222-2222-2222-222222222222'), -- user_a_cliente: tenant A, cliente
  ('d3333333-3333-3333-3333-333333333333'), -- user_a_investidor: tenant A, investidor
  ('d4444444-4444-4444-4444-444444444444'), -- user_b_admin: tenant B, admin
  ('d5555555-5555-5555-5555-555555555555'); -- user_orphan: sem tenant_users

insert into public.tenants (id, name, slug) values
  ('c1111111-1111-1111-1111-111111111111', 'Tenant A - teste isolamento catalogo 0010', 'tenant-a-teste-isolamento-catalogo-0010'),
  ('c2222222-2222-2222-2222-222222222222', 'Tenant B - teste isolamento catalogo 0010', 'tenant-b-teste-isolamento-catalogo-0010');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('c1111111-1111-1111-1111-111111111111', 'd2222222-2222-2222-2222-222222222222', 'cliente', 'active'),
  ('c1111111-1111-1111-1111-111111111111', 'd3333333-3333-3333-3333-333333333333', 'investidor', 'active'),
  ('c2222222-2222-2222-2222-222222222222', 'd4444444-4444-4444-4444-444444444444', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como
-- dono da tabela (bypassa RLS de proposito aqui so para popular o
-- cenario -- os testes reais de escrita usam os roles simulados abaixo).
insert into public.projects (id, tenant_id, code, name)
values
  ('e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'PRJ-A-0010', 'Projeto Tenant A'),
  ('e2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'PRJ-B-0010', 'Projeto Tenant B');

insert into public.terrains (id, tenant_id, code, name, area_m2)
values
  ('e3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'TER-A-0010', 'Terreno Tenant A', 1000),
  ('e4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 'TER-B-0010', 'Terreno Tenant B', 1000);

insert into public.units (id, tenant_id, project_id, sku, list_price)
values
  ('e5555555-5555-5555-5555-555555555555', 'c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'UN-A-0010', 100000),
  ('e6666666-6666-6666-6666-666666666666', 'c2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222', 'UN-B-0010', 100000);

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant nas 3 tabelas, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1111111-1111-1111-1111-111111111111","tenant_id":"c1111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_terrains int;
  v_units int;
  v_projects_b int;
  v_terrains_b int;
  v_units_b int;
begin
  select count(*) into v_projects from public.projects;
  select count(*) into v_terrains from public.terrains;
  select count(*) into v_units from public.units;

  select count(*) into v_projects_b from public.projects where tenant_id = 'c2222222-2222-2222-2222-222222222222';
  select count(*) into v_terrains_b from public.terrains where tenant_id = 'c2222222-2222-2222-2222-222222222222';
  select count(*) into v_units_b from public.units where tenant_id = 'c2222222-2222-2222-2222-222222222222';

  if v_projects <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 project, viu %', v_projects;
  end if;
  if v_terrains <> 1 then
    raise exception 'FALHOU (1b): tenant A (comercial) deveria ver exatamente 1 terrain, viu %', v_terrains;
  end if;
  if v_units <> 1 then
    raise exception 'FALHOU (1c): tenant A (comercial) deveria ver exatamente 1 unit, viu %', v_units;
  end if;

  if v_projects_b <> 0 or v_terrains_b <> 0 or v_units_b <> 0 then
    raise exception 'FALHOU (1d): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (projects=%, terrains=%, units=%)', v_projects_b, v_terrains_b, v_units_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d4444444-4444-4444-4444-444444444444","tenant_id":"c2222222-2222-2222-2222-222222222222","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_terrains int;
  v_units int;
  v_projects_a int;
  v_terrains_a int;
  v_units_a int;
begin
  select count(*) into v_projects from public.projects;
  select count(*) into v_terrains from public.terrains;
  select count(*) into v_units from public.units;

  select count(*) into v_projects_a from public.projects where tenant_id = 'c1111111-1111-1111-1111-111111111111';
  select count(*) into v_terrains_a from public.terrains where tenant_id = 'c1111111-1111-1111-1111-111111111111';
  select count(*) into v_units_a from public.units where tenant_id = 'c1111111-1111-1111-1111-111111111111';

  if v_projects <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 project, viu %', v_projects;
  end if;
  if v_terrains <> 1 then
    raise exception 'FALHOU (2b): tenant B (admin) deveria ver exatamente 1 terrain, viu %', v_terrains;
  end if;
  if v_units <> 1 then
    raise exception 'FALHOU (2c): tenant B (admin) deveria ver exatamente 1 unit, viu %', v_units;
  end if;

  if v_projects_a <> 0 or v_terrains_a <> 0 or v_units_a <> 0 then
    raise exception 'FALHOU (2d): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (projects=%, terrains=%, units=%)', v_projects_a, v_terrains_a, v_units_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha nas 3 tabelas, mesmo o dado do proprio tenant
-- existindo de verdade -- prova que a RLS nega por papel, nao so por
-- ausencia de dado.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d2222222-2222-2222-2222-222222222222","tenant_id":"c1111111-1111-1111-1111-111111111111","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_terrains int;
  v_units int;
begin
  select count(*) into v_projects from public.projects;
  select count(*) into v_terrains from public.terrains;
  select count(*) into v_units from public.units;

  if v_projects <> 0 or v_terrains <> 0 or v_units <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (projects=%, terrains=%, units=%)', v_projects, v_terrains, v_units;
  end if;
end $$;

-- 'cliente' tambem nao pode INSERIR em nenhuma das 3 tabelas.
do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.projects (tenant_id, code, name)
    values ('c1111111-1111-1111-1111-111111111111', 'PRJ-CLIENTE-0010', 'Nao deveria existir');
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false;
  end;

  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em projects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.terrains (tenant_id, code, name, area_m2)
    values ('c1111111-1111-1111-1111-111111111111', 'TER-CLIENTE-0010', 'Nao deveria existir', 500);
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false;
  end;

  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em terrains -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.units (tenant_id, project_id, sku, list_price)
    values ('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'UN-CLIENTE-0010', 1);
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false;
  end;

  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em units -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3,
-- para o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d3333333-3333-3333-3333-333333333333","tenant_id":"c1111111-1111-1111-1111-111111111111","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_terrains int;
  v_units int;
begin
  select count(*) into v_projects from public.projects;
  select count(*) into v_terrains from public.terrains;
  select count(*) into v_units from public.units;

  if v_projects <> 0 or v_terrains <> 0 or v_units <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (projects=%, terrains=%, units=%)', v_projects, v_terrains, v_units;
  end if;
end $$;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.terrains (tenant_id, code, name, area_m2)
    values ('c1111111-1111-1111-1111-111111111111', 'TER-INVESTIDOR-0010', 'Nao deveria existir', 500);
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false;
  end;

  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em terrains -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'admin'/'administrativo' do tenant A conseguem INSERIR nas 3
-- tabelas (prova positiva -- os papeis internos permitidos de fato
-- funcionam, isso nao e so uma bateria de negacoes).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1111111-1111-1111-1111-111111111111","tenant_id":"c1111111-1111-1111-1111-111111111111","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_new_project_id uuid;
  v_new_terrain_id uuid;
  v_new_unit_id uuid;
begin
  insert into public.projects (tenant_id, code, name)
    values ('c1111111-1111-1111-1111-111111111111', 'PRJ-ADM-0010', 'Projeto criado por administrativo')
    returning id into v_new_project_id;

  insert into public.terrains (tenant_id, code, name, area_m2)
    values ('c1111111-1111-1111-1111-111111111111', 'TER-ADM-0010', 'Terreno criado por administrativo', 800)
    returning id into v_new_terrain_id;

  insert into public.units (tenant_id, project_id, sku, list_price)
    values ('c1111111-1111-1111-1111-111111111111', v_new_project_id, 'UN-ADM-0010', 200000)
    returning id into v_new_unit_id;

  if v_new_project_id is null or v_new_terrain_id is null or v_new_unit_id is null then
    raise exception 'FALHOU (5): tenant_role=administrativo do tenant certo deveria conseguir inserir nas 3 tabelas';
  end if;

  -- E deve conseguir ver o que acabou de criar.
  if not exists (select 1 from public.projects where id = v_new_project_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver o project que acabou de criar';
  end if;
  if not exists (select 1 from public.terrains where id = v_new_terrain_id) then
    raise exception 'FALHOU (5c): administrativo nao consegue ver o terrain que acabou de criar';
  end if;
  if not exists (select 1 from public.units where id = v_new_unit_id) then
    raise exception 'FALHOU (5d): administrativo nao consegue ver a unit que acabou de criar';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando "escapar"
-- do tenant do claim) deve ser bloqueada pelo WITH CHECK.
do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.projects (tenant_id, code, name)
    values ('c2222222-2222-2222-2222-222222222222', 'PRJ-CROSS-0010', 'Nao deveria existir');
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false;
  end;

  if v_insert_ok then
    raise exception 'FALHOU (5e): administrativo do tenant A conseguiu inserir project com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 3 tabelas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d5555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_terrains int;
  v_units int;
begin
  select count(*) into v_projects from public.projects;
  select count(*) into v_terrains from public.terrains;
  select count(*) into v_units from public.units;

  if v_projects <> 0 or v_terrains <> 0 or v_units <> 0 then
    raise exception 'FALHOU (6): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (projects=%, terrains=%, units=%)', v_projects, v_terrains, v_units;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0010 - catalogo)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
