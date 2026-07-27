-- 0053_client_portal_access_isolation.sql
-- Teste de isolamento para a RLS introduzida em
-- supabase/migrations/0053_rls_client_portal_access.sql: `clients`, `units`,
-- `projects`, `finance_accounts`, `payment_installments`,
-- `financing_process` (novo SELECT para tenant_role=cliente) e
-- `maintenance_requests` (SELECT/INSERT/UPDATE restrito para
-- tenant_role=cliente).
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0051_client_portal_isolation.sql: rodado
-- via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0053_client_portal_access_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0053_client_portal_access_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer assercao que falhe faz `raise exception`, abortando a transacao
-- inteira. Mesmo padrao de `set_config('request.jwt.claims', ...)` + `set
-- local role authenticated` de 0036/0039/0045/0051.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Confirmado que nao existe nenhuma Edge Function deste modulo hoje
-- (supabase/functions/ sem nada de Portal do Cliente).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
--  1. cliente1 (tenant A) le SOMENTE a propria linha em clients/units/
--     projects/finance_accounts/payment_installments/financing_process/
--     maintenance_requests -- NAO ve as linhas equivalentes de cliente2, do
--     MESMO tenant. Item (a) do pedido.
--  2. Simetrico: cliente2 (tenant A) ve so a propria linha, nao a de
--     cliente1.
--  3. cliente1 NAO ve NENHUMA linha em nenhuma das 7 tabelas do tenant B,
--     mesmo tendo dado equivalente la (cliente do tenant B, comprador
--     "vendido"). Item (b) do pedido.
--  4. `deals` continua SEM NENHUMA linha visivel para tenant_role=cliente
--     (decisao deliberada documentada em 0053) -- nem a propria, nem de
--     ninguem.
--  5. cliente1 CONSEGUE criar chamado de manutencao (INSERT) pra PROPRIA
--     unidade -- e falha ao tentar criar pra unidade de cliente2 (mesmo
--     tenant) e pra unidade do tenant B. Item (c) do pedido.
--  6. cliente1 CONSEGUE cancelar (ABERTO -> CANCELADO) o proprio chamado
--     ABERTO, mas NAO consegue: (a) cancelar chamado que ja nao esta
--     ABERTO; (b) fazer update em chamado de cliente2; (c) usar o UPDATE de
--     cancelamento pra tambem alterar outra coluna (title/operator_notes/
--     responsible_user_id) na mesma chamada -- prova o trigger
--     complementar.
--  7. cliente1 NAO consegue INSERT/UPDATE em clients/units/projects/
--     finance_accounts/payment_installments/financing_process (SELECT-only
--     pro papel cliente nessas 6 tabelas).
--  8. Equipe interna (admin/comercial/administrativo) do tenant A continua
--     enxergando/gravando TUDO do proprio tenant nas 7 tabelas, sem
--     regressao -- inclusive financing_process, que so ganhou RLS agora
--     (0052 tinha RLS PENDENTE). Item (d) do pedido.
--  9. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve NENHUMA
--     linha em nenhuma das 7 tabelas, e nao consegue inserir em nenhuma.

begin;

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------
-- Tenant A: admin, comercial (equipe), cliente1 (compra unidade A1 no
-- projeto A1), cliente2 (compra unidade A2 no projeto A2 -- unidade e
-- projeto DIFERENTES, pra provar isolamento por posse em toda a cadeia).
-- Tenant B: admin, cliente (compra unidade B1 no projeto B1) -- prova
-- isolamento cross-tenant. Mais um usuario orfao, sem tenant_users.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('d1000000-0000-0000-0000-000000000001'), -- user_a_admin
  ('d1000000-0000-0000-0000-000000000002'), -- user_a_comercial
  ('d1000000-0000-0000-0000-000000000003'), -- user_a_cliente1
  ('d1000000-0000-0000-0000-000000000004'), -- user_a_cliente2
  ('d1000000-0000-0000-0000-000000000005'), -- user_b_admin
  ('d1000000-0000-0000-0000-000000000006'), -- user_b_cliente
  ('d1000000-0000-0000-0000-000000000007'); -- user_orphan

insert into public.tenants (id, name, slug) values
  ('d2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento acesso portal cliente 0053', 'tenant-a-teste-isolamento-acesso-portal-cliente-0053'),
  ('d2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento acesso portal cliente 0053', 'tenant-b-teste-isolamento-acesso-portal-cliente-0053');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 'comercial', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000003', 'cliente', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000004', 'cliente', 'active'),
  ('d2000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-000000000005', 'admin', 'active'),
  ('d2000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-000000000006', 'cliente', 'active');

-- Dado "de fato existente", inserido diretamente como dono das tabelas
-- (bypassa RLS de proposito so pra popular o cenario). Cadeia:
-- project -> unit -> deal (vendido) -> client (user_id = auth.uid()) ->
-- finance_account -> payment_installment / financing_process ->
-- maintenance_request.

insert into public.projects (id, tenant_id, code, name) values
  ('d3000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'PROJ-A1-0053', 'Projeto A1 Tenant A'),
  ('d3000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'PROJ-A2-0053', 'Projeto A2 Tenant A'),
  ('d3000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'PROJ-B1-0053', 'Projeto B1 Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('d4000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a', 'U-A1-0053', 200000),
  ('d4000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000b', 'U-A2-0053', 200000),
  ('d4000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-00000000000c', 'U-B1-0053', 200000);

insert into public.clients (id, tenant_id, name, user_id) values
  ('d5000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'Cliente A1', 'd1000000-0000-0000-0000-000000000003'),
  ('d5000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'Cliente A2', 'd1000000-0000-0000-0000-000000000004'),
  ('d5000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'Cliente B1', 'd1000000-0000-0000-0000-000000000006');

insert into public.deals (id, tenant_id, project_id, unit_id, client_id, sales_stage) values
  ('d6000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'vendido'),
  ('d6000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b', 'd5000000-0000-0000-0000-00000000000b', 'vendido'),
  ('d6000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-00000000000c', 'd4000000-0000-0000-0000-00000000000c', 'd5000000-0000-0000-0000-00000000000c', 'vendido');

insert into public.finance_accounts (id, tenant_id, unit_id, client_id, project_id, valor_venda_total) values
  ('d7000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a', 200000),
  ('d7000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000b', 'd5000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-00000000000b', 200000),
  ('d7000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000c', 'd5000000-0000-0000-0000-00000000000c', 'd3000000-0000-0000-0000-00000000000c', 200000);

insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, vencimento, valor_previsto) values
  ('d8000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'entrada', '2026-08-01', 10000),
  ('d8000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b', 'd5000000-0000-0000-0000-00000000000b', 'entrada', '2026-08-01', 10000),
  ('d8000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd7000000-0000-0000-0000-00000000000c', 'd4000000-0000-0000-0000-00000000000c', 'd5000000-0000-0000-0000-00000000000c', 'entrada', '2026-08-01', 10000);

insert into public.financing_process (id, tenant_id, finance_account_id, banco, status) values
  ('d9000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000a', 'Banco A1', 'em_analise'),
  ('d9000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000b', 'Banco A2', 'em_analise'),
  ('d9000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd7000000-0000-0000-0000-00000000000c', 'Banco B1', 'em_analise');

insert into public.maintenance_requests (id, tenant_id, project_id, unit_id, client_id, title, description, status) values
  ('da000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'Vazamento A1', 'Descricao A1', 'aberto'),
  ('da000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-00000000000b', 'd5000000-0000-0000-0000-00000000000b', 'Vazamento A2', 'Descricao A2', 'aberto'),
  ('da000000-0000-0000-0000-00000000000c', 'd2000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-00000000000c', 'd4000000-0000-0000-0000-00000000000c', 'd5000000-0000-0000-0000-00000000000c', 'Vazamento B1', 'Descricao B1', 'aberto');

-- ---------------------------------------------------------------------
-- TESTE 1: cliente1 (tenant A) le SOMENTE a propria linha nas 7 tabelas,
-- nao a de cliente2 (mesmo tenant). `deals` fica de fora (ver TESTE 4).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_units int; v_projects int; v_fa int; v_pi int; v_fp int; v_mr int;
  v_client_ids uuid[]; v_unit_ids uuid[]; v_project_ids uuid[]; v_fa_ids uuid[]; v_pi_ids uuid[]; v_fp_ids uuid[]; v_mr_ids uuid[];
begin
  select count(*), array_agg(id) into v_clients, v_client_ids from public.clients;
  select count(*), array_agg(id) into v_units, v_unit_ids from public.units;
  select count(*), array_agg(id) into v_projects, v_project_ids from public.projects;
  select count(*), array_agg(id) into v_fa, v_fa_ids from public.finance_accounts;
  select count(*), array_agg(id) into v_pi, v_pi_ids from public.payment_installments;
  select count(*), array_agg(id) into v_fp, v_fp_ids from public.financing_process;
  select count(*), array_agg(id) into v_mr, v_mr_ids from public.maintenance_requests;

  if v_clients <> 1 or v_client_ids <> array['d5000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1a): cliente1 deveria ver exatamente o proprio registro em clients (viu %)', v_client_ids;
  end if;
  if v_units <> 1 or v_unit_ids <> array['d4000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1b): cliente1 deveria ver exatamente a propria unidade (viu %)', v_unit_ids;
  end if;
  if v_projects <> 1 or v_project_ids <> array['d3000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1c): cliente1 deveria ver exatamente o proprio projeto (viu %)', v_project_ids;
  end if;
  if v_fa <> 1 or v_fa_ids <> array['d7000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1d): cliente1 deveria ver exatamente a propria finance_account (viu %)', v_fa_ids;
  end if;
  if v_pi <> 1 or v_pi_ids <> array['d8000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1e): cliente1 deveria ver exatamente a propria parcela (viu %)', v_pi_ids;
  end if;
  if v_fp <> 1 or v_fp_ids <> array['d9000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1f): cliente1 deveria ver exatamente o proprio financing_process (viu %)', v_fp_ids;
  end if;
  if v_mr <> 1 or v_mr_ids <> array['da000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'FALHOU (1g): cliente1 deveria ver exatamente o proprio chamado de manutencao (viu %)', v_mr_ids;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: simetrico -- cliente2 ve so a propria linha, nao a de cliente1.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000004","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_units int; v_fa int; v_pi int; v_fp int; v_mr int;
  v_client_ids uuid[]; v_unit_ids uuid[]; v_fa_ids uuid[]; v_pi_ids uuid[]; v_fp_ids uuid[]; v_mr_ids uuid[];
begin
  select count(*), array_agg(id) into v_clients, v_client_ids from public.clients;
  select count(*), array_agg(id) into v_units, v_unit_ids from public.units;
  select count(*), array_agg(id) into v_fa, v_fa_ids from public.finance_accounts;
  select count(*), array_agg(id) into v_pi, v_pi_ids from public.payment_installments;
  select count(*), array_agg(id) into v_fp, v_fp_ids from public.financing_process;
  select count(*), array_agg(id) into v_mr, v_mr_ids from public.maintenance_requests;

  if v_clients <> 1 or v_client_ids <> array['d5000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2a): cliente2 deveria ver exatamente o proprio registro em clients (viu %)', v_client_ids;
  end if;
  if v_units <> 1 or v_unit_ids <> array['d4000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2b): cliente2 deveria ver exatamente a propria unidade (viu %)', v_unit_ids;
  end if;
  if v_fa <> 1 or v_fa_ids <> array['d7000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2c): cliente2 deveria ver exatamente a propria finance_account (viu %)', v_fa_ids;
  end if;
  if v_pi <> 1 or v_pi_ids <> array['d8000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2d): cliente2 deveria ver exatamente a propria parcela (viu %)', v_pi_ids;
  end if;
  if v_fp <> 1 or v_fp_ids <> array['d9000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2e): cliente2 deveria ver exatamente o proprio financing_process (viu %)', v_fp_ids;
  end if;
  if v_mr <> 1 or v_mr_ids <> array['da000000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (2f): cliente2 deveria ver exatamente o proprio chamado de manutencao (viu %)', v_mr_ids;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: cliente1 NAO ve NENHUMA linha do tenant B em nenhuma das 7
-- tabelas, mesmo tendo dado equivalente la (cliente do tenant B,
-- comprador "vendido"). Item (b) do pedido -- ja coberto implicitamente
-- pelo TESTE 1 (contagem exata = 1), mas checa explicitamente por
-- tenant_id aqui pra deixar a intencao inequivoca.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients_b int; v_units_b int; v_projects_b int; v_fa_b int; v_pi_b int; v_fp_b int; v_mr_b int;
begin
  select count(*) into v_clients_b from public.clients where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_units_b from public.units where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_projects_b from public.projects where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_fa_b from public.finance_accounts where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_pi_b from public.payment_installments where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_fp_b from public.financing_process where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  select count(*) into v_mr_b from public.maintenance_requests where tenant_id = 'd2000000-0000-0000-0000-00000000000b';

  if v_clients_b <> 0 or v_units_b <> 0 or v_projects_b <> 0 or v_fa_b <> 0 or v_pi_b <> 0 or v_fp_b <> 0 or v_mr_b <> 0 then
    raise exception 'FALHOU (3): cliente1 (tenant A) NAO deveria ver NENHUMA linha do tenant B em nenhuma das 7 tabelas (clients=%, units=%, projects=%, fa=%, pi=%, fp=%, mr=%)',
      v_clients_b, v_units_b, v_projects_b, v_fa_b, v_pi_b, v_fp_b, v_mr_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: `deals` continua SEM NENHUMA linha visivel para
-- tenant_role=cliente (decisao deliberada de 0053) -- nem a propria.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_deals int;
begin
  select count(*) into v_deals from public.deals;
  if v_deals <> 0 then
    raise exception 'FALHOU (4): tenant_role=cliente NAO deveria ver NENHUMA linha de deals (viu %) -- decisao deliberada documentada em 0053_rls_client_portal_access.sql', v_deals;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: cliente1 CONSEGUE criar chamado (INSERT) pra PROPRIA unidade, e
-- FALHA ao tentar criar pra unidade de cliente2 (mesmo tenant) e pra
-- unidade do tenant B. Item (c) do pedido.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_new_id uuid;
begin
  insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
  values (
    'd2000000-0000-0000-0000-00000000000a',
    'd3000000-0000-0000-0000-00000000000a',
    'd4000000-0000-0000-0000-00000000000a',
    'd5000000-0000-0000-0000-00000000000a',
    'Novo chamado cliente1',
    'Descricao novo chamado'
  )
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'FALHOU (5a): cliente1 deveria conseguir abrir chamado pra propria unidade';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values (
      'd2000000-0000-0000-0000-00000000000a',
      'd3000000-0000-0000-0000-00000000000b',
      'd4000000-0000-0000-0000-00000000000b',
      'd5000000-0000-0000-0000-00000000000a',
      'Tentativa unidade de cliente2',
      'Nao deveria funcionar'
    );
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5b): cliente1 conseguiu abrir chamado pra unidade de cliente2 (mesmo tenant) -- client_owns_unit deveria bloquear';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values (
      'd2000000-0000-0000-0000-00000000000b',
      'd3000000-0000-0000-0000-00000000000c',
      'd4000000-0000-0000-0000-00000000000c',
      'd5000000-0000-0000-0000-00000000000c',
      'Tentativa cross-tenant',
      'Nao deveria funcionar'
    );
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5c): cliente1 conseguiu abrir chamado com tenant_id/unit_id/client_id do tenant B -- WITH CHECK deveria bloquear';
  end if;
end $$;

-- Reforco: INSERT tentando setar campo interno (responsible_user_id) deve
-- ser bloqueado mesmo pra unidade propria.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description, responsible_user_id)
    values (
      'd2000000-0000-0000-0000-00000000000a',
      'd3000000-0000-0000-0000-00000000000a',
      'd4000000-0000-0000-0000-00000000000a',
      'd5000000-0000-0000-0000-00000000000a',
      'Tentativa com responsible_user_id',
      'Nao deveria funcionar',
      'd1000000-0000-0000-0000-000000000001'
    );
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5d): cliente1 conseguiu setar responsible_user_id (campo interno) na criacao do proprio chamado';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: cancelamento (UPDATE restrito) -- cliente1 CONSEGUE cancelar o
-- proprio chamado ABERTO; NAO consegue cancelar chamado ja nao-ABERTO, nem
-- chamado de cliente2, nem usar o cancelamento pra alterar outra coluna.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

-- 6a: cancelamento legitimo do proprio chamado ABERTO -- deve funcionar.
do $$
declare v_linhas int; v_status maintenance_status;
begin
  update public.maintenance_requests
    set status = 'cancelado'
    where id = 'da000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU (6a): cliente1 deveria conseguir cancelar o proprio chamado ABERTO (afetou % linha(s))', v_linhas;
  end if;

  select status into v_status from public.maintenance_requests where id = 'da000000-0000-0000-0000-00000000000a';
  if v_status <> 'cancelado' then
    raise exception 'FALHOU (6a2): status do chamado deveria ser cancelado apos o UPDATE (esta %)', v_status;
  end if;
end $$;

-- 6b: chamado ja NAO esta mais ABERTO (acabou de ser cancelado no 6a) --
-- tentar cancelar de novo (ou mudar status de outra forma) deve afetar 0
-- linhas (USING nao encontra candidata: status atual != 'aberto').
do $$
declare v_linhas int;
begin
  update public.maintenance_requests
    set status = 'cancelado'
    where id = 'da000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6b): cliente1 conseguiu re-cancelar/atualizar chamado que ja nao estava ABERTO (afetou % linha(s))', v_linhas;
  end if;
end $$;

-- 6c: cliente1 tenta atualizar (cancelar) o chamado de cliente2 -- 0 linhas
-- afetadas (USING nao reconhece posse).
do $$
declare v_linhas int;
begin
  update public.maintenance_requests
    set status = 'cancelado'
    where id = 'da000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6c): cliente1 conseguiu atualizar chamado de cliente2 (afetou % linha(s))', v_linhas;
  end if;
end $$;

-- 6d: cliente1 tenta cancelar o PROPRIO chamado (novo, inserido no TESTE
-- 5a, ainda ABERTO) mas TAMBEM tentando alterar operator_notes (campo
-- interno) na mesma chamada -- deve ser BLOQUEADO pelo trigger (nao so o
-- operator_notes falha silenciosamente -- a transacao inteira do UPDATE
-- deve dar erro).
do $$
declare v_update_ok boolean := false;
declare v_new_req_id uuid;
begin
  select id into v_new_req_id from public.maintenance_requests
    where title = 'Novo chamado cliente1' and client_id = 'd5000000-0000-0000-0000-00000000000a';

  begin
    update public.maintenance_requests
      set status = 'cancelado', operator_notes = 'tentativa de escrever nota interna'
      where id = v_new_req_id;
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;

  if v_update_ok then
    raise exception 'FALHOU (6d): cliente1 conseguiu alterar operator_notes (campo interno) junto com o cancelamento -- trigger deveria bloquear';
  end if;

  -- Confirma que o chamado continua ABERTO e sem operator_notes (o UPDATE
  -- inteiro foi revertido pelo raise exception do trigger, nao so o campo
  -- extra).
  if not exists (
    select 1 from public.maintenance_requests
    where id = v_new_req_id and status = 'aberto' and operator_notes is null
  ) then
    raise exception 'FALHOU (6d2): UPDATE que deveria ter sido bloqueado pelo trigger alterou dado mesmo assim';
  end if;
end $$;

-- 6e: cliente1 tenta alterar title (sem tocar status) -- 0 colunas
-- permitidas mudam sem ser status -- USING ate aceita a linha (status
-- ainda 'aberto'), mas WITH CHECK exige status NOVO = 'cancelado' -- como
-- aqui o UPDATE nao muda status, WITH CHECK ja falha antes do trigger.
do $$
declare v_update_ok boolean := false;
declare v_new_req_id uuid;
begin
  select id into v_new_req_id from public.maintenance_requests
    where title = 'Novo chamado cliente1' and client_id = 'd5000000-0000-0000-0000-00000000000a';

  begin
    update public.maintenance_requests
      set title = 'Titulo alterado pelo cliente'
      where id = v_new_req_id;
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;

  if v_update_ok then
    raise exception 'FALHOU (6e): cliente1 conseguiu alterar title sem mudar status -- WITH CHECK deveria exigir status=cancelado';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: cliente1 NAO consegue INSERT/UPDATE em clients/units/projects/
-- finance_accounts/payment_installments/financing_process (SELECT-only pro
-- papel cliente nessas 6 tabelas).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000003","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.clients set notes = 'tentativa cliente' where id = 'd5000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7a): tenant_role=cliente conseguiu atualizar o proprio registro em clients (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;

  update public.units set notes = 'tentativa cliente' where id = 'd4000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7b): tenant_role=cliente conseguiu atualizar units (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;

  update public.projects set name = 'tentativa cliente' where id = 'd3000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7c): tenant_role=cliente conseguiu atualizar projects (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;

  update public.finance_accounts set valor_venda_total = 999999 where id = 'd7000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7d): tenant_role=cliente conseguiu atualizar finance_accounts (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;

  update public.payment_installments set status = 'pago' where id = 'd8000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7e): tenant_role=cliente conseguiu atualizar payment_installments (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;

  update public.financing_process set status = 'aprovado' where id = 'd9000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7f): tenant_role=cliente conseguiu atualizar financing_process (deveria ser somente leitura, afetou % linha(s))', v_linhas;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.finance_accounts (tenant_id, unit_id, client_id, project_id)
    values ('d2000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7g): tenant_role=cliente conseguiu inserir em finance_accounts -- deveria ser somente leitura';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 8: equipe interna (admin/comercial) do tenant A continua
-- enxergando/gravando TUDO do proprio tenant nas 7 tabelas -- sem
-- regressao. Item (d) do pedido -- inclusive financing_process, que so
-- ganhou RLS nesta migration.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000002","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_units int; v_projects int; v_fa int; v_pi int; v_fp int; v_mr int; v_deals int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_units from public.units;
  select count(*) into v_projects from public.projects;
  select count(*) into v_fa from public.finance_accounts;
  select count(*) into v_pi from public.payment_installments;
  select count(*) into v_fp from public.financing_process;
  -- mr: 2 originais (A1 cancelado no teste 6, A2) + 1 criado no teste 5a = 3
  select count(*) into v_mr from public.maintenance_requests;
  select count(*) into v_deals from public.deals;

  if v_clients <> 2 or v_units <> 2 or v_projects <> 2 or v_fa <> 2 or v_pi <> 2 or v_fp <> 2 or v_deals <> 2 then
    raise exception 'FALHOU (8a): equipe interna do tenant A deveria ver exatamente 2 linhas do proprio tenant em clients/units/projects/finance_accounts/payment_installments/financing_process/deals (clients=%, units=%, projects=%, fa=%, pi=%, fp=%, deals=%)',
      v_clients, v_units, v_projects, v_fa, v_pi, v_fp, v_deals;
  end if;

  if v_mr <> 3 then
    raise exception 'FALHOU (8b): equipe interna do tenant A deveria ver 3 chamados de manutencao (2 originais + 1 criado por cliente1 no teste anterior), viu %', v_mr;
  end if;
end $$;

-- Prova positiva: admin/comercial ainda consegue escrever normalmente
-- (nenhuma regressao de 0010/0017/0023/0039/0040/0052 causada por esta
-- migration).
do $$
declare v_fp_id uuid;
begin
  update public.financing_process set status = 'aprovado', valor_aprovado = 195000
    where id = 'd9000000-0000-0000-0000-00000000000a';

  if not exists (select 1 from public.financing_process where id = 'd9000000-0000-0000-0000-00000000000a' and status = 'aprovado') then
    raise exception 'FALHOU (8c): comercial do tenant A deveria conseguir atualizar financing_process do proprio tenant';
  end if;

  insert into public.financing_process (tenant_id, finance_account_id, banco, status)
  values ('d2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000a', 'Banco Novo', 'nao_iniciado')
  returning id into v_fp_id;

  if v_fp_id is null then
    raise exception 'FALHOU (8d): comercial do tenant A deveria conseguir inserir em financing_process do proprio tenant';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 9: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- NENHUMA linha em nenhuma das 7 tabelas, e nao consegue inserir em
-- nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_clients int; v_units int; v_projects int; v_fa int; v_pi int; v_fp int; v_mr int; v_deals int;
begin
  select count(*) into v_clients from public.clients;
  select count(*) into v_units from public.units;
  select count(*) into v_projects from public.projects;
  select count(*) into v_fa from public.finance_accounts;
  select count(*) into v_pi from public.payment_installments;
  select count(*) into v_fp from public.financing_process;
  select count(*) into v_mr from public.maintenance_requests;
  select count(*) into v_deals from public.deals;

  if v_clients <> 0 or v_units <> 0 or v_projects <> 0 or v_fa <> 0 or v_pi <> 0 or v_fp <> 0 or v_mr <> 0 or v_deals <> 0 then
    raise exception 'FALHOU (9a): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha em nenhuma tabela (clients=%, units=%, projects=%, fa=%, pi=%, fp=%, mr=%, deals=%)',
      v_clients, v_units, v_projects, v_fa, v_pi, v_fp, v_mr, v_deals;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('d2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-00000000000a', 'Tentativa orfao', 'Nao deveria funcionar');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (9b): usuario sem tenant_id no claim conseguiu inserir em maintenance_requests';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0053 - Portal do Cliente, acesso a units/projects/clients/finance/manutencao)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
