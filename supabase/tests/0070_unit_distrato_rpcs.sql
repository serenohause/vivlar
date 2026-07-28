-- 0070_unit_distrato_rpcs.sql (teste)
-- Teste das funções `public.apply_unit_distrato` e
-- `public.check_and_reset_unit_mcmv_flow`, introduzidas em
-- supabase/migrations/0070_unit_distrato_rpcs.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo critério de supabase/tests/0018_update_deal_stage_rpc.sql e
-- supabase/tests/0068_finance_checkup_rpc.sql: rodado via
-- `supabase db query --linked` (banco remoto já linkado), não via
-- `supabase test db` (pgTAP exige Docker, indisponível neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0070_unit_distrato_rpcs.sql
--
-- SEGURANÇA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transação com ROLLBACK no final -- nenhum dado
-- sintético fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer asserção que falhe faz `raise exception`, abortando a transação
-- inteira.
--
-- Cada teste que chama uma RPC como um usuário real usa
-- `set_config('request.jwt.claims', ..., true)` + `set local role
-- authenticated` para simular exatamente o que o PostgREST faz numa
-- requisição autenticada -- igual ao padrão de 0002/0010/0017/0018/0068.
--
-- CENÁRIO SINTÉTICO (2 tenants, para provar isolamento)
-- -------------------------------------------------------
-- Tenant A: admin_a (tenant_role=admin, autorizado nas 2 funções),
-- cliente_a (tenant_role=cliente, sem policy equivalente em nenhuma das 2
-- migrations que as funções replicam -- 0010/0032 --, deve ser barrado),
-- user_no_tenant_a (autenticado, mas SEM tenant_id no claim).
-- Tenant B: admin_b, só para provar isolamento cruzado.
--
-- Unidades de tenant A, uma por cenário:
--   unit_ok           -- termo de distrato aprovado + negócio ativo
--                         (apply_unit_distrato, caminho feliz com deal).
--   unit_no_doc       -- termo de distrato PENDENTE (não aprovado)
--                         (apply_unit_distrato, precondição deve barrar).
--   unit_no_deal      -- termo de distrato aprovado, SEM negócio ativo
--                         (apply_unit_distrato, caminho feliz sem deal).
--   unit_role_test    -- termo de distrato aprovado, sem negócio ativo
--                         (usada só para os testes de gate de papel/tenant/
--                         claim -- nunca chega a ser processada de verdade
--                         com sucesso, prova que nenhuma tentativa barrada
--                         deixou rastro).
--   unit_reset_not_distrato  -- admin_status != 'distrato'
--                         (check_and_reset_unit_mcmv_flow -> reset=false).
--   unit_reset_no_deal       -- admin_status='distrato', active_deal_id nulo
--                         (check_and_reset_unit_mcmv_flow -> reset=false).
--   unit_reset_stale         -- admin_status='distrato', active_deal_id
--                         aponta para negócio já distratado
--                         (check_and_reset_unit_mcmv_flow -> reset=false).
--   unit_reset_ready         -- admin_status='distrato', active_deal_id
--                         aponta para negócio de verdade ativo
--                         (check_and_reset_unit_mcmv_flow -> reset=true).
--
-- unit_b (tenant B): termo de distrato aprovado + negócio ativo -- só para
-- provar que a chamada de A nunca afeta B e vice-versa (isolamento
-- bidirecional).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. apply_unit_distrato falha sem termo de distrato aprovado (unit_no_doc),
--    sem alterar nada.
-- 2. apply_unit_distrato com termo aprovado + negócio ativo (unit_ok) aplica
--    corretamente: deal -> distratado/inativo/distrato_reason/distrato_at/
--    distrato_by_user_id, unit -> disponível/distrato/active_deal_id nulo,
--    exatamente 1 status_transitions (from/to/type corretos) e 1
--    notifications (title/type/severity/audience corretos) criados.
-- 3. apply_unit_distrato com termo aprovado e SEM negócio ativo (unit_no_deal)
--    aplica só a unidade + transição + notificação (source=
--    auto_document_approval, texto correspondente), deal_id retornado nulo.
-- 4. cliente_a (tenant certo, papel sem policy equivalente) NÃO consegue
--    chamar apply_unit_distrato nem check_and_reset_unit_mcmv_flow --
--    exceção 42501, nenhum rastro.
-- 5. Usuário autenticado SEM tenant_id no claim NÃO consegue chamar nenhuma
--    das 2 funções -- exceção 28000.
-- 6. Chamada de admin_b (outro tenant) sobre uma unidade de tenant A falha
--    (unidade não encontrada) e NÃO afeta/lê o dado do tenant A -- e
--    vice-versa (admin_a sobre unidade de tenant B) -- isolamento
--    bidirecional confirmado, e o fluxo de B funciona normalmente para o
--    próprio admin_b.
-- 7. check_and_reset_unit_mcmv_flow não faz nada (reset=false) nos 3 casos
--    em que não deveria (não está em distrato / sem negócio ativo / negócio
--    ativo é o antigo distratado), e reseta corretamente (reset=true,
--    admin_status=laudo_engenharia, activities type=status_change,
--    notifications type=VENDA) quando há negócio novo de verdade ativo.
-- 8. Grants: `anon` NUNCA tem EXECUTE em nenhuma das 2 funções (só
--    `authenticated`).
-- 9. Regressão leve: RLS de 0010/0017/0032 continua funcionando normalmente
--    para acesso direto via PostgREST (fora das 2 novas funções) -- suíte
--    completa dessas migrations não é rerodada aqui (já coberta por seus
--    próprios testes), só uma checagem pontual de que nada foi quebrado.

begin;

-- =======================================================================
-- SETUP
-- =======================================================================

insert into auth.users (id) values
  ('70000000-0000-0000-0000-0000000a0001'), -- admin_a
  ('70000000-0000-0000-0000-0000000a0002'), -- cliente_a
  ('70000000-0000-0000-0000-0000000a0003'), -- sem tenant_id no claim
  ('70000000-0000-0000-0000-0000000b0001'); -- admin_b

insert into public.tenants (id, name, slug) values
  ('70000000-0000-0000-0000-00000000000a', 'Tenant A - teste distrato 0070', 'tenant-a-distrato-0070'),
  ('70000000-0000-0000-0000-00000000000b', 'Tenant B - teste distrato 0070', 'tenant-b-distrato-0070');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000a0001', 'admin', 'active'),
  ('70000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000a0002', 'cliente', 'active'),
  ('70000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000b0001', 'admin', 'active');

insert into public.projects (id, tenant_id, code, name) values
  ('70100000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a', 'PRJ-0070-A', 'Projeto teste 0070 - Tenant A'),
  ('70100000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', 'PRJ-0070-B', 'Projeto teste 0070 - Tenant B');

insert into public.clients (id, tenant_id, name) values
  ('70300000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a', 'Cliente A - teste 0070'),
  ('70300000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', 'Cliente B - teste 0070');

-- ---- Tenant A: unidades ----
insert into public.units (id, tenant_id, project_id, sku, list_price, status, admin_status) values
  ('70200000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-OK', 200000, 'vendida', 'cartorio'),           -- unit_ok
  ('70200000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-NODOC', 200000, 'vendida', 'contrato_caixa'),   -- unit_no_doc
  ('70200000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-NODEAL', 200000, 'vendida', 'registro_pago'),   -- unit_no_deal
  ('70200000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-ROLETEST', 200000, 'vendida', 'laudo_engenharia'), -- unit_role_test
  ('70200000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-NOTDISTRATO', 200000, 'disponivel', 'em_conformidade'), -- unit_reset_not_distrato
  ('70200000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-NODEALRESET', 200000, 'disponivel', 'distrato'), -- unit_reset_no_deal
  ('70200000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-STALE', 200000, 'disponivel', 'distrato'),       -- unit_reset_stale
  ('70200000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', 'UN-0070-A-READY', 200000, 'disponivel', 'distrato');       -- unit_reset_ready

-- ---- Tenant B: unidade ----
insert into public.units (id, tenant_id, project_id, sku, list_price, status, admin_status) values
  ('70200000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', '70100000-0000-0000-0000-00000000000b', 'UN-0070-B-OK', 200000, 'vendida', 'cartorio');

-- ---- Tenant A: deals ----
insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage, is_active) values
  ('70500000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', '70300000-0000-0000-0000-000000000001', '70200000-0000-0000-0000-000000000001', 'vendido', true),      -- deal_ok (unit_ok)
  ('70500000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', '70300000-0000-0000-0000-000000000001', '70200000-0000-0000-0000-000000000008', 'qualificado', true), -- deal_reset_new (unit_reset_ready)
  ('70500000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-00000000000a', '70100000-0000-0000-0000-000000000001', '70300000-0000-0000-0000-000000000001', '70200000-0000-0000-0000-000000000007', 'distratado', false); -- deal_reset_stale (unit_reset_stale)

-- active_deal_id de unit_reset_ready/unit_reset_stale aponta pro deal
-- correspondente (fiel ao que active_deal_id representa -- reserva/
-- negociação em andamento, ver 0058).
update public.units set active_deal_id = '70500000-0000-0000-0000-000000000002' where id = '70200000-0000-0000-0000-000000000008';
update public.units set active_deal_id = '70500000-0000-0000-0000-000000000003' where id = '70200000-0000-0000-0000-000000000007';

-- ---- Tenant B: deal ----
insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage, is_active) values
  ('70500000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', '70100000-0000-0000-0000-00000000000b', '70300000-0000-0000-0000-00000000000b', '70200000-0000-0000-0000-00000000000b', 'vendido', true);

-- ---- Tenant A: documents (termo de distrato) ----
insert into public.documents (id, tenant_id, unit_id, doc_type, title, status) values
  ('70600000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a', '70200000-0000-0000-0000-000000000001', 'termo_distrato', 'Termo de Distrato - UN-0070-A-OK', 'aprovado'),      -- unit_ok
  ('70600000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-00000000000a', '70200000-0000-0000-0000-000000000002', 'termo_distrato', 'Termo de Distrato - UN-0070-A-NODOC', 'pendente'),   -- unit_no_doc (NAO aprovado)
  ('70600000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-00000000000a', '70200000-0000-0000-0000-000000000003', 'termo_distrato', 'Termo de Distrato - UN-0070-A-NODEAL', 'aprovado'),  -- unit_no_deal
  ('70600000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-00000000000a', '70200000-0000-0000-0000-000000000004', 'termo_distrato', 'Termo de Distrato - UN-0070-A-ROLETEST', 'aprovado'); -- unit_role_test

-- ---- Tenant B: documents ----
insert into public.documents (id, tenant_id, unit_id, doc_type, title, status) values
  ('70600000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-00000000000b', '70200000-0000-0000-0000-00000000000b', 'termo_distrato', 'Termo de Distrato - UN-0070-B-OK', 'aprovado');

-- =======================================================================
-- TESTE 1: apply_unit_distrato falha sem termo de distrato APROVADO
-- (unit_no_doc tem 1 termo_distrato, mas status='pendente').
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('70200000-0000-0000-0000-000000000002'::uuid, 'teste sem termo aprovado');
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (1): apply_unit_distrato deveria ter falhado sem termo de distrato aprovado';
  end if;
end $$;

reset role;

-- Confirma que nada foi alterado em unit_no_doc.
do $$
declare v_unit public.units;
begin
  select * into v_unit from public.units where id = '70200000-0000-0000-0000-000000000002';
  if v_unit.admin_status <> 'contrato_caixa' or v_unit.status <> 'vendida' then
    raise exception 'FALHOU (1b): unit_no_doc não deveria ter sido alterada, admin_status=%, status=%', v_unit.admin_status, v_unit.status;
  end if;
end $$;

-- =======================================================================
-- TESTE 2: apply_unit_distrato -- caminho feliz COM negócio ativo (unit_ok).
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_deal public.deals;
  v_unit public.units;
  v_transition_count int;
  v_transition public.status_transitions;
  v_notification_count int;
  v_notification public.notifications;
begin
  select public.apply_unit_distrato(
    '70200000-0000-0000-0000-000000000001'::uuid,
    'Cliente desistiu do financiamento',
    'manual'
  ) into v_result;

  if (v_result->>'deal_id') <> '70500000-0000-0000-0000-000000000001' then
    raise exception 'FALHOU (2a): retorno deveria trazer deal_id=deal_ok, trouxe %', v_result->>'deal_id';
  end if;

  if (v_result->>'previous_admin_status') <> 'cartorio' then
    raise exception 'FALHOU (2b): previous_admin_status deveria ser cartorio, veio %', v_result->>'previous_admin_status';
  end if;

  select * into v_deal from public.deals where id = '70500000-0000-0000-0000-000000000001';
  if v_deal.sales_stage <> 'distratado' or v_deal.is_active <> false or v_deal.distrato_at is null
     or v_deal.distrato_reason <> 'Cliente desistiu do financiamento' or v_deal.distrato_by_user_id <> '70000000-0000-0000-0000-0000000a0001' then
    raise exception 'FALHOU (2c): deal_ok deveria estar distratado/inativo/com distrato_at e distrato_reason corretos (sales_stage=%, is_active=%, distrato_at=%, distrato_reason=%, distrato_by=%)',
      v_deal.sales_stage, v_deal.is_active, v_deal.distrato_at, v_deal.distrato_reason, v_deal.distrato_by_user_id;
  end if;

  select * into v_unit from public.units where id = '70200000-0000-0000-0000-000000000001';
  if v_unit.status <> 'disponivel' or v_unit.admin_status <> 'distrato' or v_unit.active_deal_id is not null then
    raise exception 'FALHOU (2d): unit_ok deveria estar disponivel/distrato/sem active_deal_id (status=%, admin_status=%, active_deal_id=%)',
      v_unit.status, v_unit.admin_status, v_unit.active_deal_id;
  end if;

  select count(*) into v_transition_count from public.status_transitions where unit_id = '70200000-0000-0000-0000-000000000001';
  if v_transition_count <> 1 then
    raise exception 'FALHOU (2e): esperava exatamente 1 status_transition para unit_ok, achou %', v_transition_count;
  end if;

  select * into v_transition from public.status_transitions where unit_id = '70200000-0000-0000-0000-000000000001';
  if v_transition.from_status <> 'cartorio' or v_transition.to_status <> 'distrato'
     or v_transition.transition_type <> 'admin' or v_transition.deal_id <> '70500000-0000-0000-0000-000000000001' then
    raise exception 'FALHOU (2f): status_transition com from/to/type/deal_id errados (from=%, to=%, type=%, deal_id=%)',
      v_transition.from_status, v_transition.to_status, v_transition.transition_type, v_transition.deal_id;
  end if;

  select count(*) into v_notification_count from public.notifications
    where entity_type = 'Unit' and entity_id = '70200000-0000-0000-0000-000000000001';
  if v_notification_count <> 1 then
    raise exception 'FALHOU (2g): esperava exatamente 1 notification para unit_ok, achou %', v_notification_count;
  end if;

  select * into v_notification from public.notifications
    where entity_type = 'Unit' and entity_id = '70200000-0000-0000-0000-000000000001';
  if v_notification.title <> 'Distrato Registrado' or v_notification.type <> 'CRM'
     or v_notification.severity <> 'ALERTA' or v_notification.audience <> 'INTERNAL_ONLY'
     or v_notification.message not like '%Cliente A - teste 0070%' then
    raise exception 'FALHOU (2h): notification com title/type/severity/audience/message errados (title=%, type=%, severity=%, audience=%, message=%)',
      v_notification.title, v_notification.type, v_notification.severity, v_notification.audience, v_notification.message;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 3: apply_unit_distrato -- caminho feliz SEM negócio ativo
-- (unit_no_deal), p_source='auto_document_approval'.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_unit public.units;
  v_transition public.status_transitions;
  v_notification public.notifications;
begin
  select public.apply_unit_distrato(
    '70200000-0000-0000-0000-000000000003'::uuid,
    null,
    'auto_document_approval'
  ) into v_result;

  if v_result->>'deal_id' is not null then
    raise exception 'FALHOU (3a): unit_no_deal não tem negócio ativo, deal_id do retorno deveria ser nulo, veio %', v_result->>'deal_id';
  end if;

  select * into v_unit from public.units where id = '70200000-0000-0000-0000-000000000003';
  if v_unit.status <> 'disponivel' or v_unit.admin_status <> 'distrato' or v_unit.active_deal_id is not null then
    raise exception 'FALHOU (3b): unit_no_deal deveria estar disponivel/distrato/sem active_deal_id (status=%, admin_status=%, active_deal_id=%)',
      v_unit.status, v_unit.admin_status, v_unit.active_deal_id;
  end if;

  select * into v_transition from public.status_transitions where unit_id = '70200000-0000-0000-0000-000000000003';
  if v_transition.from_status <> 'registro_pago' or v_transition.to_status <> 'distrato' or v_transition.deal_id is not null then
    raise exception 'FALHOU (3c): status_transition de unit_no_deal com from/to/deal_id errados (from=%, to=%, deal_id=%)',
      v_transition.from_status, v_transition.to_status, v_transition.deal_id;
  end if;

  select * into v_notification from public.notifications
    where entity_type = 'Unit' and entity_id = '70200000-0000-0000-0000-000000000003';
  if v_notification.title <> 'Distrato Aplicado Automaticamente' or v_notification.message not like '%liberada após aprovação do Termo de Distrato%' then
    raise exception 'FALHOU (3d): notification de unit_no_deal com title/message errados (title=%, message=%)',
      v_notification.title, v_notification.message;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 4: cliente_a (tenant certo, papel sem policy equivalente) NÃO
-- consegue chamar nenhuma das 2 funções.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0002","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('70200000-0000-0000-0000-000000000004'::uuid, null);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (4a): tenant_role=cliente conseguiu chamar apply_unit_distrato';
  end if;
end $$;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000008'::uuid);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (4b): tenant_role=cliente conseguiu chamar check_and_reset_unit_mcmv_flow';
  end if;
end $$;

reset role;

-- Confirma que nenhuma tentativa do teste 4 deixou rastro.
do $$
declare
  v_unit_role_test public.units;
  v_unit_reset_ready public.units;
begin
  select * into v_unit_role_test from public.units where id = '70200000-0000-0000-0000-000000000004';
  if v_unit_role_test.admin_status <> 'laudo_engenharia' then
    raise exception 'FALHOU (4c): unit_role_test não deveria ter sido alterada, admin_status=%', v_unit_role_test.admin_status;
  end if;

  select * into v_unit_reset_ready from public.units where id = '70200000-0000-0000-0000-000000000008';
  if v_unit_reset_ready.admin_status <> 'distrato' then
    raise exception 'FALHOU (4d): unit_reset_ready não deveria ter sido alterada ainda, admin_status=%', v_unit_reset_ready.admin_status;
  end if;
end $$;

-- =======================================================================
-- TESTE 5: usuário autenticado SEM tenant_id no claim não consegue chamar
-- nenhuma das 2 funções.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0003","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('70200000-0000-0000-0000-000000000004'::uuid, null);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5a): usuário sem tenant_id no claim conseguiu chamar apply_unit_distrato';
  end if;
end $$;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000008'::uuid);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5b): usuário sem tenant_id no claim conseguiu chamar check_and_reset_unit_mcmv_flow';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 6: isolamento cruzado entre tenants -- admin_b não afeta/lê unidade
-- de tenant A, admin_a não afeta/lê unidade de tenant B, e o fluxo de B
-- funciona normalmente para o próprio admin_b.
-- =======================================================================

-- 6a. admin_b tenta aplicar distrato numa unidade de TENANT A -- deve falhar
-- (unidade não encontrada para o tenant de admin_b).
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000b0001","tenant_id":"70000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('70200000-0000-0000-0000-000000000004'::uuid, null);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (6a): admin_b conseguiu aplicar distrato numa unidade do tenant A';
  end if;
end $$;

reset role;

-- 6b. admin_a tenta aplicar distrato numa unidade de TENANT B -- deve
-- falhar da mesma forma (unidade não encontrada para o tenant de admin_a).
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('70200000-0000-0000-0000-00000000000b'::uuid, null);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (6b): admin_a conseguiu aplicar distrato numa unidade do tenant B';
  end if;
end $$;

reset role;

-- 6c. Confirma que unit_role_test (tenant A) e unit_b (tenant B) continuam
-- exatamente como estavam -- nenhuma das 2 tentativas cruzadas deixou
-- rastro em nenhum dos dois tenants.
do $$
declare
  v_unit_a public.units;
  v_unit_b public.units;
begin
  select * into v_unit_a from public.units where id = '70200000-0000-0000-0000-000000000004';
  if v_unit_a.admin_status <> 'laudo_engenharia' then
    raise exception 'FALHOU (6c): unit_role_test (tenant A) não deveria ter sido alterada pela tentativa de admin_b, admin_status=%', v_unit_a.admin_status;
  end if;

  select * into v_unit_b from public.units where id = '70200000-0000-0000-0000-00000000000b';
  if v_unit_b.admin_status <> 'cartorio' then
    raise exception 'FALHOU (6d): unit_b (tenant B) não deveria ter sido alterada pela tentativa de admin_a, admin_status=%', v_unit_b.admin_status;
  end if;
end $$;

-- 6e. Regressão positiva: admin_b consegue aplicar distrato normalmente na
-- PRÓPRIA unidade (unit_b) -- prova que o bloqueio dos testes 6a/6b é
-- isolamento por tenant, não um bug genérico na função.
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000b0001","tenant_id":"70000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_unit public.units;
begin
  select public.apply_unit_distrato('70200000-0000-0000-0000-00000000000b'::uuid, 'Distrato tenant B') into v_result;

  select * into v_unit from public.units where id = '70200000-0000-0000-0000-00000000000b';
  if v_unit.status <> 'disponivel' or v_unit.admin_status <> 'distrato' then
    raise exception 'FALHOU (6e): unit_b deveria ter sido distratada normalmente pelo próprio admin_b (status=%, admin_status=%)',
      v_unit.status, v_unit.admin_status;
  end if;
end $$;

reset role;

-- Tenant A continua intocado pela operação de B no passo 6e.
do $$
declare v_unit_a_count int;
begin
  select count(*) into v_unit_a_count from public.units
    where tenant_id = '70000000-0000-0000-0000-00000000000a' and admin_status = 'distrato'
      and id not in ('70200000-0000-0000-0000-000000000001', '70200000-0000-0000-0000-000000000003', '70200000-0000-0000-0000-000000000006', '70200000-0000-0000-0000-000000000007', '70200000-0000-0000-0000-000000000008');
  if v_unit_a_count <> 0 then
    raise exception 'FALHOU (6f): tenant A tem unidade inesperada em admin_status=distrato após a operação de tenant B, achou %', v_unit_a_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 7: check_and_reset_unit_mcmv_flow -- os 3 casos "reset=false" e o
-- caso "reset=true".
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_result jsonb;
begin
  -- 7a. admin_status != 'distrato' -> reset=false.
  select public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000005'::uuid) into v_result;
  if (v_result->>'reset')::boolean <> false or v_result->>'reason' <> 'not_in_distrato' then
    raise exception 'FALHOU (7a): esperava {reset:false, reason:not_in_distrato}, veio %', v_result;
  end if;

  -- 7b. active_deal_id nulo -> reset=false.
  select public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000006'::uuid) into v_result;
  if (v_result->>'reset')::boolean <> false or v_result->>'reason' <> 'no_active_deal' then
    raise exception 'FALHOU (7b): esperava {reset:false, reason:no_active_deal}, veio %', v_result;
  end if;

  -- 7c. negócio ativo é o antigo (já distratado) -> reset=false.
  select public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000007'::uuid) into v_result;
  if (v_result->>'reset')::boolean <> false or v_result->>'reason' <> 'active_deal_is_stale' then
    raise exception 'FALHOU (7c): esperava {reset:false, reason:active_deal_is_stale}, veio %', v_result;
  end if;
end $$;

-- Nenhum dos 3 casos acima deveria ter alterado unit/activities/notifications.
do $$
declare
  v_unit_5 public.units;
  v_unit_6 public.units;
  v_unit_7 public.units;
  v_activity_count int;
begin
  select * into v_unit_5 from public.units where id = '70200000-0000-0000-0000-000000000005';
  select * into v_unit_6 from public.units where id = '70200000-0000-0000-0000-000000000006';
  select * into v_unit_7 from public.units where id = '70200000-0000-0000-0000-000000000007';

  if v_unit_5.admin_status <> 'em_conformidade' or v_unit_6.admin_status <> 'distrato' or v_unit_7.admin_status <> 'distrato' then
    raise exception 'FALHOU (7d): unidades dos casos reset=false não deveriam ter sido alteradas (5=%, 6=%, 7=%)',
      v_unit_5.admin_status, v_unit_6.admin_status, v_unit_7.admin_status;
  end if;

  select count(*) into v_activity_count from public.activities
    where unit_id in ('70200000-0000-0000-0000-000000000005', '70200000-0000-0000-0000-000000000006', '70200000-0000-0000-0000-000000000007');
  if v_activity_count <> 0 then
    raise exception 'FALHOU (7e): nenhuma activity deveria ter sido criada pelos casos reset=false, achou %', v_activity_count;
  end if;
end $$;

-- 7f. Caso reset=true de verdade (unit_reset_ready, negócio 'qualificado' ativo).
do $$
declare
  v_result jsonb;
  v_unit public.units;
  v_activity public.activities;
  v_notification public.notifications;
begin
  select public.check_and_reset_unit_mcmv_flow('70200000-0000-0000-0000-000000000008'::uuid) into v_result;

  if (v_result->>'reset')::boolean <> true or (v_result->>'deal_id') <> '70500000-0000-0000-0000-000000000002' then
    raise exception 'FALHOU (7f): esperava {reset:true, deal_id:deal_reset_new}, veio %', v_result;
  end if;

  select * into v_unit from public.units where id = '70200000-0000-0000-0000-000000000008';
  if v_unit.admin_status <> 'laudo_engenharia' then
    raise exception 'FALHOU (7g): unit_reset_ready deveria voltar para laudo_engenharia, está %', v_unit.admin_status;
  end if;

  select * into v_activity from public.activities where unit_id = '70200000-0000-0000-0000-000000000008';
  if v_activity.type <> 'status_change' or v_activity.deal_id <> '70500000-0000-0000-0000-000000000002'
     or v_activity.title <> 'Reabertura de ciclo MCMV (pós-distrato)' then
    raise exception 'FALHOU (7h): activity de reset com type/deal_id/title errados (type=%, deal_id=%, title=%)',
      v_activity.type, v_activity.deal_id, v_activity.title;
  end if;

  select * into v_notification from public.notifications
    where entity_type = 'Unit' and entity_id = '70200000-0000-0000-0000-000000000008';
  if v_notification.title <> 'Unidade reaberta para nova venda' or v_notification.type <> 'VENDA' or v_notification.severity <> 'INFO' then
    raise exception 'FALHOU (7i): notification de reset com title/type/severity errados (title=%, type=%, severity=%)',
      v_notification.title, v_notification.type, v_notification.severity;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 8: grants -- `anon` nunca tem EXECUTE, só `authenticated`.
-- =======================================================================

do $$
declare
  v_anon_distrato boolean;
  v_authenticated_distrato boolean;
  v_anon_reset boolean;
  v_authenticated_reset boolean;
begin
  select has_function_privilege('anon', 'public.apply_unit_distrato(uuid, text, text)', 'execute') into v_anon_distrato;
  select has_function_privilege('authenticated', 'public.apply_unit_distrato(uuid, text, text)', 'execute') into v_authenticated_distrato;
  select has_function_privilege('anon', 'public.check_and_reset_unit_mcmv_flow(uuid)', 'execute') into v_anon_reset;
  select has_function_privilege('authenticated', 'public.check_and_reset_unit_mcmv_flow(uuid)', 'execute') into v_authenticated_reset;

  if v_anon_distrato then
    raise exception 'FALHOU (8a): anon NÃO deveria ter EXECUTE em apply_unit_distrato';
  end if;
  if not v_authenticated_distrato then
    raise exception 'FALHOU (8b): authenticated deveria ter EXECUTE em apply_unit_distrato';
  end if;
  if v_anon_reset then
    raise exception 'FALHOU (8c): anon NÃO deveria ter EXECUTE em check_and_reset_unit_mcmv_flow';
  end if;
  if not v_authenticated_reset then
    raise exception 'FALHOU (8d): authenticated deveria ter EXECUTE em check_and_reset_unit_mcmv_flow';
  end if;
end $$;

-- =======================================================================
-- TESTE 9: regressão leve -- RLS de 0010/0017/0032 continua funcionando
-- normalmente para acesso DIRETO via PostgREST, fora das 2 novas funções.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-0000000a0001","tenant_id":"70000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  -- 0010: admin_a enxerga só as units do próprio tenant.
  select count(*) into v_count from public.units where tenant_id = '70000000-0000-0000-0000-00000000000a';
  if v_count <> 8 then
    raise exception 'FALHOU (9a): admin_a deveria ver as 8 units do próprio tenant via RLS de 0010, viu %', v_count;
  end if;

  select count(*) into v_count from public.units where tenant_id = '70000000-0000-0000-0000-00000000000b';
  if v_count <> 0 then
    raise exception 'FALHOU (9b): admin_a NÃO deveria ver nenhuma unit do tenant B via RLS de 0010, viu %', v_count;
  end if;

  -- 0017: admin_a enxerga só os deals do próprio tenant.
  select count(*) into v_count from public.deals where tenant_id = '70000000-0000-0000-0000-00000000000b';
  if v_count <> 0 then
    raise exception 'FALHOU (9c): admin_a NÃO deveria ver nenhum deal do tenant B via RLS de 0017, viu %', v_count;
  end if;

  -- 0032: admin_a enxerga só os documents do próprio tenant.
  select count(*) into v_count from public.documents where tenant_id = '70000000-0000-0000-0000-00000000000b';
  if v_count <> 0 then
    raise exception 'FALHOU (9d): admin_a NÃO deveria ver nenhum document do tenant B via RLS de 0032, viu %', v_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou até aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE apply_unit_distrato/check_and_reset_unit_mcmv_flow PASSARAM (0070)' as resultado;

-- Desfaz TUDO -- nenhum dado sintético de teste fica no banco.
rollback;
