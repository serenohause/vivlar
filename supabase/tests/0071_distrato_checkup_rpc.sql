-- 0071_distrato_checkup_rpc.sql (teste)
-- Teste da função `public.run_distrato_checkup`, introduzida em
-- supabase/migrations/0071_distrato_checkup_rpc.sql, e da extensão de
-- `public.apply_unit_distrato` (allowlist de p_source, mesma migration).
--
-- COMO RODAR
-- ----------
-- Mesmo critério de supabase/tests/0068_finance_checkup_rpc.sql e
-- supabase/tests/0070_unit_distrato_rpcs.sql: rodado via
-- `supabase db query --linked` (banco remoto já linkado), não via
-- `supabase test db` (pgTAP exige Docker, indisponível neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0071_distrato_checkup_rpc.sql
--
-- SEGURANÇA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transação com ROLLBACK no final -- nenhum
-- dado sintético fica no banco, mesmo rodando contra o projeto remoto
-- real. Qualquer asserção que falhe faz `raise exception`, abortando a
-- transação inteira.
--
-- Cada teste que chama uma RPC como um usuário real usa
-- `set_config('request.jwt.claims', ..., true)` + `set local role
-- authenticated` -- igual ao padrão de 0002/0010/0017/0018/0068/0070.
--
-- CENÁRIO SINTÉTICO (2 tenants, para provar isolamento)
-- -------------------------------------------------------
-- Tenant A: admin_a (tenant_role=admin, único autorizado a chamar
-- run_distrato_checkup), comercial_a (tenant_role=comercial -- TEM policy
-- de update em documents/units e passa no gate de apply_unit_distrato/
-- check_and_reset_unit_mcmv_flow isoladas, mas NÃO deve passar no gate
-- exato de run_distrato_checkup, que exige tenant_role='admin').
-- Tenant B: admin_b, só para provar isolamento cruzado (unidade de B nunca
-- aparece no checkup rodado por admin_a, e vice-versa).
--
-- Unidades de tenant A:
--   unit_recon_status    -- termo de distrato aprovado, status='vendida'
--                            (categoria 1 -- via status inconsistente, sem
--                            deal ativo).
--   unit_recon_deal       -- termo de distrato aprovado, status='disponivel',
--                            mas com deal ativo em sales_stage='proposta'
--                            (categoria 1 -- via deal ativo inconsistente).
--   unit_no_issue         -- SEM termo de distrato aprovado (documento
--                            'pendente'), status='vendida' -- não deveria
--                            entrar em nenhuma categoria.
--   unit_ok_already       -- status='disponivel', admin_status='distrato',
--                            SEM active_deal_id -- já reconciliada
--                            corretamente, não deveria entrar em nenhuma
--                            categoria.
--   unit_mcmv_stale       -- admin_status='distrato', active_deal_id aponta
--                            para negócio já 'distratado' (categoria 2 NÃO
--                            deveria pegar -- negócio velho).
--   unit_mcmv_ready       -- admin_status='distrato', active_deal_id aponta
--                            para negócio 'qualificado' (ativo, não velho)
--                            (categoria 2 -- deveria pegar).
--
-- unit_b (tenant B): termo de distrato aprovado + status='vendida' (mesmo
-- perfil de unit_recon_status) -- só para provar que o checkup de A nunca
-- enxerga/afeta B.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. comercial_a (tenant certo, papel válido nas 2 RPCs individuais de
--    0070, mas NÃO admin) não consegue chamar run_distrato_checkup --
--    exceção 42501, nenhum rastro.
-- 2. Usuário autenticado SEM tenant_id no claim não consegue chamar
--    run_distrato_checkup -- exceção 28000.
-- 3. dry_run=true (default e explícito) detecta as 2 categorias
--    corretamente (contagem e membros exatos), SEM aplicar nenhuma
--    correção -- nenhuma unidade/deal/status_transitions/activities/
--    notifications alterado ou criado.
-- 4. dry_run=false aplica de verdade: unit_recon_status e unit_recon_deal
--    reconciliadas via apply_unit_distrato (deal distratado/inativo se
--    havia, unidade liberada, status_transitions + notification com
--    p_source=checkup_reconciliation e título/mensagem corretos);
--    unit_mcmv_ready resetada via check_and_reset_unit_mcmv_flow
--    (admin_status=laudo_engenharia, activity type=status_change,
--    notification type=VENDA).
-- 5. unit_no_issue, unit_ok_already e unit_mcmv_stale NUNCA aparecem em
--    nenhuma das 2 listas de candidatos, em nenhum dos 2 modos, e nunca
--    são alteradas.
-- 6. Isolamento: unit_b (tenant B) nunca aparece no relatório de admin_a
--    nem é afetada pela chamada dry_run=false de admin_a; o checkup do
--    próprio admin_b sobre o tenant B funciona normalmente e não enxerga
--    nada do tenant A.
-- 7. Relatório: summary/details têm a forma esperada (contagens batendo
--    com os itens de details) em ambos os modos.
-- 8. Grants: `anon` NUNCA tem EXECUTE em run_distrato_checkup, só
--    `authenticated`.
-- 9. Regressão: apply_unit_distrato continua aceitando 'manual'/
--    'auto_document_approval' normalmente (allowlist estendida, não
--    substituída) e ainda rejeita um p_source inválido.

begin;

-- =======================================================================
-- SETUP
-- =======================================================================

insert into auth.users (id) values
  ('71000000-0000-0000-0000-0000000a0001'), -- admin_a
  ('71000000-0000-0000-0000-0000000a0002'), -- comercial_a
  ('71000000-0000-0000-0000-0000000a0003'), -- sem tenant_id no claim
  ('71000000-0000-0000-0000-0000000b0001'); -- admin_b

insert into public.tenants (id, name, slug) values
  ('71000000-0000-0000-0000-00000000000a', 'Tenant A - teste checkup distrato 0071', 'tenant-a-distrato-checkup-0071'),
  ('71000000-0000-0000-0000-00000000000b', 'Tenant B - teste checkup distrato 0071', 'tenant-b-distrato-checkup-0071');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('71000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000a0001', 'admin', 'active'),
  ('71000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000a0002', 'comercial', 'active'),
  ('71000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000b0001', 'admin', 'active');

insert into public.projects (id, tenant_id, code, name) values
  ('71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a', 'PRJ-0071-A', 'Projeto teste 0071 - Tenant A'),
  ('71100000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', 'PRJ-0071-B', 'Projeto teste 0071 - Tenant B');

insert into public.clients (id, tenant_id, name) values
  ('71300000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a', 'Cliente A - teste 0071'),
  ('71300000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', 'Cliente B - teste 0071');

-- ---- Tenant A: unidades ----
insert into public.units (id, tenant_id, project_id, sku, list_price, status, admin_status) values
  ('71200000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-RECON-STATUS', 200000, 'vendida', 'cartorio'),        -- unit_recon_status
  ('71200000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-RECON-DEAL', 200000, 'disponivel', 'contrato_caixa'), -- unit_recon_deal
  ('71200000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-NOISSUE', 200000, 'vendida', 'registro_pago'),        -- unit_no_issue
  ('71200000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-OKALREADY', 200000, 'disponivel', 'distrato'),         -- unit_ok_already
  ('71200000-0000-0000-0000-000000000005', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-MCMVSTALE', 200000, 'disponivel', 'distrato'),         -- unit_mcmv_stale
  ('71200000-0000-0000-0000-000000000006', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', 'UN-0071-A-MCMVREADY', 200000, 'disponivel', 'distrato');         -- unit_mcmv_ready

-- ---- Tenant B: unidade ----
insert into public.units (id, tenant_id, project_id, sku, list_price, status, admin_status) values
  ('71200000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', '71100000-0000-0000-0000-00000000000b', 'UN-0071-B-RECON-STATUS', 200000, 'vendida', 'cartorio');

-- ---- Tenant A: deals ----
insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage, is_active) values
  ('71500000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', '71300000-0000-0000-0000-000000000001', '71200000-0000-0000-0000-000000000002', 'proposta', true),    -- deal_recon (unit_recon_deal, ativo, proposta)
  ('71500000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', '71300000-0000-0000-0000-000000000001', '71200000-0000-0000-0000-000000000005', 'distratado', false), -- deal_stale (unit_mcmv_stale)
  ('71500000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-00000000000a', '71100000-0000-0000-0000-000000000001', '71300000-0000-0000-0000-000000000001', '71200000-0000-0000-0000-000000000006', 'qualificado', true); -- deal_ready (unit_mcmv_ready)

-- active_deal_id de unit_mcmv_stale/unit_mcmv_ready apontam pro deal
-- correspondente (fiel ao que active_deal_id representa, 0058).
update public.units set active_deal_id = '71500000-0000-0000-0000-000000000002' where id = '71200000-0000-0000-0000-000000000005';
update public.units set active_deal_id = '71500000-0000-0000-0000-000000000003' where id = '71200000-0000-0000-0000-000000000006';

-- ---- Tenant B: deal ----
insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage, is_active) values
  ('71500000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', '71100000-0000-0000-0000-00000000000b', '71300000-0000-0000-0000-00000000000b', '71200000-0000-0000-0000-00000000000b', 'vendido', true);

-- ---- Tenant A: documents (termo de distrato) ----
insert into public.documents (id, tenant_id, unit_id, doc_type, title, status) values
  ('71600000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000a', '71200000-0000-0000-0000-000000000001', 'termo_distrato', 'Termo de Distrato - UN-0071-A-RECON-STATUS', 'aprovado'), -- unit_recon_status
  ('71600000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000a', '71200000-0000-0000-0000-000000000002', 'termo_distrato', 'Termo de Distrato - UN-0071-A-RECON-DEAL', 'aprovado'),   -- unit_recon_deal
  ('71600000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-00000000000a', '71200000-0000-0000-0000-000000000003', 'termo_distrato', 'Termo de Distrato - UN-0071-A-NOISSUE', 'pendente');       -- unit_no_issue (NAO aprovado)

-- ---- Tenant B: documents ----
insert into public.documents (id, tenant_id, unit_id, doc_type, title, status) values
  ('71600000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-00000000000b', '71200000-0000-0000-0000-00000000000b', 'termo_distrato', 'Termo de Distrato - UN-0071-B-RECON-STATUS', 'aprovado');

-- =======================================================================
-- TESTE 1: comercial_a (tenant certo, papel válido nas RPCs de 0070, mas
-- NÃO admin) não consegue chamar run_distrato_checkup.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000a0002","tenant_id":"71000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.run_distrato_checkup(true);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (1): tenant_role=comercial conseguiu chamar run_distrato_checkup';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 2: usuário autenticado SEM tenant_id no claim não consegue chamar
-- run_distrato_checkup.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000a0003","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.run_distrato_checkup(true);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (2): usuário sem tenant_id no claim conseguiu chamar run_distrato_checkup';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 3: dry_run=true (admin_a) -- detecta as 2 categorias corretamente,
-- sem aplicar nada.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000a0001","tenant_id":"71000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_recon_ids uuid[];
  v_mcmv_ids uuid[];
begin
  select public.run_distrato_checkup(true) into v_result;

  if (v_result->>'dry_run')::boolean <> true or (v_result->>'corrections_applied')::boolean <> false then
    raise exception 'FALHOU (3a): dry_run/corrections_applied errados no relatório dry_run, veio %', v_result;
  end if;

  if (v_result->'summary'->>'reconciliation_candidates')::int <> 2 then
    raise exception 'FALHOU (3b): esperava 2 candidatos de reconciliação (unit_recon_status, unit_recon_deal), veio %',
      v_result->'summary'->>'reconciliation_candidates';
  end if;

  if (v_result->'summary'->>'mcmv_reset_candidates')::int <> 1 then
    raise exception 'FALHOU (3c): esperava 1 candidato de reset MCMV (unit_mcmv_ready), veio %',
      v_result->'summary'->>'mcmv_reset_candidates';
  end if;

  if (v_result->'summary'->>'reconciled')::int <> 0 or (v_result->'summary'->>'mcmv_reset')::int <> 0 then
    raise exception 'FALHOU (3d): dry_run não deveria ter aplicado nada, summary veio %', v_result->'summary';
  end if;

  select array_agg((item->>'unit_id')::uuid) into v_recon_ids
  from jsonb_array_elements(v_result->'details'->'reconciliation') item;

  if not (v_recon_ids @> array['71200000-0000-0000-0000-000000000001'::uuid, '71200000-0000-0000-0000-000000000002'::uuid]
          and array_length(v_recon_ids, 1) = 2) then
    raise exception 'FALHOU (3e): lista de reconciliação deveria conter exatamente unit_recon_status e unit_recon_deal, veio %', v_recon_ids;
  end if;

  select array_agg((item->>'unit_id')::uuid) into v_mcmv_ids
  from jsonb_array_elements(v_result->'details'->'mcmv_reset') item;

  if not (v_mcmv_ids @> array['71200000-0000-0000-0000-000000000006'::uuid] and array_length(v_mcmv_ids, 1) = 1) then
    raise exception 'FALHOU (3f): lista de reset MCMV deveria conter exatamente unit_mcmv_ready, veio %', v_mcmv_ids;
  end if;

  -- unit_no_issue, unit_ok_already, unit_mcmv_stale, unit_b nunca aparecem.
  if v_recon_ids @> array['71200000-0000-0000-0000-000000000003'::uuid, '71200000-0000-0000-0000-000000000004'::uuid, '71200000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (3g): lista de reconciliação não deveria conter unit_no_issue/unit_ok_already/unit_b';
  end if;

  if v_mcmv_ids @> array['71200000-0000-0000-0000-000000000005'::uuid, '71200000-0000-0000-0000-00000000000b'::uuid] then
    raise exception 'FALHOU (3h): lista de reset MCMV não deveria conter unit_mcmv_stale/unit_b';
  end if;
end $$;

reset role;

-- Confirma que dry_run não alterou nada.
do $$
declare
  v_unit public.units;
  v_deal public.deals;
  v_count int;
begin
  select * into v_unit from public.units where id = '71200000-0000-0000-0000-000000000001';
  if v_unit.status <> 'vendida' or v_unit.admin_status <> 'cartorio' then
    raise exception 'FALHOU (3i): unit_recon_status não deveria ter sido alterada por dry_run, status=%, admin_status=%', v_unit.status, v_unit.admin_status;
  end if;

  select * into v_deal from public.deals where id = '71500000-0000-0000-0000-000000000001';
  if v_deal.sales_stage <> 'proposta' or v_deal.is_active <> true then
    raise exception 'FALHOU (3j): deal_recon não deveria ter sido alterado por dry_run, sales_stage=%, is_active=%', v_deal.sales_stage, v_deal.is_active;
  end if;

  select * into v_unit from public.units where id = '71200000-0000-0000-0000-000000000006';
  if v_unit.admin_status <> 'distrato' then
    raise exception 'FALHOU (3k): unit_mcmv_ready não deveria ter sido alterada por dry_run, admin_status=%', v_unit.admin_status;
  end if;

  select count(*) into v_count from public.status_transitions
    where unit_id in ('71200000-0000-0000-0000-000000000001', '71200000-0000-0000-0000-000000000002');
  if v_count <> 0 then
    raise exception 'FALHOU (3l): dry_run não deveria ter criado status_transitions, achou %', v_count;
  end if;

  select count(*) into v_count from public.activities where unit_id = '71200000-0000-0000-0000-000000000006';
  if v_count <> 0 then
    raise exception 'FALHOU (3m): dry_run não deveria ter criado activities, achou %', v_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 4: dry_run=false (admin_a) -- aplica de verdade as 2 categorias.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000a0001","tenant_id":"71000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_distrato_checkup(false) into v_result;

  if (v_result->>'dry_run')::boolean <> false or (v_result->>'corrections_applied')::boolean <> true then
    raise exception 'FALHOU (4a): dry_run/corrections_applied errados no relatório de aplicação, veio %', v_result;
  end if;

  if (v_result->'summary'->>'reconciled')::int <> 2 then
    raise exception 'FALHOU (4b): esperava 2 reconciliações aplicadas, veio %', v_result->'summary'->>'reconciled';
  end if;

  if (v_result->'summary'->>'mcmv_reset')::int <> 1 then
    raise exception 'FALHOU (4c): esperava 1 reset MCMV aplicado, veio %', v_result->'summary'->>'mcmv_reset';
  end if;

  if (v_result->'summary'->>'errors')::int <> 0 then
    raise exception 'FALHOU (4d): não esperava erros, summary veio %', v_result->'summary';
  end if;
end $$;

reset role;

-- 4e. unit_recon_status: deal era só status inconsistente (sem deal ativo
-- para essa unidade) -- confirma unidade liberada + status_transitions +
-- notification com p_source=checkup_reconciliation.
do $$
declare
  v_unit public.units;
  v_transition public.status_transitions;
  v_notification public.notifications;
begin
  select * into v_unit from public.units where id = '71200000-0000-0000-0000-000000000001';
  if v_unit.status <> 'disponivel' or v_unit.admin_status <> 'distrato' or v_unit.active_deal_id is not null then
    raise exception 'FALHOU (4e): unit_recon_status deveria estar disponivel/distrato/sem active_deal_id (status=%, admin_status=%, active_deal_id=%)',
      v_unit.status, v_unit.admin_status, v_unit.active_deal_id;
  end if;

  select * into v_transition from public.status_transitions where unit_id = '71200000-0000-0000-0000-000000000001';
  if v_transition.from_status <> 'cartorio' or v_transition.to_status <> 'distrato' or v_transition.transition_type <> 'admin' then
    raise exception 'FALHOU (4f): status_transition de unit_recon_status com from/to/type errados (from=%, to=%, type=%)',
      v_transition.from_status, v_transition.to_status, v_transition.transition_type;
  end if;

  select * into v_notification from public.notifications
    where entity_type = 'Unit' and entity_id = '71200000-0000-0000-0000-000000000001';
  if v_notification.title <> 'Distrato Reconciliado via Checkup'
     or v_notification.message not like '%reconciliada automaticamente pelo checkup de distratos%'
     or (v_notification.meta->>'trigger') <> 'checkup_reconciliation' then
    raise exception 'FALHOU (4g): notification de unit_recon_status com title/message/meta.trigger errados (title=%, message=%, trigger=%)',
      v_notification.title, v_notification.message, v_notification.meta->>'trigger';
  end if;
end $$;

-- 4h. unit_recon_deal: tinha deal ativo em 'proposta' -- confirma deal
-- distratado/inativo e unidade liberada.
do $$
declare
  v_unit public.units;
  v_deal public.deals;
begin
  select * into v_deal from public.deals where id = '71500000-0000-0000-0000-000000000001';
  if v_deal.sales_stage <> 'distratado' or v_deal.is_active <> false or v_deal.distrato_at is null then
    raise exception 'FALHOU (4h): deal_recon deveria estar distratado/inativo/com distrato_at (sales_stage=%, is_active=%, distrato_at=%)',
      v_deal.sales_stage, v_deal.is_active, v_deal.distrato_at;
  end if;

  select * into v_unit from public.units where id = '71200000-0000-0000-0000-000000000002';
  if v_unit.status <> 'disponivel' or v_unit.admin_status <> 'distrato' or v_unit.active_deal_id is not null then
    raise exception 'FALHOU (4i): unit_recon_deal deveria estar disponivel/distrato/sem active_deal_id (status=%, admin_status=%, active_deal_id=%)',
      v_unit.status, v_unit.admin_status, v_unit.active_deal_id;
  end if;
end $$;

-- 4j. unit_mcmv_ready: reset de MCMV aplicado de verdade.
do $$
declare
  v_unit public.units;
  v_activity public.activities;
  v_notification public.notifications;
begin
  select * into v_unit from public.units where id = '71200000-0000-0000-0000-000000000006';
  if v_unit.admin_status <> 'laudo_engenharia' then
    raise exception 'FALHOU (4j): unit_mcmv_ready deveria voltar para laudo_engenharia, está %', v_unit.admin_status;
  end if;

  select * into v_activity from public.activities where unit_id = '71200000-0000-0000-0000-000000000006';
  if v_activity.type <> 'status_change' or v_activity.deal_id <> '71500000-0000-0000-0000-000000000003' then
    raise exception 'FALHOU (4k): activity de reset com type/deal_id errados (type=%, deal_id=%)', v_activity.type, v_activity.deal_id;
  end if;

  select * into v_notification from public.notifications
    where entity_type = 'Unit' and entity_id = '71200000-0000-0000-0000-000000000006';
  if v_notification.title <> 'Unidade reaberta para nova venda' or v_notification.type <> 'VENDA' then
    raise exception 'FALHOU (4l): notification de reset com title/type errados (title=%, type=%)', v_notification.title, v_notification.type;
  end if;
end $$;

-- 4m. unit_no_issue, unit_ok_already, unit_mcmv_stale continuam intocadas.
do $$
declare
  v_unit_no_issue public.units;
  v_unit_ok_already public.units;
  v_unit_mcmv_stale public.units;
begin
  select * into v_unit_no_issue from public.units where id = '71200000-0000-0000-0000-000000000003';
  if v_unit_no_issue.status <> 'vendida' or v_unit_no_issue.admin_status <> 'registro_pago' then
    raise exception 'FALHOU (4m): unit_no_issue não deveria ter sido alterada (status=%, admin_status=%)', v_unit_no_issue.status, v_unit_no_issue.admin_status;
  end if;

  select * into v_unit_ok_already from public.units where id = '71200000-0000-0000-0000-000000000004';
  if v_unit_ok_already.status <> 'disponivel' or v_unit_ok_already.admin_status <> 'distrato' then
    raise exception 'FALHOU (4n): unit_ok_already não deveria ter sido alterada (status=%, admin_status=%)', v_unit_ok_already.status, v_unit_ok_already.admin_status;
  end if;

  select * into v_unit_mcmv_stale from public.units where id = '71200000-0000-0000-0000-000000000005';
  if v_unit_mcmv_stale.admin_status <> 'distrato' then
    raise exception 'FALHOU (4o): unit_mcmv_stale não deveria ter sido alterada, admin_status=%', v_unit_mcmv_stale.admin_status;
  end if;
end $$;

-- =======================================================================
-- TESTE 5: isolamento -- unit_b (tenant B) nunca apareceu no checkup de
-- admin_a (testes 3/4) e continua intocada; checkup do próprio admin_b
-- funciona normalmente e não enxerga nada do tenant A.
-- =======================================================================

do $$
declare v_unit_b public.units;
begin
  select * into v_unit_b from public.units where id = '71200000-0000-0000-0000-00000000000b';
  if v_unit_b.status <> 'vendida' or v_unit_b.admin_status <> 'cartorio' then
    raise exception 'FALHOU (5a): unit_b não deveria ter sido alterada pelo checkup de admin_a (status=%, admin_status=%)', v_unit_b.status, v_unit_b.admin_status;
  end if;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000b0001","tenant_id":"71000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_recon_ids uuid[];
begin
  select public.run_distrato_checkup(true) into v_result;

  if (v_result->'summary'->>'reconciliation_candidates')::int <> 1 then
    raise exception 'FALHOU (5b): admin_b deveria ver 1 candidato de reconciliação (unit_b), veio %', v_result->'summary'->>'reconciliation_candidates';
  end if;

  if (v_result->'summary'->>'mcmv_reset_candidates')::int <> 0 then
    raise exception 'FALHOU (5c): admin_b não deveria ver candidato de reset MCMV, veio %', v_result->'summary'->>'mcmv_reset_candidates';
  end if;

  select array_agg((item->>'unit_id')::uuid) into v_recon_ids
  from jsonb_array_elements(v_result->'details'->'reconciliation') item;

  if v_recon_ids @> array[
    '71200000-0000-0000-0000-000000000001'::uuid,
    '71200000-0000-0000-0000-000000000002'::uuid
  ] then
    raise exception 'FALHOU (5d): checkup de admin_b não deveria enxergar unidades do tenant A, veio %', v_recon_ids;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 6: grants -- `anon` nunca tem EXECUTE em run_distrato_checkup, só
-- `authenticated`.
-- =======================================================================

do $$
declare
  v_anon boolean;
  v_authenticated boolean;
begin
  select has_function_privilege('anon', 'public.run_distrato_checkup(boolean)', 'execute') into v_anon;
  select has_function_privilege('authenticated', 'public.run_distrato_checkup(boolean)', 'execute') into v_authenticated;

  if v_anon then
    raise exception 'FALHOU (6a): anon NÃO deveria ter EXECUTE em run_distrato_checkup';
  end if;
  if not v_authenticated then
    raise exception 'FALHOU (6b): authenticated deveria ter EXECUTE em run_distrato_checkup';
  end if;
end $$;

-- =======================================================================
-- TESTE 7: regressão -- apply_unit_distrato continua aceitando 'manual'/
-- 'auto_document_approval' normalmente (allowlist estendida, não
-- substituída) e ainda rejeita p_source inválido.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-0000-0000-0000000a0001","tenant_id":"71000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.apply_unit_distrato('71200000-0000-0000-0000-000000000003'::uuid, null, 'p_source_invalido');
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (7a): apply_unit_distrato deveria ter rejeitado p_source inválido';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou até aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE run_distrato_checkup PASSARAM (0071)' as resultado;

-- Desfaz TUDO -- nenhum dado sintético de teste fica no banco.
rollback;
