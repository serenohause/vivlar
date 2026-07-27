-- 0059_espelho_vendas_isolation.sql
-- Teste de isolamento para a RLS/RPCs públicas introduzidas em
-- supabase/migrations/0059_rls_espelho_vendas.sql (Módulo 13 — Espelho de
-- Vendas): get_public_project, get_public_units, create_public_lead,
-- create_public_reservation, e a RLS de public_leads.
--
-- COMO RODAR
-- ----------
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0059_espelho_vendas_isolation.sql
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transação com ROLLBACK no final -- nenhum dado
-- sintético (tenants/tenant_users/auth.users/projects/units/clients/deals/
-- status_transitions/public_leads) fica no banco. Qualquer asserção que
-- falhe faz `raise exception`, abortando a transação inteira.
--
-- `set local role anon;` simula exatamente o papel que o PostgREST usa para
-- uma requisição sem sessão (visitante do site público, sem Authorization
-- header de usuário) -- sem nenhum `request.jwt.claims`, igual ao que
-- acontece de verdade para `anon`.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- (a) anon consegue chamar get_public_project/get_public_units só para
--     projeto is_public=true, recebe null/[] para projeto privado ou
--     inexistente, sem diferenciar os casos na resposta.
-- (b) anon NÃO consegue `select` direto em projects/units/clients/deals/
--     brokers/status_transitions (nenhum grant de tabela).
-- (c) reserva bem-sucedida cria exatamente 1 client + 1 deal + 1 unit
--     atualizada + 1 status_transition + 1 public_lead, valores batendo.
-- (d) uma segunda tentativa de reserva na MESMA unidade (já reservada,
--     sequencial dentro desta mesma transação) falha com erro claro, sem
--     deixar a unidade num estado inconsistente -- prova a lógica de guarda
--     (`status <> 'disponivel'`). O teste de CONCORRÊNCIA REAL (2 sessões
--     paralelas de verdade, disputando o lock de units.for update) está em
--     supabase/tests/0059_reserva_concurrency_*.sql -- não pode ser feito
--     numa transação sequencial única como esta.
-- (e) reserva para projeto não-público e para unidade de outro projeto
--     falham.
-- (f) CPF repetido reaproveita o client existente em vez de duplicar.
-- (g) equipe interna (admin/comercial/administrativo) continua com acesso
--     normal via RLS já existente -- checagem leve aqui; a suíte completa de
--     0010/0017 foi rerodada à parte (sem regressão, ver relatório).
--
-- NÃO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, só
-- deve ser usado dentro de Edge Functions, nunca exposto ao client). Nenhuma
-- Edge Function usa service_role para o Espelho de Vendas -- as 4 functions
-- security definer substituem essa necessidade.

begin;

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('f6111111-1111-1111-1111-111111111111'), -- user_a_admin: tenant A, admin (checagem leve item g)
  ('f6222222-2222-2222-2222-222222222222'); -- user_b_admin: tenant B, admin

insert into public.tenants (id, name, slug) values
  ('f1111111-1111-1111-1111-111111111111', 'Tenant A - teste isolamento espelho 0059', 'tenant-a-teste-isolamento-espelho-0059'),
  ('f2222222-2222-2222-2222-222222222222', 'Tenant B - teste isolamento espelho 0059', 'tenant-b-teste-isolamento-espelho-0059');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('f1111111-1111-1111-1111-111111111111', 'f6111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('f2222222-2222-2222-2222-222222222222', 'f6222222-2222-2222-2222-222222222222', 'admin', 'active');

-- Projeto público (tenant A) com 2 unidades disponíveis. total_construction_
-- cost/total_indirect_costs ficam no default (0) de proposito: o trigger
-- projects_enforce_cost_fields_admin_only (0047) bloqueia INSERT com valor
-- != 0 nessas colunas quando tenant_role != 'admin' no claim -- este setup
-- roda sem nenhum claim (role = postgres, dono, que TAMBEM nao e isento do
-- trigger -- so service_role e). "notes" continua no teste (a3) pra provar
-- que get_public_project nao vaza esse campo.
insert into public.projects (id, tenant_id, code, name, slug, is_public, reserva_horas, notes)
values (
  'f3111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111',
  'PRJ-A-0059', 'Residencial Teste 0059', 'residencial-teste-0059', true, 24,
  'Nota interna que NUNCA pode vazar pro publico'
);

insert into public.units (id, tenant_id, project_id, sku, list_price, status, notes, admin_status)
values
  ('f4111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'f3111111-1111-1111-1111-111111111111', 'UN-A-01-0059', 150000, 'disponivel', 'Nota interna da unidade -- nunca publica', 'laudo_engenharia'),
  ('f4222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 'f3111111-1111-1111-1111-111111111111', 'UN-A-02-0059', 160000, 'disponivel', null, null);

-- Projeto privado (tenant A) -- is_public=false, usado no teste (e) e no
-- teste (a).
insert into public.projects (id, tenant_id, code, name, slug, is_public)
values (
  'f3222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111',
  'PRJ-A-PRIVADO-0059', 'Projeto Privado Teste 0059', 'projeto-privado-teste-0059', false
);

-- Projeto público de OUTRO tenant (B), com 1 unidade -- usado no teste (e)
-- (unidade de outro projeto).
insert into public.projects (id, tenant_id, code, name, slug, is_public, reserva_horas)
values (
  'f3333333-3333-3333-3333-333333333333', 'f2222222-2222-2222-2222-222222222222',
  'PRJ-B-0059', 'Residencial Tenant B 0059', 'residencial-tenant-b-0059', true, 24
);

insert into public.units (id, tenant_id, project_id, sku, list_price, status)
values (
  'f4333333-3333-3333-3333-333333333333', 'f2222222-2222-2222-2222-222222222222', 'f3333333-3333-3333-3333-333333333333', 'UN-B-01-0059', 200000, 'disponivel'
);

-- ---------------------------------------------------------------------
-- TESTE (a): get_public_project/get_public_units como anon.
-- ---------------------------------------------------------------------

set local role anon;

do $$
declare
  v_project jsonb;
  v_units jsonb;
begin
  -- Projeto público: devolve os campos public-safe, NUNCA notes/
  -- total_construction_cost/tenant_id.
  v_project := public.get_public_project('residencial-teste-0059');

  if v_project is null then
    raise exception 'FALHOU (a1): get_public_project deveria devolver o projeto público';
  end if;

  if v_project->>'name' <> 'Residencial Teste 0059' then
    raise exception 'FALHOU (a2): campo name incorreto: %', v_project;
  end if;

  if v_project ? 'notes' or v_project ? 'total_construction_cost' or v_project ? 'tenant_id' then
    raise exception 'FALHOU (a3): get_public_project vazou campo interno/sensivel: %', v_project;
  end if;

  -- Projeto privado: null, sem diferenciar de "não existe".
  if public.get_public_project('projeto-privado-teste-0059') is not null then
    raise exception 'FALHOU (a4): get_public_project deveria devolver null para projeto privado';
  end if;

  -- Slug inexistente: null.
  if public.get_public_project('slug-que-nao-existe-0059') is not null then
    raise exception 'FALHOU (a5): get_public_project deveria devolver null para slug inexistente';
  end if;

  -- Unidades do projeto público: 2 unidades, campos public-safe, sem notes/
  -- admin_status.
  v_units := public.get_public_units('f3111111-1111-1111-1111-111111111111');

  if jsonb_array_length(v_units) <> 2 then
    raise exception 'FALHOU (a6): get_public_units deveria devolver 2 unidades, veio %', jsonb_array_length(v_units);
  end if;

  if (v_units->0) ? 'notes' or (v_units->0) ? 'admin_status' then
    raise exception 'FALHOU (a7): get_public_units vazou campo interno/sensivel: %', v_units;
  end if;

  -- Unidades de projeto privado: [] (revalida internamente, mesmo se o
  -- project_id "vazar" de algum jeito).
  if public.get_public_units('f3222222-2222-2222-2222-222222222222') <> '[]'::jsonb then
    raise exception 'FALHOU (a8): get_public_units deveria devolver [] para projeto privado';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE (b): anon NÃO consegue select direto nas tabelas de base.
-- ---------------------------------------------------------------------

set local role anon;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.projects limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b1): anon conseguiu select direto em projects'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.units limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b2): anon conseguiu select direto em units'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.clients limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b3): anon conseguiu select direto em clients'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.deals limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b4): anon conseguiu select direto em deals'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.brokers limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b5): anon conseguiu select direto em brokers'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.status_transitions limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b6): anon conseguiu select direto em status_transitions'; end if;
end $$;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    perform 1 from public.public_leads limit 1;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then raise exception 'FALHOU (b7): anon conseguiu select direto em public_leads'; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE (c): reserva bem-sucedida via create_public_reservation (como
-- anon) -- 1 client + 1 deal + 1 unit atualizada + 1 status_transition + 1
-- public_lead, valores batendo.
-- ---------------------------------------------------------------------

set local role anon;

do $$
declare
  v_result jsonb;
  v_deal_id uuid;
  v_client_id uuid;
  v_unit public.units;
  v_deal public.deals;
  v_transition_count int;
  v_lead_count int;
begin
  v_result := public.create_public_reservation(
    'f3111111-1111-1111-1111-111111111111', -- project_id
    'f4111111-1111-1111-1111-111111111111', -- unit_id
    'Fulano de Tal Reserva',
    '(85) 99999-0001',
    '111.222.333-96',
    'fulano@example.com',
    'google', 'cpc', 'campanha-0059'
  );

  v_deal_id := (v_result->>'deal_id')::uuid;
  v_client_id := (v_result->>'client_id')::uuid;

  if v_deal_id is null or v_client_id is null then
    raise exception 'FALHOU (c1): create_public_reservation nao devolveu deal_id/client_id: %', v_result;
  end if;

  reset role; -- consultas de verificacao como dono, bypassando RLS de proposito

  select count(*) into v_transition_count from public.status_transitions where deal_id = v_deal_id;
  select count(*) into v_lead_count from public.public_leads where converted_to_deal_id = v_deal_id;
  select * into v_unit from public.units where id = 'f4111111-1111-1111-1111-111111111111';
  select * into v_deal from public.deals where id = v_deal_id;

  if v_unit.status <> 'reservada' or v_unit.active_deal_id <> v_deal_id then
    raise exception 'FALHOU (c2): unit nao refletiu a reserva corretamente (status=%, active_deal_id=%)', v_unit.status, v_unit.active_deal_id;
  end if;

  if v_deal.sales_stage <> 'reservado' or v_deal.client_id <> v_client_id or v_deal.is_active <> true then
    raise exception 'FALHOU (c3): deal criado com valores incorretos (sales_stage=%, client_id=%, is_active=%)', v_deal.sales_stage, v_deal.client_id, v_deal.is_active;
  end if;

  if v_deal.expected_sale_value <> 150000 then
    raise exception 'FALHOU (c4): deal.expected_sale_value deveria ser units.list_price (150000), veio %', v_deal.expected_sale_value;
  end if;

  if v_transition_count <> 1 then
    raise exception 'FALHOU (c5): deveria existir exatamente 1 status_transition para o deal, veio %', v_transition_count;
  end if;

  if v_lead_count <> 1 then
    raise exception 'FALHOU (c6): deveria existir exatamente 1 public_lead convertido para o deal, veio %', v_lead_count;
  end if;

  if not exists (select 1 from public.clients where id = v_client_id and cpf = '11122233396') then
    raise exception 'FALHOU (c7): client nao foi criado com o cpf esperado';
  end if;

  set local role anon; -- devolve o papel para os proximos blocos deste teste
end $$;

-- ---------------------------------------------------------------------
-- TESTE (d): segunda tentativa de reserva na MESMA unidade (agora
-- 'reservada') falha com erro claro -- prova sequencial da guarda (a prova
-- de concorrência real com 2 sessões paralelas está em arquivo separado).
-- ---------------------------------------------------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    perform public.create_public_reservation(
      'f3111111-1111-1111-1111-111111111111',
      'f4111111-1111-1111-1111-111111111111', -- mesma unidade do teste (c), ja reservada
      'Segundo Interessado',
      '(85) 99999-0002',
      '222.333.444-05'
    );
    v_ok := true;
  exception when others then
    v_ok := false;
    if sqlerrm not ilike '%acabou de ser reservada%' then
      raise exception 'FALHOU (d1): mensagem de erro inesperada para unidade ja reservada: %', sqlerrm;
    end if;
  end;
  if v_ok then
    raise exception 'FALHOU (d2): conseguiu reservar uma unidade que ja estava reservada';
  end if;
end $$;

reset role;

do $$
declare v_deals_count int;
begin
  select count(*) into v_deals_count from public.deals where unit_id = 'f4111111-1111-1111-1111-111111111111';
  if v_deals_count <> 1 then
    raise exception 'FALHOU (d3): unidade deveria ter exatamente 1 deal apos a tentativa duplicada, veio %', v_deals_count;
  end if;
end $$;

set local role anon;

-- ---------------------------------------------------------------------
-- TESTE (e): reserva para projeto nao-publico e para unidade de outro
-- projeto falham.
-- ---------------------------------------------------------------------

do $$
declare v_ok boolean := false;
begin
  begin
    perform public.create_public_reservation(
      'f3222222-2222-2222-2222-222222222222', -- projeto PRIVADO
      'f4111111-1111-1111-1111-111111111111',
      'Nao Deveria Reservar', '(85) 99999-0003', '333.444.555-14'
    );
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (e1): conseguiu reservar unidade via projeto privado';
  end if;
end $$;

do $$
declare v_ok boolean := false;
begin
  begin
    -- unit_id pertence ao projeto do TENANT B, mas project_id passado e do
    -- projeto publico do tenant A -- deve falhar (unidade nao pertence ao
    -- project_id informado).
    perform public.create_public_reservation(
      'f3111111-1111-1111-1111-111111111111',
      'f4333333-3333-3333-3333-333333333333',
      'Nao Deveria Reservar Cross Project', '(85) 99999-0004', '444.555.666-23'
    );
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (e2): conseguiu reservar unidade de outro projeto/tenant';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE (f): CPF repetido reaproveita o client existente (nova unidade,
-- mesmo CPF do teste (c): 111.222.333-96).
-- ---------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_client_id uuid;
  v_expected_client_id uuid;
  v_clients_count int;
begin
  v_result := public.create_public_reservation(
    'f3111111-1111-1111-1111-111111111111',
    'f4222222-2222-2222-2222-222222222222', -- segunda unidade, ainda disponivel
    'Fulano de Tal Reserva', -- mesmo nome/telefone do teste (c), mesmo CPF
    '(85) 99999-0001',
    '111.222.333-96'
  );

  v_client_id := (v_result->>'client_id')::uuid;

  reset role;

  select id into v_expected_client_id from public.clients where tenant_id = 'f1111111-1111-1111-1111-111111111111' and cpf = '11122233396';
  select count(*) into v_clients_count from public.clients where tenant_id = 'f1111111-1111-1111-1111-111111111111' and cpf = '11122233396';

  if v_client_id <> v_expected_client_id then
    raise exception 'FALHOU (f1): segunda reserva com mesmo CPF deveria reaproveitar o client %, criou %', v_expected_client_id, v_client_id;
  end if;

  if v_clients_count <> 1 then
    raise exception 'FALHOU (f2): deveria existir exatamente 1 client para o CPF 11122233396, veio %', v_clients_count;
  end if;

  set local role anon;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE (g): checagem leve -- equipe interna do tenant A continua
-- enxergando e resolvendo consultas normais via RLS ja existente (a suite
-- completa de 0010/0017 foi rerodada a parte, sem regressao).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f6111111-1111-1111-1111-111111111111","tenant_id":"f1111111-1111-1111-1111-111111111111","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_projects int;
  v_units int;
  v_deals int;
  v_leads int;
begin
  select count(*) into v_projects from public.projects where tenant_id = 'f1111111-1111-1111-1111-111111111111';
  select count(*) into v_units from public.units where tenant_id = 'f1111111-1111-1111-1111-111111111111';
  select count(*) into v_deals from public.deals where tenant_id = 'f1111111-1111-1111-1111-111111111111';
  select count(*) into v_leads from public.public_leads where tenant_id = 'f1111111-1111-1111-1111-111111111111';

  if v_projects <> 2 or v_units <> 2 or v_deals <> 2 or v_leads <> 2 then
    raise exception 'FALHOU (g1): admin do tenant A deveria ver 2 projects/2 units/2 deals/2 public_leads (viu %/%/%/%)', v_projects, v_units, v_deals, v_leads;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0059 - Espelho de Vendas)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
