-- 0055_investor_portal_isolation.sql
-- Teste de isolamento para a RLS do papel `tenant_role = 'investidor'`
-- introduzida em supabase/migrations/0055_rls_investor_portal.sql, e para a
-- funcao `get_project_operational_result` de
-- supabase/migrations/0056_investor_operational_result.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0045_investors_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0055_investor_portal_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0055_investor_portal_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/clients/brokers/
-- deals/commissions/investors/project_investors/investment_contributions/
-- investment_returns) fica no banco, mesmo rodando contra o projeto remoto
-- real. Qualquer assercao que falhe faz `raise exception`, abortando a
-- transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0045/0051.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Confirmado que nao existe nenhuma Edge Function deste modulo hoje
-- (supabase/functions/ sem nada de investidores).
--
-- REGRESSAO DE 0045: NAO duplicada neste arquivo -- rodar
-- supabase/tests/0045_investors_isolation.sql de novo separadamente prova
-- que a equipe interna (admin/comercial/administrativo) continua sem
-- regressao em nenhuma das 4 tabelas ja cobertas la (0055 so ADICIONA
-- policies novas -- select_tenant_investor_own -- nenhuma das policies
-- ja existentes de 0045 foi alterada ou removida).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Investidor 1 (tenant A) le SOMENTE o proprio registro/vinculo/aporte/
--    retorno -- NAO ve o de investidor 2, do MESMO tenant.
-- 2. Investidor 1 nao ve NADA do tenant B (investidor_b), nas 4 tabelas.
-- 3. Investidor 1 ve SOMENTE o projeto onde tem vinculo ativo (project_A1);
--    NAO ve project_A2 (onde so investidor 2 tem vinculo), mesmo tenant.
-- 4. get_project_operational_result: investidor 1 chama com sucesso (1
--    linha) para project_A1 (vinculo ativo); 0 linhas para project_A2
--    (mesmo tenant, sem vinculo); 0 linhas para project_A1 se chamado pelo
--    investidor do tenant B (cross-tenant).
-- 5. get_project_operational_result: o valor retornado para project_A1
--    bate com o calculo manual esperado (cenario com deals vendidos +
--    comissoes + custos de projeto conhecidos, incluindo linhas "ruido" que
--    devem ser excluidas: deal nao vendido, deal vendido sem
--    final_sale_value, deal vendido excluido, comissao excluida, comissao
--    de outro projeto).
-- 6. get_project_operational_result: admin do tenant A tambem consegue
--    chamar para project_A1 (equipe interna sempre autorizada) e obtem o
--    MESMO resultado agregado que o investidor.
-- 7. Investidor 1 NAO consegue inserir/atualizar em nenhuma das 4 tabelas
--    de investidores nem em projects -- so leitura para este papel.

begin;

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------
-- Tenant A: admin, investor_1 (vinculo ativo em project_A1), investor_2
-- (vinculo ativo em project_A2 -- projeto DIFERENTE, para provar isolamento
-- por projeto tambem). Tenant B: admin, investor_b (vinculo em project_B1)
-- -- prova isolamento cross-tenant. Mais um usuario orfao, sem
-- tenant_users.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('b1000000-0000-0000-0000-000000000001'), -- user_a_admin
  ('b1000000-0000-0000-0000-000000000002'), -- user_a_investor_1
  ('b1000000-0000-0000-0000-000000000003'), -- user_a_investor_2
  ('b1000000-0000-0000-0000-000000000004'), -- user_b_admin
  ('b1000000-0000-0000-0000-000000000005'), -- user_b_investor
  ('b1000000-0000-0000-0000-000000000006'); -- user_orphan

insert into public.tenants (id, name, slug) values
  ('b2000000-0000-0000-0000-00000000000a', 'Tenant A - teste portal investidor 0055', 'tenant-a-teste-portal-investidor-0055'),
  ('b2000000-0000-0000-0000-00000000000b', 'Tenant B - teste portal investidor 0055', 'tenant-b-teste-portal-investidor-0055');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('b2000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('b2000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 'investidor', 'active'),
  ('b2000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000003', 'investidor', 'active'),
  ('b2000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000004', 'admin', 'active'),
  ('b2000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000005', 'investidor', 'active');

-- Dado "de fato existente", inserido diretamente como dono das tabelas
-- (bypassa RLS de proposito so para popular o cenario -- os testes reais de
-- leitura/escrita usam os roles simulados abaixo).

-- Projects: A1 (custos conhecidos, usado no calculo do resultado
-- operacional), A2 (so vinculo de investor_2), B1 (tenant B).
--
-- total_construction_cost/total_indirect_costs != 0 em project_A1: o
-- trigger de 0047 (enforce_project_cost_fields_admin_only) bloqueia INSERT
-- com valor != 0 nessas 2 colunas para qualquer role exceto admin OU
-- service_role -- mesmo rodando este INSERT como dono da tabela (RLS e
-- bypassada por ownership, mas o TRIGGER roda para qualquer role, ver
-- 0047). set_config abaixo simula `auth.role() = 'service_role'` so para
-- este INSERT de setup (mesma exigencia ja documentada em
-- supabase/tests/0047_project_cost_fields_isolation.sql) -- os testes reais
-- desta migration usam claims de admin/investidor/comercial normais,
-- definidos mais abaixo.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.projects (id, tenant_id, code, name, total_construction_cost, total_indirect_costs) values
  ('b3000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'PROJ-A1-0055', 'Projeto A1 Tenant A', 200000, 50000),
  ('b3000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'PROJ-A2-0055', 'Projeto A2 Tenant A', 0, 0),
  ('b3000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000b', 'PROJ-B1-0055', 'Projeto B1 Tenant B', 0, 0);

insert into public.investors (id, tenant_id, nome, tipo, user_id) values
  ('b4000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'Investidor 1', 'PF', 'b1000000-0000-0000-0000-000000000002'),
  ('b4000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'Investidor 2', 'PF', 'b1000000-0000-0000-0000-000000000003'),
  ('b4000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000b', 'Investidor B', 'PF', 'b1000000-0000-0000-0000-000000000005');

insert into public.project_investors (id, tenant_id, project_id, investor_id, nome_exibicao, valor_aportado, percentual_participacao) values
  ('b5000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 'Investidor 1 no Projeto A1', 100000, 10),
  ('b5000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b', 'b4000000-0000-0000-0000-00000000000b', 'Investidor 2 no Projeto A2', 70000, 15),
  ('b5000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-00000000000c', 'b4000000-0000-0000-0000-00000000000c', 'Investidor B no Projeto B1', 90000, 20);

insert into public.investment_contributions (id, tenant_id, project_id, investor_id, valor, data) values
  ('b6000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 50000, current_date),
  ('b6000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b', 'b4000000-0000-0000-0000-00000000000b', 70000, current_date),
  ('b6000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-00000000000c', 'b4000000-0000-0000-0000-00000000000c', 90000, current_date);

insert into public.investment_returns (id, tenant_id, project_id, investor_id, valor, data, return_type) values
  ('b7000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 5000, current_date, 'DIVIDENDO_INVESTIDOR'),
  ('b7000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b', 'b4000000-0000-0000-0000-00000000000b', 7000, current_date, 'DIVIDENDO_INVESTIDOR'),
  ('b7000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-00000000000c', 'b4000000-0000-0000-0000-00000000000c', 9000, current_date, 'DIVIDENDO_INVESTIDOR');

-- ---------------------------------------------------------------------
-- Cenario de Resultado Operacional do project_A1 (para os testes 4/5/6).
-- Valores escolhidos para o calculo bater com numeros redondos:
--   receivedRevenue = 500000 + 300000 = 800000 (so deals vendido, com
--     final_sale_value, nao excluidos)
--   salesCosts = 30000 (comm1.gross_value) + 10000 (comm2.base_value,
--     fallback pois gross_value e null) = 40000
--   netVGV = 800000 - 40000 = 760000
--   totalCosts = 200000 (total_construction_cost) + 50000
--     (total_indirect_costs) = 250000
--   netResult = 760000 - 250000 = 510000
--   margin = 510000 / 800000 * 100 = 63.75
--
-- "Ruido" deliberado, que a funcao PRECISA excluir do calculo:
--   deal3: sales_stage = 'reservado' (nao 'vendido') -- excluido mesmo com
--     final_sale_value preenchido.
--   deal4: sales_stage = 'vendido' mas final_sale_value NULL -- excluido.
--   deal5: sales_stage = 'vendido', final_sale_value preenchido, mas
--     is_deleted = true -- excluido.
--   comm3: is_deleted = true -- excluido mesmo com gross_value preenchido.
--   deal6/comm5: pertencem a project_A2, nao project_A1 -- nao podem
--     "vazar" para o calculo de project_A1.
-- ---------------------------------------------------------------------

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('b8000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'U-A1-1-0055', 500000),
  ('b8000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'U-A1-2-0055', 300000),
  ('b8000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'U-A1-3-0055', 999999),
  ('b8000000-0000-0000-0000-00000000000d', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'U-A1-4-0055', 400000),
  ('b8000000-0000-0000-0000-00000000000e', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'U-A1-5-0055', 999999),
  ('b8000000-0000-0000-0000-00000000000f', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b', 'U-A2-1-0055', 123456);

insert into public.clients (id, tenant_id, name) values
  ('b9000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'Cliente Teste 0055');

insert into public.brokers (id, tenant_id, name) values
  ('ba000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'Corretor Teste 0055');

insert into public.deals (id, tenant_id, project_id, unit_id, client_id, sales_stage, final_sale_value, is_deleted) values
  ('bb000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000a', 'b9000000-0000-0000-0000-00000000000a', 'vendido', 500000, false), -- deal1: conta
  ('bb000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-00000000000a', 'vendido', 300000, false), -- deal2: conta
  ('bb000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000c', 'b9000000-0000-0000-0000-00000000000a', 'reservado', 999999, false), -- deal3: ruido (nao vendido)
  ('bb000000-0000-0000-0000-00000000000d', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000d', 'b9000000-0000-0000-0000-00000000000a', 'vendido', null, false), -- deal4: ruido (final_sale_value null)
  ('bb000000-0000-0000-0000-00000000000e', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000e', 'b9000000-0000-0000-0000-00000000000a', 'vendido', 999999, true), -- deal5: ruido (excluido)
  ('bb000000-0000-0000-0000-00000000000f', 'b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000b', 'b8000000-0000-0000-0000-00000000000f', 'b9000000-0000-0000-0000-00000000000a', 'vendido', 123456, false); -- deal6: ruido (outro projeto, project_A2)

insert into public.commissions (id, tenant_id, broker_id, deal_id, unit_id, project_id, base_value, gross_value, is_deleted) values
  ('bc000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 25000, 30000, false), -- comm1: conta gross_value = 30000
  ('bc000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-00000000000b', 'b8000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-00000000000a', 10000, null, false), -- comm2: conta fallback base_value = 10000
  ('bc000000-0000-0000-0000-00000000000c', 'b2000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-00000000000d', 'b8000000-0000-0000-0000-00000000000d', 'b3000000-0000-0000-0000-00000000000a', 999999, 999999, true), -- comm3: ruido (excluida)
  ('bc000000-0000-0000-0000-00000000000d', 'b2000000-0000-0000-0000-00000000000a', 'ba000000-0000-0000-0000-00000000000a', 'bb000000-0000-0000-0000-00000000000f', 'b8000000-0000-0000-0000-00000000000f', 'b3000000-0000-0000-0000-00000000000b', 123456, 123456, false); -- comm5: ruido (outro projeto, project_A2)

-- ---------------------------------------------------------------------
-- TESTE 1: investidor 1 (tenant A) le SOMENTE o proprio registro/vinculo/
-- aporte/retorno -- NAO ve o de investidor 2, do MESMO tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
  v_investor_id uuid; v_pi_id uuid; v_contrib_id uuid; v_return_id uuid;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 1 or v_pi <> 1 or v_contrib <> 1 or v_returns <> 1 then
    raise exception 'FALHOU (1a): investidor 1 deveria ver exatamente 1 linha em cada tabela, so a propria (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;

  select id into v_investor_id from public.investors limit 1;
  select id into v_pi_id from public.project_investors limit 1;
  select id into v_contrib_id from public.investment_contributions limit 1;
  select id into v_return_id from public.investment_returns limit 1;

  if v_investor_id <> 'b4000000-0000-0000-0000-00000000000a'
    or v_pi_id <> 'b5000000-0000-0000-0000-00000000000a'
    or v_contrib_id <> 'b6000000-0000-0000-0000-00000000000a'
    or v_return_id <> 'b7000000-0000-0000-0000-00000000000a'
  then
    raise exception 'FALHOU (1b): investidor 1 viu a linha ERRADA -- deveria ser exatamente as proprias (investor_id=%, pi_id=%, contrib_id=%, return_id=%)', v_investor_id, v_pi_id, v_contrib_id, v_return_id;
  end if;

  -- Confirma explicitamente que NENHUMA linha do investidor 2 aparece.
  if exists (select 1 from public.investors where id = 'b4000000-0000-0000-0000-00000000000b')
    or exists (select 1 from public.project_investors where id = 'b5000000-0000-0000-0000-00000000000b')
    or exists (select 1 from public.investment_contributions where id = 'b6000000-0000-0000-0000-00000000000b')
    or exists (select 1 from public.investment_returns where id = 'b7000000-0000-0000-0000-00000000000b')
  then
    raise exception 'FALHOU (1c): investidor 1 conseguiu ver linha(s) de investidor 2 (MESMO tenant) -- isolamento por investor_id nao esta funcionando';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: investidor 1 nao ve NADA do tenant B (investidor_b), nas 4
-- tabelas -- isolamento cross-tenant (ja garantido pelo tenant_id no claim,
-- mas confirmado explicitamente aqui).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors_b int; v_pi_b int; v_contrib_b int; v_returns_b int;
begin
  select count(*) into v_investors_b from public.investors where tenant_id = 'b2000000-0000-0000-0000-00000000000b';
  select count(*) into v_pi_b from public.project_investors where tenant_id = 'b2000000-0000-0000-0000-00000000000b';
  select count(*) into v_contrib_b from public.investment_contributions where tenant_id = 'b2000000-0000-0000-0000-00000000000b';
  select count(*) into v_returns_b from public.investment_returns where tenant_id = 'b2000000-0000-0000-0000-00000000000b';

  if v_investors_b <> 0 or v_pi_b <> 0 or v_contrib_b <> 0 or v_returns_b <> 0 then
    raise exception 'FALHOU (2): investidor 1 (tenant A) conseguiu ver linha(s) do tenant B (investors=%, project_investors=%, contributions=%, returns=%)', v_investors_b, v_pi_b, v_contrib_b, v_returns_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: investidor 1 ve SOMENTE o projeto onde tem vinculo ativo
-- (project_A1); NAO ve project_A2 (onde so investidor 2 tem vinculo),
-- mesmo tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_projects int; v_project_id uuid;
begin
  select count(*) into v_projects from public.projects;
  if v_projects <> 1 then
    raise exception 'FALHOU (3a): investidor 1 deveria ver exatamente 1 projeto (o proprio vinculo), viu %', v_projects;
  end if;

  select id into v_project_id from public.projects limit 1;
  if v_project_id <> 'b3000000-0000-0000-0000-00000000000a' then
    raise exception 'FALHOU (3b): investidor 1 deveria ver project_A1, viu %', v_project_id;
  end if;

  if exists (select 1 from public.projects where id = 'b3000000-0000-0000-0000-00000000000b') then
    raise exception 'FALHOU (3c): investidor 1 conseguiu ver project_A2 (vinculo e de investidor 2, nao dele)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4 e 5: get_project_operational_result -- autorizacao por vinculo E
-- valor batendo com o calculo manual esperado.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_row record;
  v_rows int;
begin
  -- 4a: investidor 1 chama para project_A1 (vinculo ativo) -- 1 linha, com
  -- os valores exatos calculados manualmente (comentario acima da secao de
  -- setup do cenario).
  select * into v_row from public.get_project_operational_result('b3000000-0000-0000-0000-00000000000a');

  if v_row is null then
    raise exception 'FALHOU (4a): investidor 1 deveria conseguir chamar get_project_operational_result para project_A1 (vinculo ativo), mas nao retornou linha';
  end if;

  if v_row.received_revenue <> 800000
    or v_row.sales_costs <> 40000
    or v_row.net_vgv <> 760000
    or v_row.total_construction_cost <> 200000
    or v_row.total_indirect_costs <> 50000
    or v_row.total_costs <> 250000
    or v_row.net_result <> 510000
    or round(v_row.margin, 2) <> 63.75
  then
    raise exception 'FALHOU (5): valor de get_project_operational_result nao bate com o calculo manual esperado -- received_revenue=% (esperado 800000), sales_costs=% (esperado 40000), net_vgv=% (esperado 760000), total_costs=% (esperado 250000), net_result=% (esperado 510000), margin=% (esperado 63.75)',
      v_row.received_revenue, v_row.sales_costs, v_row.net_vgv, v_row.total_costs, v_row.net_result, v_row.margin;
  end if;

  -- 4b: investidor 1 chama para project_A2 (MESMO tenant, SEM vinculo) --
  -- 0 linhas, nao erro, nao linha de outro projeto/investidor.
  select count(*) into v_rows from public.get_project_operational_result('b3000000-0000-0000-0000-00000000000b');
  if v_rows <> 0 then
    raise exception 'FALHOU (4c): investidor 1 SEM vinculo em project_A2 conseguiu chamar get_project_operational_result e obteve % linha(s) -- deveria ser vazio', v_rows;
  end if;
end $$;

reset role;

-- 4d: investidor do tenant B chamando para project_A1 (projeto de OUTRO
-- tenant) -- 0 linhas, cross-tenant bloqueado mesmo tendo tenant_role
-- correto e algum vinculo (so que em outro tenant).

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000005","tenant_id":"b2000000-0000-0000-0000-00000000000b","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.get_project_operational_result('b3000000-0000-0000-0000-00000000000a');
  if v_rows <> 0 then
    raise exception 'FALHOU (4d): investidor do tenant B conseguiu chamar get_project_operational_result para um projeto do tenant A e obteve % linha(s) -- deveria ser vazio (isolamento cross-tenant da funcao)', v_rows;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: admin do tenant A tambem consegue chamar para project_A1 (equipe
-- interna sempre autorizada) e obtem o MESMO resultado agregado que o
-- investidor no teste 4a/5 -- mesma formula, uma fonte da verdade.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000001","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_row record;
begin
  select * into v_row from public.get_project_operational_result('b3000000-0000-0000-0000-00000000000a');

  if v_row is null or v_row.net_result <> 510000 or round(v_row.margin, 2) <> 63.75 then
    raise exception 'FALHOU (6): admin do tenant A deveria conseguir chamar get_project_operational_result para project_A1 e obter o mesmo resultado agregado (net_result=510000, margin=63.75) -- obteve net_result=%, margin=%',
      v_row.net_result, v_row.margin;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: investidor 1 NAO consegue inserir/atualizar em nenhuma das 4
-- tabelas de investidores nem em projects -- so leitura para este papel
-- (sem policy de INSERT/UPDATE nova para tenant_role=investidor em
-- 0055/0045/0010).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000002","tenant_id":"b2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('b2000000-0000-0000-0000-00000000000a', 'Tentativa investidor', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7a): investidor conseguiu inserir em investors -- deveria ser bloqueado (so leitura para este papel)';
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.investors set nome = 'tentativa investidor update' where id = 'b4000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7b): investidor conseguiu atualizar o proprio registro em investors (afetou % linha(s)) -- deveria ser bloqueado (sem policy de UPDATE para este papel)', v_linhas;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.project_investors (tenant_id, project_id, investor_id, nome_exibicao)
    values ('b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 'Tentativa investidor');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7c): investidor conseguiu inserir em project_investors -- deveria ser bloqueado';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_contributions (tenant_id, project_id, investor_id, valor, data)
    values ('b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 1000, current_date);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7d): investidor conseguiu inserir em investment_contributions -- deveria ser bloqueado';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_returns (tenant_id, project_id, investor_id, valor, data, return_type)
    values ('b2000000-0000-0000-0000-00000000000a', 'b3000000-0000-0000-0000-00000000000a', 'b4000000-0000-0000-0000-00000000000a', 1000, current_date, 'PRINCIPAL');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7e): investidor conseguiu inserir em investment_returns -- deveria ser bloqueado';
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.projects set name = 'tentativa investidor update' where id = 'b3000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7f): investidor conseguiu atualizar projects (afetou % linha(s)) -- deveria ser bloqueado (sem policy de UPDATE para este papel)', v_linhas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0055/0056 - Portal do Investidor)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
