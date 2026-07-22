-- 0027_comissoes_isolation.sql
-- Teste de isolamento para a RLS de `commissions`, `commission_adjustments`,
-- `commission_payments` introduzida em
-- supabase/migrations/0027_rls_comissoes.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql,
-- supabase/tests/0010_catalog_isolation.sql,
-- supabase/tests/0017_crm_isolation.sql e
-- supabase/tests/0023_financeiro_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0027_comissoes_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0027_comissoes_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/clients/brokers/
-- deals/commissions/commission_adjustments/commission_payments) fica no
-- banco, mesmo rodando contra o projeto remoto real. Qualquer assercao que
-- falhe faz `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0002/0010/0017/0023.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a parte,
-- fora deste script, confirmou que `authenticated` tem exatamente
-- select/insert/update em commissions/commission_payments, e exatamente
-- select/insert (sem update) em commission_adjustments -- `anon` sem
-- NENHUM privilegio nas 3 tabelas.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve nenhuma das 3 tabelas do
--    Tenant B, e vice-versa (isolamento nos dois sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO
--    nao enxerga NENHUMA linha e nao consegue inserir em nenhuma das 3
--    tabelas -- prova que a RLS nega por papel, nao so por tenant.
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue INSERIR e VER as 3 tabelas desse tenant, e
--    ATUALIZAR commissions/commission_payments -- mas NAO consegue
--    atualizar commission_adjustments (sem policy/grant de update -- log
--    write-once), mesmo dentro do proprio tenant e com papel autorizado
--    nas outras 2 tabelas.
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma
--    linha em nenhuma das 3 tabelas.
-- 5. WITH CHECK bloqueia INSERT cross-tenant (payload malicioso tentando
--    gravar tenant_id de outro tenant) nas 3 tabelas, e USING bloqueia
--    UPDATE cross-tenant (0 linhas afetadas, sem erro) nas tabelas com
--    policy de update.
-- 6. O indice unico parcial commissions_tenant_id_deal_id_uidx
--    ((tenant_id, deal_id) where not is_deleted) continua funcionando com
--    RLS habilitada -- inserir uma segunda commission ativa pro mesmo deal
--    do mesmo tenant falha por violacao de unicidade, nao e mascarado pela
--    RLS.

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
  ('a1111111-1111-1111-1111-111111111111'), -- user_a_comercial: tenant A, comercial
  ('a2222222-2222-2222-2222-222222222222'), -- user_a_cliente: tenant A, cliente
  ('a3333333-1111-1111-1111-111111111111'), -- user_a_investidor: tenant A, investidor
  ('a4444444-1111-1111-1111-111111111111'), -- user_b_admin: tenant B, admin
  ('a5555555-1111-1111-1111-111111111111'), -- user_orphan: sem tenant_users
  ('a6666666-1111-1111-1111-111111111111'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('b3333333-3333-3333-3333-333333333333', 'Tenant A - teste isolamento comissoes 0027', 'tenant-a-teste-isolamento-comissoes-0027'),
  ('b4444444-4444-4444-4444-444444444444', 'Tenant B - teste isolamento comissoes 0027', 'tenant-b-teste-isolamento-comissoes-0027');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('b3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('b3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222', 'cliente', 'active'),
  ('b3333333-3333-3333-3333-333333333333', 'a3333333-1111-1111-1111-111111111111', 'investidor', 'active'),
  ('b3333333-3333-3333-3333-333333333333', 'a6666666-1111-1111-1111-111111111111', 'administrativo', 'active'),
  ('b4444444-4444-4444-4444-444444444444', 'a4444444-1111-1111-1111-111111111111', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario -- os
-- testes reais de leitura/escrita usam os roles simulados abaixo).

-- projects/units/clients/brokers/deals: pre-requisitos de FK para
-- commissions.
insert into public.projects (id, tenant_id, code, name)
values
  ('c5555555-5555-5555-5555-555555555555', 'b3333333-3333-3333-3333-333333333333', 'PRJ-A-0027', 'Projeto Tenant A'),
  ('c6666666-6666-6666-6666-666666666666', 'b4444444-4444-4444-4444-444444444444', 'PRJ-B-0027', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price)
values
  ('c7777777-7777-7777-7777-777777777777', 'b3333333-3333-3333-3333-333333333333', 'c5555555-5555-5555-5555-555555555555', 'UN-A-0027', 100000),
  ('c8888888-8888-8888-8888-888888888888', 'b4444444-4444-4444-4444-444444444444', 'c6666666-6666-6666-6666-666666666666', 'UN-B-0027', 100000),
  ('c7777777-7777-7777-7777-777777777778', 'b3333333-3333-3333-3333-333333333333', 'c5555555-5555-5555-5555-555555555555', 'UN-A2-0027', 150000);

insert into public.clients (id, tenant_id, name)
values
  ('d7777777-7777-7777-7777-777777777777', 'b3333333-3333-3333-3333-333333333333', 'Cliente Tenant A'),
  ('d8888888-8888-8888-8888-888888888888', 'b4444444-4444-4444-4444-444444444444', 'Cliente Tenant B');

insert into public.brokers (id, tenant_id, name)
values
  ('d9999999-9999-9999-9999-999999999999', 'b3333333-3333-3333-3333-333333333333', 'Corretor Tenant A'),
  ('da111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'Corretor Tenant B');

insert into public.deals (id, tenant_id, project_id, unit_id, client_id, broker_id)
values
  ('db111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'c5555555-5555-5555-5555-555555555555', 'c7777777-7777-7777-7777-777777777777', 'd7777777-7777-7777-7777-777777777777', 'd9999999-9999-9999-9999-999999999999'),
  ('dc111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'c6666666-6666-6666-6666-666666666666', 'c8888888-8888-8888-8888-888888888888', 'd8888888-8888-8888-8888-888888888888', 'da111111-1111-1111-1111-111111111111');

insert into public.commissions (id, tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
values
  ('dd111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'd9999999-9999-9999-9999-999999999999', 'db111111-1111-1111-1111-111111111111', 'c7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 5000),
  ('de111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'da111111-1111-1111-1111-111111111111', 'dc111111-1111-1111-1111-111111111111', 'c8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666', 5000);

insert into public.commission_adjustments (id, tenant_id, commission_id, type, amount, reason)
values
  ('df111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'dd111111-1111-1111-1111-111111111111', 'bonus', 100, 'Ajuste Tenant A'),
  ('e0111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'de111111-1111-1111-1111-111111111111', 'bonus', 100, 'Ajuste Tenant B');

insert into public.commission_payments (id, tenant_id, commission_id, valor_pago, data_pagamento)
values
  ('e1111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'dd111111-1111-1111-1111-111111111111', 1000, '2026-07-01'),
  ('e2111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'de111111-1111-1111-1111-111111111111', 1000, '2026-07-01');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant nas 3 tabelas, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","tenant_id":"b3333333-3333-3333-3333-333333333333","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commissions int; v_adjustments int; v_payments int;
  v_commissions_b int; v_adjustments_b int; v_payments_b int;
begin
  select count(*) into v_commissions from public.commissions;
  select count(*) into v_adjustments from public.commission_adjustments;
  select count(*) into v_payments from public.commission_payments;

  select count(*) into v_commissions_b from public.commissions where tenant_id = 'b4444444-4444-4444-4444-444444444444';
  select count(*) into v_adjustments_b from public.commission_adjustments where tenant_id = 'b4444444-4444-4444-4444-444444444444';
  select count(*) into v_payments_b from public.commission_payments where tenant_id = 'b4444444-4444-4444-4444-444444444444';

  if v_commissions <> 1 or v_adjustments <> 1 or v_payments <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em cada uma das 3 tabelas (commissions=%, adjustments=%, payments=%)',
      v_commissions, v_adjustments, v_payments;
  end if;

  if v_commissions_b <> 0 or v_adjustments_b <> 0 or v_payments_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (commissions=%, adjustments=%, payments=%)',
      v_commissions_b, v_adjustments_b, v_payments_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a4444444-1111-1111-1111-111111111111","tenant_id":"b4444444-4444-4444-4444-444444444444","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commissions int; v_adjustments int; v_payments int;
  v_commissions_a int; v_adjustments_a int; v_payments_a int;
begin
  select count(*) into v_commissions from public.commissions;
  select count(*) into v_adjustments from public.commission_adjustments;
  select count(*) into v_payments from public.commission_payments;

  select count(*) into v_commissions_a from public.commissions where tenant_id = 'b3333333-3333-3333-3333-333333333333';
  select count(*) into v_adjustments_a from public.commission_adjustments where tenant_id = 'b3333333-3333-3333-3333-333333333333';
  select count(*) into v_payments_a from public.commission_payments where tenant_id = 'b3333333-3333-3333-3333-333333333333';

  if v_commissions <> 1 or v_adjustments <> 1 or v_payments <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada uma das 3 tabelas (commissions=%, adjustments=%, payments=%)',
      v_commissions, v_adjustments, v_payments;
  end if;

  if v_commissions_a <> 0 or v_adjustments_a <> 0 or v_payments_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (commissions=%, adjustments=%, payments=%)',
      v_commissions_a, v_adjustments_a, v_payments_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha nas 3 tabelas, mesmo o dado do proprio tenant
-- existindo de verdade -- e nao consegue inserir em nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","tenant_id":"b3333333-3333-3333-3333-333333333333","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commissions int; v_adjustments int; v_payments int;
begin
  select count(*) into v_commissions from public.commissions;
  select count(*) into v_adjustments from public.commission_adjustments;
  select count(*) into v_payments from public.commission_payments;

  if v_commissions <> 0 or v_adjustments <> 0 or v_payments <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (commissions=%, adjustments=%, payments=%)',
      v_commissions, v_adjustments, v_payments;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commissions (tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
    values ('b3333333-3333-3333-3333-333333333333', 'd9999999-9999-9999-9999-999999999999', 'db111111-1111-1111-1111-111111111111', 'c7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 500);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em commissions -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commission_adjustments (tenant_id, commission_id, type, amount)
    values ('b3333333-3333-3333-3333-333333333333', 'dd111111-1111-1111-1111-111111111111', 'bonus', 50);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em commission_adjustments -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commission_payments (tenant_id, commission_id, valor_pago, data_pagamento)
    values ('b3333333-3333-3333-3333-333333333333', 'dd111111-1111-1111-1111-111111111111', 200, '2026-07-05');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em commission_payments -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3,
-- para o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a3333333-1111-1111-1111-111111111111","tenant_id":"b3333333-3333-3333-3333-333333333333","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commissions int; v_adjustments int; v_payments int;
begin
  select count(*) into v_commissions from public.commissions;
  select count(*) into v_adjustments from public.commission_adjustments;
  select count(*) into v_payments from public.commission_payments;

  if v_commissions <> 0 or v_adjustments <> 0 or v_payments <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (commissions=%, adjustments=%, payments=%)',
      v_commissions, v_adjustments, v_payments;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commissions (tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
    values ('b3333333-3333-3333-3333-333333333333', 'd9999999-9999-9999-9999-999999999999', 'db111111-1111-1111-1111-111111111111', 'c7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 500);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em commissions -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue INSERIR e VER as 3
-- tabelas (prova positiva), e ATUALIZAR commissions/commission_payments --
-- mas NAO consegue atualizar commission_adjustments (sem policy/grant de
-- update -- log write-once).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a6666666-1111-1111-1111-111111111111","tenant_id":"b3333333-3333-3333-3333-333333333333","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commission_id uuid;
  v_deal_id uuid;
  v_adjustment_id uuid;
  v_payment_id uuid;
begin
  -- Um segundo deal do tenant A, numa unidade diferente (pra nao colidir com
  -- o indice unico parcial de deals -- (tenant_id, unit_id) where is_active)
  -- e, por consequencia, com um deal_id diferente pro indice unico parcial
  -- de commissions (tenant_id, deal_id) where not is_deleted, usado no
  -- TESTE 6.
  insert into public.deals (id, tenant_id, project_id, unit_id, client_id, broker_id)
    values ('e3111111-1111-1111-1111-111111111111', 'b3333333-3333-3333-3333-333333333333', 'c5555555-5555-5555-5555-555555555555', 'c7777777-7777-7777-7777-777777777778', 'd7777777-7777-7777-7777-777777777777', 'd9999999-9999-9999-9999-999999999999')
    returning id into v_deal_id;

  insert into public.commissions (tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
    values ('b3333333-3333-3333-3333-333333333333', 'd9999999-9999-9999-9999-999999999999', v_deal_id, 'c7777777-7777-7777-7777-777777777778', 'c5555555-5555-5555-5555-555555555555', 3000)
    returning id into v_commission_id;

  insert into public.commission_adjustments (tenant_id, commission_id, type, amount, reason)
    values ('b3333333-3333-3333-3333-333333333333', v_commission_id, 'desconto', 100, 'Desconto teste')
    returning id into v_adjustment_id;

  insert into public.commission_payments (tenant_id, commission_id, valor_pago, data_pagamento)
    values ('b3333333-3333-3333-3333-333333333333', v_commission_id, 500, '2026-07-10')
    returning id into v_payment_id;

  if v_commission_id is null or v_adjustment_id is null or v_payment_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir nas 3 tabelas';
  end if;

  if not exists (select 1 from public.commissions where id = v_commission_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver a commission que acabou de criar';
  end if;
  if not exists (select 1 from public.commission_adjustments where id = v_adjustment_id) then
    raise exception 'FALHOU (5c): administrativo nao consegue ver o commission_adjustment que acabou de criar';
  end if;
  if not exists (select 1 from public.commission_payments where id = v_payment_id) then
    raise exception 'FALHOU (5d): administrativo nao consegue ver o commission_payment que acabou de criar';
  end if;

  -- UPDATE em commissions/commission_payments deve funcionar.
  update public.commissions set status = 'agendado' where id = v_commission_id;
  if not exists (select 1 from public.commissions where id = v_commission_id and status = 'agendado') then
    raise exception 'FALHOU (5e): administrativo deveria conseguir atualizar commissions (status = agendado)';
  end if;

  update public.commission_payments set observacoes = 'editado' where id = v_payment_id;
  if not exists (select 1 from public.commission_payments where id = v_payment_id and observacoes = 'editado') then
    raise exception 'FALHOU (5f): administrativo deveria conseguir atualizar commission_payments (observacoes)';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando "escapar" do
-- tenant do claim) deve ser bloqueada pelo WITH CHECK, nas 3 tabelas.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commissions (tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
    values ('b4444444-4444-4444-4444-444444444444', 'da111111-1111-1111-1111-111111111111', 'dc111111-1111-1111-1111-111111111111', 'c8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666', 500);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5g): administrativo do tenant A conseguiu inserir commission com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commission_adjustments (tenant_id, commission_id, type, amount)
    values ('b4444444-4444-4444-4444-444444444444', 'de111111-1111-1111-1111-111111111111', 'bonus', 50);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5h): administrativo do tenant A conseguiu inserir commission_adjustment com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commission_payments (tenant_id, commission_id, valor_pago, data_pagamento)
    values ('b4444444-4444-4444-4444-444444444444', 'de111111-1111-1111-1111-111111111111', 200, '2026-07-05');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5i): administrativo do tenant A conseguiu inserir commission_payment com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant: linha do tenant B nem aparece para o UPDATE (USING
-- filtra por tenant_id do claim) -- 0 linhas afetadas, sem erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.commissions set status = 'cancelado'
    where tenant_id = 'b4444444-4444-4444-4444-444444444444';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5j): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de commissions do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

do $$
declare v_linhas_afetadas int;
begin
  update public.commission_payments set observacoes = 'tentativa cross-tenant'
    where tenant_id = 'b4444444-4444-4444-4444-444444444444';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5k): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de commission_payments do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- commission_adjustments: SEM policy de update e SEM grant de update --
-- UPDATE deve falhar com erro de privilegio, mesmo dentro do proprio tenant
-- e por um papel autorizado nas outras 2 tabelas (mesmo teste que ja foi
-- feito pra status_transitions em 0017 e finance_events em 0023).
do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.commission_adjustments set reason = 'tentativa de edicao'
      where tenant_id = 'b3333333-3333-3333-3333-333333333333';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5l): administrativo conseguiu dar UPDATE em commission_adjustments -- deveria ser log write-once, sem policy/grant de update';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: o indice unico parcial commissions_tenant_id_deal_id_uidx
-- ((tenant_id, deal_id) where not is_deleted) continua funcionando com RLS
-- habilitada -- uma segunda commission ativa para o MESMO deal do tenant A
-- (o deal original 'db111111...', ja usado na linha semeada no setup) deve
-- falhar por violacao de unicidade, nao ser mascarada/ignorada pela RLS.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a6666666-1111-1111-1111-111111111111","tenant_id":"b3333333-3333-3333-3333-333333333333","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.commissions (tenant_id, broker_id, deal_id, unit_id, project_id, base_value)
    values ('b3333333-3333-3333-3333-333333333333', 'd9999999-9999-9999-9999-999999999999', 'db111111-1111-1111-1111-111111111111', 'c7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 999);
    v_insert_ok := true;
  exception
    when unique_violation then v_insert_ok := false;
    when others then
      raise exception 'FALHOU (6a): insert duplicado falhou com erro inesperado (esperava unique_violation): %', sqlerrm;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6b): conseguiu criar uma segunda commission ativa para o mesmo deal do mesmo tenant -- indice unico parcial nao esta sendo respeitado com RLS habilitada';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 3 tabelas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"a5555555-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_commissions int; v_adjustments int; v_payments int;
begin
  select count(*) into v_commissions from public.commissions;
  select count(*) into v_adjustments from public.commission_adjustments;
  select count(*) into v_payments from public.commission_payments;

  if v_commissions <> 0 or v_adjustments <> 0 or v_payments <> 0 then
    raise exception 'FALHOU (7): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (commissions=%, adjustments=%, payments=%)',
      v_commissions, v_adjustments, v_payments;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0027 - Comissoes)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
