-- 0028_update_deal_stage_commission.sql (teste)
-- Teste da extensao de `public.update_deal_stage` introduzida em
-- supabase/migrations/0028_update_deal_stage_commission.sql (criacao
-- automatica de `commissions` + preenchimento de
-- `deals.commission_rate`/`commission_value` ao vender).
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0018_update_deal_stage_rpc.sql e
-- supabase/tests/0027_comissoes_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0028_update_deal_stage_commission.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0028_update_deal_stage_commission.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer assercao que falhe faz `raise exception`, abortando a transacao
-- inteira (o que por sua vez teria feito rollback de qualquer forma -- o
-- `rollback;` explicito no fim so cobre o caminho feliz).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Mover um deal COM broker_id de 'reservado' para 'vendido' cria
--    exatamente 1 `commission`, com base_value/gross_value/rate batendo com
--    unit.list_price * broker.commission_rate, status='a_pagar' e
--    due_date = hoje + 7 dias -- e `deals.commission_rate`/`commission_value`
--    ficam preenchidos com os mesmos valores.
-- 2. Mover o MESMO deal de volta para 'reservado' e de novo para 'vendido'
--    (reenvio/oscilacao de estagio) NAO quebra por violar o indice unico
--    parcial `commissions_tenant_id_deal_id_uidx` nem cria uma segunda
--    commission -- continua exatamente 1 linha para o deal.
-- 3. Um deal SEM broker_id vira 'vendido' normalmente (sales_stage/is_active/
--    sold_at corretos, unit vira 'vendida'), sem criar nenhuma commission e
--    sem lancar erro -- mas deals.commission_rate/commission_value ficam
--    preenchidos mesmo assim (0.05 * list_price), reproduzindo fielmente o
--    fallback do original (broker?.commission_rate || 0.05 -- calculado
--    independente de broker_id existir).

begin;

-- ---------------------------------------------------------------------
-- Setup: um tenant, um usuario 'comercial', um projeto, um broker (taxa
-- customizada, diferente do default 0.05, pra nao confundir com o
-- fallback), 3 units (uma por deal), um client, 3 deals: A (com broker),
-- B (mesmo broker, usado no teste de oscilacao de estagio), C (sem
-- broker_id).
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('e1111111-1111-1111-1111-111111111111'); -- user_comercial: tenant, comercial

insert into public.tenants (id, name, slug) values
  ('b9111111-1111-1111-1111-111111111111', 'Tenant - teste comissao 0028', 'tenant-teste-comissao-0028');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('b9111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'comercial', 'active');

insert into public.projects (id, tenant_id, code, name)
values
  ('b9222222-2222-2222-2222-222222222222', 'b9111111-1111-1111-1111-111111111111', 'PRJ-0028', 'Projeto teste 0028');

insert into public.brokers (id, tenant_id, name, commission_rate)
values
  ('b9333333-3333-3333-3333-333333333333', 'b9111111-1111-1111-1111-111111111111', 'Corretor teste 0028', 0.0625);

insert into public.units (id, tenant_id, project_id, sku, list_price, status)
values
  ('b9444444-4444-4444-4444-444444444444', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0028-A', 200000, 'reservada'),
  ('b9555555-5555-5555-5555-555555555555', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0028-B', 300000, 'reservada'),
  ('b9666666-6666-6666-6666-666666666666', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0028-C', 150000, 'reservada');

insert into public.clients (id, tenant_id, name)
values
  ('b9777777-7777-7777-7777-777777777777', 'b9111111-1111-1111-1111-111111111111', 'Cliente teste 0028');

insert into public.deals (id, tenant_id, project_id, client_id, unit_id, broker_id, sales_stage, is_active)
values
  ('b9888888-8888-8888-8888-888888888888', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9777777-7777-7777-7777-777777777777', 'b9444444-4444-4444-4444-444444444444', 'b9333333-3333-3333-3333-333333333333', 'reservado', true), -- A: com broker
  ('b9999999-9999-9999-9999-999999999999', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9777777-7777-7777-7777-777777777777', 'b9555555-5555-5555-5555-555555555555', 'b9333333-3333-3333-3333-333333333333', 'reservado', true), -- B: com broker, para oscilacao
  ('b9aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9777777-7777-7777-7777-777777777777', 'b9666666-6666-6666-6666-666666666666', null,                                   'reservado', true); -- C: sem broker

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

-- ---------------------------------------------------------------------
-- TESTE 1: deal A (com broker) vira 'vendido' -- cria commission certa e
-- preenche deals.commission_rate/commission_value.
-- ---------------------------------------------------------------------

do $$
declare
  v_deal public.deals;
  v_commission public.commissions;
  v_commission_count int;
  v_expected_value numeric(14, 2) := 200000 * 0.0625; -- unit.list_price * broker.commission_rate
begin
  select * into v_deal from public.update_deal_stage(
    'b9888888-8888-8888-8888-888888888888'::uuid,
    'vendido'::deal_sales_stage,
    'Venda concluida'
  );

  if v_deal.commission_rate <> 0.0625 or v_deal.commission_value <> v_expected_value then
    raise exception 'FALHOU (1a): deal.commission_rate/commission_value errados (rate=%, value=%, esperado rate=0.0625, value=%)',
      v_deal.commission_rate, v_deal.commission_value, v_expected_value;
  end if;

  select count(*) into v_commission_count from public.commissions
    where deal_id = 'b9888888-8888-8888-8888-888888888888';
  if v_commission_count <> 1 then
    raise exception 'FALHOU (1b): esperava exatamente 1 commission criada, achou %', v_commission_count;
  end if;

  select * into v_commission from public.commissions
    where deal_id = 'b9888888-8888-8888-8888-888888888888';

  if v_commission.broker_id <> 'b9333333-3333-3333-3333-333333333333'
     or v_commission.unit_id <> 'b9444444-4444-4444-4444-444444444444'
     or v_commission.project_id <> 'b9222222-2222-2222-2222-222222222222'
     or v_commission.base_value <> v_expected_value
     or v_commission.gross_value <> v_expected_value
     or v_commission.rate <> 0.0625
     or v_commission.status <> 'a_pagar'
     or v_commission.due_date <> (current_date + 7)
  then
    raise exception 'FALHOU (1c): commission com campos errados (broker_id=%, unit_id=%, project_id=%, base_value=%, gross_value=%, rate=%, status=%, due_date=%)',
      v_commission.broker_id, v_commission.unit_id, v_commission.project_id, v_commission.base_value,
      v_commission.gross_value, v_commission.rate, v_commission.status, v_commission.due_date;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 2: deal B oscila 'vendido' -> 'reservado' -> 'vendido' de novo --
-- a segunda ida para 'vendido' NAO deve falhar por violar o indice unico
-- parcial commissions_tenant_id_deal_id_uidx nem criar uma segunda
-- commission ativa.
-- ---------------------------------------------------------------------

do $$
declare
  v_commission_count int;
begin
  -- Primeira venda.
  perform public.update_deal_stage(
    'b9999999-9999-9999-9999-999999999999'::uuid,
    'vendido'::deal_sales_stage,
    null
  );

  select count(*) into v_commission_count from public.commissions
    where deal_id = 'b9999999-9999-9999-9999-999999999999';
  if v_commission_count <> 1 then
    raise exception 'FALHOU (2a): esperava 1 commission apos a primeira venda, achou %', v_commission_count;
  end if;

  -- Volta para reservado (sai de vendido).
  perform public.update_deal_stage(
    'b9999999-9999-9999-9999-999999999999'::uuid,
    'reservado'::deal_sales_stage,
    null
  );

  -- Vende de novo -- reenvio da mesma transicao. Nao deve lancar excecao
  -- nem duplicar a commission.
  perform public.update_deal_stage(
    'b9999999-9999-9999-9999-999999999999'::uuid,
    'vendido'::deal_sales_stage,
    null
  );

  select count(*) into v_commission_count from public.commissions
    where deal_id = 'b9999999-9999-9999-9999-999999999999';
  if v_commission_count <> 1 then
    raise exception 'FALHOU (2b): esperava continuar com exatamente 1 commission apos oscilar o estagio e vender de novo, achou %', v_commission_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 3: deal C (SEM broker_id) vira 'vendido' normalmente -- sem criar
-- commission, sem erro. deals.commission_rate/commission_value ainda ficam
-- preenchidos (fallback 0.05, fiel ao original -- calculo independe de
-- broker_id).
-- ---------------------------------------------------------------------

do $$
declare
  v_deal public.deals;
  v_unit_status unit_status;
  v_commission_count int;
  v_expected_value numeric(14, 2) := 150000 * 0.05;
begin
  select * into v_deal from public.update_deal_stage(
    'b9aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'vendido'::deal_sales_stage,
    null
  );

  if v_deal.sales_stage <> 'vendido' or v_deal.is_active <> true or v_deal.sold_at is null then
    raise exception 'FALHOU (3a): deal sem broker deveria vender normalmente (sales_stage=%, is_active=%, sold_at=%)',
      v_deal.sales_stage, v_deal.is_active, v_deal.sold_at;
  end if;

  if v_deal.commission_rate <> 0.05 or v_deal.commission_value <> v_expected_value then
    raise exception 'FALHOU (3b): deal sem broker deveria cair no fallback 0.05 mesmo assim (rate=%, value=%, esperado value=%)',
      v_deal.commission_rate, v_deal.commission_value, v_expected_value;
  end if;

  select status into v_unit_status from public.units where id = 'b9666666-6666-6666-6666-666666666666';
  if v_unit_status <> 'vendida' then
    raise exception 'FALHOU (3c): unit do deal sem broker deveria virar vendida, esta %', v_unit_status;
  end if;

  select count(*) into v_commission_count from public.commissions
    where deal_id = 'b9aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_commission_count <> 0 then
    raise exception 'FALHOU (3d): deal sem broker_id NAO deveria criar nenhuma commission, achou %', v_commission_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE update_deal_stage/commissions PASSARAM (0028)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
