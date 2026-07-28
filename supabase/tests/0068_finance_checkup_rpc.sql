-- 0068_finance_checkup_rpc.sql (teste)
-- Teste da função `public.run_finance_checkup` introduzida em
-- supabase/migrations/0068_finance_checkup_rpc.sql (e do valor de enum
-- `observacao` adicionado em 0067_finance_events_observacao.sql).
--
-- COMO RODAR
-- ----------
-- Mesmo critério de supabase/tests/0018_update_deal_stage_rpc.sql e
-- supabase/tests/0063_configuracoes_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto já linkado), não via
-- `supabase test db` (pgTAP exige Docker, indisponível neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0068_finance_checkup_rpc.sql
--
-- SEGURANÇA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transação com ROLLBACK no final -- nenhum dado
-- sintético fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer asserção que falhe faz `raise exception`, abortando a transação
-- inteira.
--
-- Cada teste que chama a RPC como um usuário real usa
-- `set_config('request.jwt.claims', ..., true)` + `set local role
-- authenticated` para simular exatamente o que o PostgREST faz numa
-- requisição autenticada -- igual ao padrão de 0002/0010/0017/0018/0063.
--
-- CENÁRIO SINTÉTICO (2 tenants, para provar isolamento)
-- -------------------------------------------------------
-- Tenant A (admin_a, comercial_a, um usuário sem tenant_id no claim) tem as
-- 4 classes de problema:
--   1. Carteira duplicada: unit_dup1_a tem 2 finance_accounts não deletadas
--      -- fa_a_primary (2 parcelas) e fa_a_dup (1 parcela). fa_a_primary
--      deveria virar a primária (mais parcelas).
--   2. Parcela duplicada: unit_parcela_a tem 2 parcelas com a mesma chave
--      (unidade+tipo+vencimento+valor_previsto+descrição) -- uma PAGA
--      (pi_a_parcela_primary, deveria virar a primária) e uma PREVISTO
--      (pi_a_parcela_dup, deveria ser removida).
--   3. Campo inconsistente: pi_a_incons_1 (pago, sem data_pagamento, sem
--      valor_pago -- as DUAS inconsistências no mesmo registro) e
--      pi_a_incons_2 (previsto, com valor_pago > 0 -- a terceira
--      inconsistência, em outro registro).
--   4. Parcela vencida não marcada: pi_a_overdue_1 (previsto, vencimento no
--      passado).
--
-- Tenant B (admin_b) tem SÓ o problema 1 (carteira duplicada), isolado --
-- prova que o checkup de A nunca vê/mexe em B e vice-versa.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. dry_run=true (admin_a) detecta corretamente as 4 categorias do tenant
--    A, sem alterar nada, e NUNCA inclui dado do tenant B no relatório.
-- 2. dry_run=true (admin_b) detecta só o problema do tenant B (1 carteira
--    duplicada), sem nenhum dado do tenant A.
-- 3. dry_run=false (admin_b) corrige o problema do tenant B -- e o tenant A
--    continua com seus problemas originais intocados (prova bidirecional
--    de isolamento).
-- 4. dry_run=false (admin_a) corrige as 4 categorias do tenant A -- estado
--    final consistente em cada uma -- e o tenant B (já corrigido no passo
--    3) continua intocado por esta chamada.
-- 5. dry_run=true (admin_a), rodado de novo após a correção: todas as
--    contagens voltam a zero -- o checkup não re-detecta o que já corrigiu.
-- 6. comercial_a (mesmo tenant, tenant_role != admin) NÃO consegue chamar a
--    função, nem em dry_run -- exceção clara, RLS/checagem interna barra
--    antes de qualquer leitura/escrita.
-- 7. Usuário autenticado SEM tenant_id no claim NÃO consegue chamar a
--    função -- exceção clara.
-- 8. Grants: `anon` NUNCA tem EXECUTE na função (só `authenticated`) --
--    confirma que não há bypass via role pública, e que o único caminho
--    privilegiado (SECURITY DEFINER) exige sessão autenticada + admin.

begin;

-- =======================================================================
-- SETUP
-- =======================================================================

insert into auth.users (id) values
  ('68000000-0000-0000-0000-0000000a0001'), -- admin_a
  ('68000000-0000-0000-0000-0000000a0002'), -- comercial_a
  ('68000000-0000-0000-0000-0000000a0003'), -- sem tenant_id no claim
  ('68000000-0000-0000-0000-0000000b0001'); -- admin_b

insert into public.tenants (id, name, slug) values
  ('68000000-0000-0000-0000-00000000000a', 'Tenant A - teste finance checkup 0068', 'tenant-a-finance-checkup-0068'),
  ('68000000-0000-0000-0000-00000000000b', 'Tenant B - teste finance checkup 0068', 'tenant-b-finance-checkup-0068');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('68000000-0000-0000-0000-00000000000a', '68000000-0000-0000-0000-0000000a0001', 'admin', 'active'),
  ('68000000-0000-0000-0000-00000000000a', '68000000-0000-0000-0000-0000000a0002', 'comercial', 'active'),
  ('68000000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-0000000b0001', 'admin', 'active');

insert into public.projects (id, tenant_id, code, name) values
  ('68100000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-00000000000a', 'PRJ-0068-A', 'Projeto teste 0068 - Tenant A'),
  ('68100000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-00000000000b', 'PRJ-0068-B', 'Projeto teste 0068 - Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price, status) values
  ('68200000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-00000000000a', '68100000-0000-0000-0000-000000000001', 'UN-0068-A-DUP', 200000, 'vendida'),
  ('68200000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-00000000000a', '68100000-0000-0000-0000-000000000001', 'UN-0068-A-PARC', 200000, 'vendida'),
  ('68200000-0000-0000-0000-000000000003', '68000000-0000-0000-0000-00000000000a', '68100000-0000-0000-0000-000000000001', 'UN-0068-A-INCONS', 200000, 'vendida'),
  ('68200000-0000-0000-0000-000000000004', '68000000-0000-0000-0000-00000000000a', '68100000-0000-0000-0000-000000000001', 'UN-0068-A-OVERDUE', 200000, 'vendida'),
  ('68200000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-00000000000b', '68100000-0000-0000-0000-00000000000b', 'UN-0068-B-DUP', 200000, 'vendida');

insert into public.clients (id, tenant_id, name) values
  ('68300000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-00000000000a', 'Cliente A - teste 0068'),
  ('68300000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-00000000000b', 'Cliente B - teste 0068');

-- ---- Tenant A: carteiras (categoria 1) ----
insert into public.finance_accounts (id, tenant_id, unit_id, client_id, project_id, valor_venda_total, status, created_at) values
  ('68400000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-00000000000a', '68200000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 200000, 'ativa', now() - interval '10 days'), -- fa_a_primary (2 parcelas)
  ('68400000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-00000000000a', '68200000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 200000, 'ativa', now() - interval '1 day'),  -- fa_a_dup (1 parcela)
  ('68400000-0000-0000-0000-000000000003', '68000000-0000-0000-0000-00000000000a', '68200000-0000-0000-0000-000000000002', '68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 200000, 'ativa', now()), -- fa_a_parcela
  ('68400000-0000-0000-0000-000000000004', '68000000-0000-0000-0000-00000000000a', '68200000-0000-0000-0000-000000000003', '68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 200000, 'ativa', now()), -- fa_a_incons
  ('68400000-0000-0000-0000-000000000005', '68000000-0000-0000-0000-00000000000a', '68200000-0000-0000-0000-000000000004', '68300000-0000-0000-0000-000000000001', '68100000-0000-0000-0000-000000000001', 200000, 'ativa', now()); -- fa_a_overdue

-- ---- Tenant B: carteiras (categoria 1) ----
insert into public.finance_accounts (id, tenant_id, unit_id, client_id, project_id, valor_venda_total, status, created_at) values
  ('68400000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-00000000000b', '68200000-0000-0000-0000-00000000000b', '68300000-0000-0000-0000-00000000000b', '68100000-0000-0000-0000-00000000000b', 200000, 'ativa', now() - interval '10 days'), -- fa_b_primary (2 parcelas)
  ('68400000-0000-0000-0000-00000000000c', '68000000-0000-0000-0000-00000000000b', '68200000-0000-0000-0000-00000000000b', '68300000-0000-0000-0000-00000000000b', '68100000-0000-0000-0000-00000000000b', 200000, 'ativa', now() - interval '1 day');  -- fa_b_dup (1 parcela)

-- ---- Tenant A: parcelas da carteira duplicada (categoria 1) ----
insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, descricao, vencimento, valor_previsto, status, created_at) values
  ('68500000-0000-0000-0000-000000000001', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000001', '68200000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', 'entrada', 'Entrada', '2027-01-10', 1000.00, 'previsto', now() - interval '10 days'),
  ('68500000-0000-0000-0000-000000000002', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000001', '68200000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela 1', '2027-02-10', 1200.00, 'previsto', now() - interval '10 days'),
  ('68500000-0000-0000-0000-000000000003', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000002', '68200000-0000-0000-0000-000000000001', '68300000-0000-0000-0000-000000000001', 'reforco', 'Reforço', '2027-04-10', 500.00, 'previsto', now() - interval '1 day');

-- ---- Tenant A: parcelas duplicadas (categoria 2) ----
insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, descricao, vencimento, valor_previsto, valor_pago, status, data_pagamento, created_at) values
  ('68500000-0000-0000-0000-000000000004', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000003', '68200000-0000-0000-0000-000000000002', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela 03/2027', '2027-03-10', 1500.00, 1500.00, 'pago', '2027-03-08', now() - interval '5 days'),
  ('68500000-0000-0000-0000-000000000005', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000003', '68200000-0000-0000-0000-000000000002', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela 03/2027', '2027-03-10', 1500.00, null, 'previsto', null, now() - interval '2 days');

-- ---- Tenant A: campos inconsistentes (categoria 3) ----
insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, descricao, vencimento, valor_previsto, valor_pago, status, data_pagamento) values
  ('68500000-0000-0000-0000-000000000006', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000004', '68200000-0000-0000-0000-000000000003', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela inconsistente 1', '2027-05-10', 500.00, null, 'pago', null),
  ('68500000-0000-0000-0000-000000000007', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000004', '68200000-0000-0000-0000-000000000003', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela inconsistente 2', '2027-06-10', 800.00, 200.00, 'previsto', null);

-- ---- Tenant A: parcela vencida não marcada (categoria 4) ----
insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, descricao, vencimento, valor_previsto, status) values
  ('68500000-0000-0000-0000-000000000008', '68000000-0000-0000-0000-00000000000a', '68400000-0000-0000-0000-000000000005', '68200000-0000-0000-0000-000000000004', '68300000-0000-0000-0000-000000000001', 'parcela', 'Parcela vencida', current_date - 10, 300.00, 'previsto');

-- ---- Tenant B: parcelas da carteira duplicada (único problema de B) ----
insert into public.payment_installments (id, tenant_id, finance_account_id, unit_id, client_id, tipo, descricao, vencimento, valor_previsto, status, created_at) values
  ('68500000-0000-0000-0000-00000000000b', '68000000-0000-0000-0000-00000000000b', '68400000-0000-0000-0000-00000000000b', '68200000-0000-0000-0000-00000000000b', '68300000-0000-0000-0000-00000000000b', 'entrada', 'Entrada B', '2027-01-10', 1000.00, 'previsto', now() - interval '10 days'),
  ('68500000-0000-0000-0000-00000000000c', '68000000-0000-0000-0000-00000000000b', '68400000-0000-0000-0000-00000000000b', '68200000-0000-0000-0000-00000000000b', '68300000-0000-0000-0000-00000000000b', 'parcela', 'Parcela B1', '2027-02-10', 1200.00, 'previsto', now() - interval '10 days'),
  ('68500000-0000-0000-0000-00000000000d', '68000000-0000-0000-0000-00000000000b', '68400000-0000-0000-0000-00000000000c', '68200000-0000-0000-0000-00000000000b', '68300000-0000-0000-0000-00000000000b', 'reforco', 'Reforço B', '2027-04-10', 500.00, 'previsto', now() - interval '1 day');

-- =======================================================================
-- TESTE 1: dry_run=true como admin_a -- detecta as 4 categorias do tenant
-- A, sem alterar nada, sem vazar nenhum dado do tenant B.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000a0001","tenant_id":"68000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_finance_checkup(true) into v_result;

  if (v_result->>'dry_run')::boolean is distinct from true then
    raise exception 'FALHOU (1a): dry_run deveria ser true, veio %', v_result->>'dry_run';
  end if;

  if (v_result->>'corrections_applied')::boolean is distinct from false then
    raise exception 'FALHOU (1b): corrections_applied deveria ser false em dry_run, veio %', v_result->>'corrections_applied';
  end if;

  if (v_result->'summary'->>'duplicate_wallets')::int <> 1 then
    raise exception 'FALHOU (1c): duplicate_wallets deveria ser 1, veio %', v_result->'summary'->>'duplicate_wallets';
  end if;

  if (v_result->'summary'->>'duplicate_installments')::int <> 1 then
    raise exception 'FALHOU (1d): duplicate_installments deveria ser 1, veio %', v_result->'summary'->>'duplicate_installments';
  end if;

  if (v_result->'summary'->>'missing_payment_date')::int <> 1 then
    raise exception 'FALHOU (1e): missing_payment_date deveria ser 1, veio %', v_result->'summary'->>'missing_payment_date';
  end if;

  if (v_result->'summary'->>'zero_valor_pago_on_paid')::int <> 1 then
    raise exception 'FALHOU (1f): zero_valor_pago_on_paid deveria ser 1, veio %', v_result->'summary'->>'zero_valor_pago_on_paid';
  end if;

  if (v_result->'summary'->>'nonzero_valor_pago_on_unpaid')::int <> 1 then
    raise exception 'FALHOU (1g): nonzero_valor_pago_on_unpaid deveria ser 1, veio %', v_result->'summary'->>'nonzero_valor_pago_on_unpaid';
  end if;

  if (v_result->'summary'->>'overdue_not_marked')::int <> 1 then
    raise exception 'FALHOU (1h): overdue_not_marked deveria ser 1, veio %', v_result->'summary'->>'overdue_not_marked';
  end if;

  -- Detalhe da carteira duplicada: fa_a_dup é a duplicata, fa_a_primary é a primária.
  if not exists (
    select 1 from jsonb_array_elements(v_result->'details'->'duplicate_wallets') e
    where (e->>'duplicate_account_id')::uuid = '68400000-0000-0000-0000-000000000002'
      and (e->>'primary_account_id')::uuid = '68400000-0000-0000-0000-000000000001'
      and (e->>'installments_moved')::int = 1
  ) then
    raise exception 'FALHOU (1i): detalhe de duplicate_wallets não bate com o esperado (fa_a_dup -> fa_a_primary, 1 parcela)';
  end if;

  -- Detalhe da parcela duplicada: a PREVISTO é a duplicata, a PAGA é a primária.
  if not exists (
    select 1 from jsonb_array_elements(v_result->'details'->'duplicate_installments') e
    where (e->>'duplicate_installment_id')::uuid = '68500000-0000-0000-0000-000000000005'
      and (e->>'primary_installment_id')::uuid = '68500000-0000-0000-0000-000000000004'
  ) then
    raise exception 'FALHOU (1j): detalhe de duplicate_installments não bate com o esperado (parcela previsto -> parcela paga)';
  end if;

  -- Nenhum id do tenant B em nenhum detalhe.
  if exists (
    select 1 from jsonb_array_elements(v_result->'details'->'duplicate_wallets') e
    where (e->>'duplicate_account_id')::uuid = '68400000-0000-0000-0000-00000000000c'
       or (e->>'primary_account_id')::uuid = '68400000-0000-0000-0000-00000000000b'
  ) then
    raise exception 'FALHOU (1k): duplicate_wallets do tenant A vazou dado do tenant B';
  end if;
end $$;

reset role;

-- Confirma que NADA foi alterado pelo dry_run (tenant A).
do $$
declare
  v_fa_dup_deleted boolean;
  v_pi_dup_fa uuid;
  v_pi_dedupe_deleted boolean;
  v_pi_incons1_data_pagamento date;
  v_pi_incons2_valor_pago numeric;
  v_pi_overdue_status text;
  v_events_count int;
begin
  select is_deleted into v_fa_dup_deleted from public.finance_accounts where id = '68400000-0000-0000-0000-000000000002';
  if v_fa_dup_deleted <> false then
    raise exception 'FALHOU (1l): fa_a_dup não deveria ter sido alterada em dry_run';
  end if;

  select finance_account_id into v_pi_dup_fa from public.payment_installments where id = '68500000-0000-0000-0000-000000000003';
  if v_pi_dup_fa <> '68400000-0000-0000-0000-000000000002' then
    raise exception 'FALHOU (1m): parcela da carteira duplicada não deveria ter sido movida em dry_run';
  end if;

  select is_deleted into v_pi_dedupe_deleted from public.payment_installments where id = '68500000-0000-0000-0000-000000000005';
  if v_pi_dedupe_deleted <> false then
    raise exception 'FALHOU (1n): parcela duplicada não deveria ter sido removida em dry_run';
  end if;

  select data_pagamento into v_pi_incons1_data_pagamento from public.payment_installments where id = '68500000-0000-0000-0000-000000000006';
  if v_pi_incons1_data_pagamento is not null then
    raise exception 'FALHOU (1o): data_pagamento não deveria ter sido preenchida em dry_run';
  end if;

  select valor_pago into v_pi_incons2_valor_pago from public.payment_installments where id = '68500000-0000-0000-0000-000000000007';
  if v_pi_incons2_valor_pago <> 200.00 then
    raise exception 'FALHOU (1p): valor_pago não deveria ter sido zerado em dry_run';
  end if;

  select status::text into v_pi_overdue_status from public.payment_installments where id = '68500000-0000-0000-0000-000000000008';
  if v_pi_overdue_status <> 'previsto' then
    raise exception 'FALHOU (1q): status da parcela vencida não deveria ter mudado em dry_run, está %', v_pi_overdue_status;
  end if;

  select count(*) into v_events_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000a';
  if v_events_count <> 0 then
    raise exception 'FALHOU (1r): dry_run não deveria ter criado nenhum finance_events, criou %', v_events_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 2: dry_run=true como admin_b -- detecta só o problema do tenant B,
-- nenhum dado do tenant A.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000b0001","tenant_id":"68000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_finance_checkup(true) into v_result;

  if (v_result->'summary'->>'duplicate_wallets')::int <> 1 then
    raise exception 'FALHOU (2a): admin_b deveria ver exatamente 1 carteira duplicada (a dele), viu %', v_result->'summary'->>'duplicate_wallets';
  end if;

  if (v_result->'summary'->>'duplicate_installments')::int <> 0
     or (v_result->'summary'->>'missing_payment_date')::int <> 0
     or (v_result->'summary'->>'zero_valor_pago_on_paid')::int <> 0
     or (v_result->'summary'->>'nonzero_valor_pago_on_unpaid')::int <> 0
     or (v_result->'summary'->>'overdue_not_marked')::int <> 0 then
    raise exception 'FALHOU (2b): tenant B não tem problema nas outras 5 categorias, relatório veio com contagem != 0: %', v_result->'summary';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_result->'details'->'duplicate_wallets') e
    where (e->>'duplicate_account_id')::uuid = '68400000-0000-0000-0000-00000000000c'
      and (e->>'primary_account_id')::uuid = '68400000-0000-0000-0000-00000000000b'
  ) then
    raise exception 'FALHOU (2c): detalhe da carteira duplicada do tenant B não bate com o esperado';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_result->'details'->'duplicate_wallets') e
    where (e->>'duplicate_account_id')::uuid = '68400000-0000-0000-0000-000000000002'
  ) then
    raise exception 'FALHOU (2d): relatório do tenant B vazou a carteira duplicada do tenant A';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 3: dry_run=false como admin_b -- corrige o problema do tenant B, e
-- o tenant A continua com seus problemas originais intocados.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000b0001","tenant_id":"68000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_finance_checkup(false) into v_result;

  if (v_result->>'corrections_applied')::boolean is distinct from true then
    raise exception 'FALHOU (3a): corrections_applied deveria ser true, veio %', v_result->>'corrections_applied';
  end if;

  if (v_result->'summary'->>'duplicate_wallets')::int <> 1 then
    raise exception 'FALHOU (3b): duplicate_wallets do tenant B deveria ser 1, veio %', v_result->'summary'->>'duplicate_wallets';
  end if;
end $$;

reset role;

do $$
declare
  v_fa_b_dup_deleted boolean;
  v_fa_b_dup_deleted_by uuid;
  v_pi_b_moved_fa uuid;
  v_events_b_count int;
  -- tenant A ainda intocado:
  v_fa_a_dup_deleted boolean;
  v_pi_a_dup_fa uuid;
  v_pi_a_dedupe_deleted boolean;
  v_pi_a_incons1_data_pagamento date;
  v_events_a_count int;
begin
  select is_deleted, deleted_by_user_id into v_fa_b_dup_deleted, v_fa_b_dup_deleted_by
    from public.finance_accounts where id = '68400000-0000-0000-0000-00000000000c';
  if v_fa_b_dup_deleted <> true or v_fa_b_dup_deleted_by <> '68000000-0000-0000-0000-0000000b0001' then
    raise exception 'FALHOU (3c): fa_b_dup deveria estar soft-deletada por admin_b, is_deleted=%, deleted_by=%', v_fa_b_dup_deleted, v_fa_b_dup_deleted_by;
  end if;

  select finance_account_id into v_pi_b_moved_fa from public.payment_installments where id = '68500000-0000-0000-0000-00000000000d';
  if v_pi_b_moved_fa <> '68400000-0000-0000-0000-00000000000b' then
    raise exception 'FALHOU (3d): parcela da carteira duplicada de B deveria ter sido movida para fa_b_primary, está em %', v_pi_b_moved_fa;
  end if;

  select count(*) into v_events_b_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000b';
  if v_events_b_count <> 1 then
    raise exception 'FALHOU (3e): tenant B deveria ter exatamente 1 finance_events (merge de carteira), tem %', v_events_b_count;
  end if;

  if not exists (
    select 1 from public.finance_events
    where tenant_id = '68000000-0000-0000-0000-00000000000b'
      and finance_account_id = '68400000-0000-0000-0000-00000000000b'
      and tipo_evento = 'observacao'
  ) then
    raise exception 'FALHOU (3e2): finance_events do merge de carteira do tenant B não tem o formato esperado (tipo_evento=observacao, finance_account_id=fa_b_primary)';
  end if;

  -- Tenant A: nada mudou.
  select is_deleted into v_fa_a_dup_deleted from public.finance_accounts where id = '68400000-0000-0000-0000-000000000002';
  if v_fa_a_dup_deleted <> false then
    raise exception 'FALHOU (3f): fa_a_dup NÃO deveria ter sido alterada pela chamada de admin_b (isolamento de tenant)';
  end if;

  select finance_account_id into v_pi_a_dup_fa from public.payment_installments where id = '68500000-0000-0000-0000-000000000003';
  if v_pi_a_dup_fa <> '68400000-0000-0000-0000-000000000002' then
    raise exception 'FALHOU (3g): parcela do tenant A NÃO deveria ter sido movida pela chamada de admin_b';
  end if;

  select is_deleted into v_pi_a_dedupe_deleted from public.payment_installments where id = '68500000-0000-0000-0000-000000000005';
  if v_pi_a_dedupe_deleted <> false then
    raise exception 'FALHOU (3h): parcela duplicada do tenant A NÃO deveria ter sido removida pela chamada de admin_b';
  end if;

  select data_pagamento into v_pi_a_incons1_data_pagamento from public.payment_installments where id = '68500000-0000-0000-0000-000000000006';
  if v_pi_a_incons1_data_pagamento is not null then
    raise exception 'FALHOU (3i): campo inconsistente do tenant A NÃO deveria ter sido corrigido pela chamada de admin_b';
  end if;

  select count(*) into v_events_a_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000a';
  if v_events_a_count <> 0 then
    raise exception 'FALHOU (3j): tenant A NÃO deveria ter nenhum finance_events criado pela chamada de admin_b, tem %', v_events_a_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 4: dry_run=false como admin_a -- corrige as 4 categorias do tenant
-- A; tenant B (já corrigido no TESTE 3) permanece intocado.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000a0001","tenant_id":"68000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_finance_checkup(false) into v_result;

  if (v_result->>'corrections_applied')::boolean is distinct from true then
    raise exception 'FALHOU (4a): corrections_applied deveria ser true, veio %', v_result->>'corrections_applied';
  end if;

  if (v_result->'summary'->>'duplicate_wallets')::int <> 1
     or (v_result->'summary'->>'duplicate_installments')::int <> 1
     or (v_result->'summary'->>'missing_payment_date')::int <> 1
     or (v_result->'summary'->>'zero_valor_pago_on_paid')::int <> 1
     or (v_result->'summary'->>'nonzero_valor_pago_on_unpaid')::int <> 1
     or (v_result->'summary'->>'overdue_not_marked')::int <> 1 then
    raise exception 'FALHOU (4b): summary do tenant A não bate com o esperado (todas 1): %', v_result->'summary';
  end if;
end $$;

reset role;

do $$
declare
  v_fa_dup public.finance_accounts;
  v_fa_primary_installments int;
  v_pi_dedupe_deleted boolean;
  v_pi_primary_status text;
  v_incons1 public.payment_installments;
  v_incons2 public.payment_installments;
  v_overdue_status text;
  v_events_a_count int;
  v_merge_event_count int;
  v_dedupe_event_count int;
  -- tenant B permanece corrigido/intocado por esta chamada:
  v_events_b_count int;
  v_fa_b_dup_deleted boolean;
begin
  -- Categoria 1: fa_a_dup soft-deletada, todas as 3 parcelas agora sob fa_a_primary.
  select * into v_fa_dup from public.finance_accounts where id = '68400000-0000-0000-0000-000000000002';
  if v_fa_dup.is_deleted <> true or v_fa_dup.deleted_by_user_id <> '68000000-0000-0000-0000-0000000a0001' then
    raise exception 'FALHOU (4c): fa_a_dup deveria estar soft-deletada por admin_a, is_deleted=%, deleted_by=%', v_fa_dup.is_deleted, v_fa_dup.deleted_by_user_id;
  end if;

  select count(*) into v_fa_primary_installments from public.payment_installments
    where finance_account_id = '68400000-0000-0000-0000-000000000001' and is_deleted = false;
  if v_fa_primary_installments <> 3 then
    raise exception 'FALHOU (4d): fa_a_primary deveria ter 3 parcelas (2 originais + 1 migrada), tem %', v_fa_primary_installments;
  end if;

  -- Categoria 2: parcela PREVISTO removida, a PAGA continua.
  select is_deleted into v_pi_dedupe_deleted from public.payment_installments where id = '68500000-0000-0000-0000-000000000005';
  if v_pi_dedupe_deleted <> true then
    raise exception 'FALHOU (4e): parcela duplicada (previsto) deveria ter sido soft-deletada';
  end if;

  select status::text into v_pi_primary_status from public.payment_installments where id = '68500000-0000-0000-0000-000000000004';
  if v_pi_primary_status <> 'pago' then
    raise exception 'FALHOU (4f): parcela paga (primária) deveria continuar ativa/paga, status=%', v_pi_primary_status;
  end if;

  -- Categoria 3a+3b: mesma linha corrigida nos dois campos.
  select * into v_incons1 from public.payment_installments where id = '68500000-0000-0000-0000-000000000006';
  if v_incons1.data_pagamento is null then
    raise exception 'FALHOU (4g): data_pagamento deveria ter sido preenchida';
  end if;
  if v_incons1.valor_pago <> 500.00 then
    raise exception 'FALHOU (4h): valor_pago deveria ter sido copiado de valor_previsto (500.00), veio %', v_incons1.valor_pago;
  end if;

  -- Categoria 3c.
  select * into v_incons2 from public.payment_installments where id = '68500000-0000-0000-0000-000000000007';
  if v_incons2.valor_pago <> 0 then
    raise exception 'FALHOU (4i): valor_pago deveria ter sido zerado (status != pago), veio %', v_incons2.valor_pago;
  end if;

  -- Categoria 4: parcela vencida marcada como em_atraso.
  select status::text into v_overdue_status from public.payment_installments where id = '68500000-0000-0000-0000-000000000008';
  if v_overdue_status <> 'em_atraso' then
    raise exception 'FALHOU (4j): parcela vencida deveria estar em_atraso, está %', v_overdue_status;
  end if;

  -- 2 finance_events novos: 1 do merge de carteira, 1 do dedupe de parcela.
  select count(*) into v_events_a_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000a';
  if v_events_a_count <> 2 then
    raise exception 'FALHOU (4k): tenant A deveria ter exatamente 2 finance_events (merge + dedupe), tem %', v_events_a_count;
  end if;

  select count(*) into v_merge_event_count from public.finance_events
    where tenant_id = '68000000-0000-0000-0000-00000000000a'
      and finance_account_id = '68400000-0000-0000-0000-000000000001'
      and tipo_evento = 'observacao'
      and installment_id is null;
  if v_merge_event_count <> 1 then
    raise exception 'FALHOU (4l): evento de merge de carteira não encontrado/formato inesperado, achou %', v_merge_event_count;
  end if;

  select count(*) into v_dedupe_event_count from public.finance_events
    where tenant_id = '68000000-0000-0000-0000-00000000000a'
      and tipo_evento = 'observacao'
      and installment_id = '68500000-0000-0000-0000-000000000004';
  if v_dedupe_event_count <> 1 then
    raise exception 'FALHOU (4m): evento de dedupe de parcela não encontrado/formato inesperado, achou %', v_dedupe_event_count;
  end if;

  -- Tenant B permanece exatamente como o TESTE 3 deixou.
  select count(*) into v_events_b_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000b';
  if v_events_b_count <> 1 then
    raise exception 'FALHOU (4n): tenant B NÃO deveria ganhar novo finance_events pela chamada de admin_a, tem %', v_events_b_count;
  end if;

  select is_deleted into v_fa_b_dup_deleted from public.finance_accounts where id = '68400000-0000-0000-0000-00000000000c';
  if v_fa_b_dup_deleted <> true then
    raise exception 'FALHOU (4o): fa_b_dup deveria continuar soft-deletada (estado do TESTE 3), veio %', v_fa_b_dup_deleted;
  end if;
end $$;

-- =======================================================================
-- TESTE 5: dry_run=true (admin_a) de novo, após a correção -- todas as
-- contagens do tenant A voltam a zero.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000a0001","tenant_id":"68000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.run_finance_checkup(true) into v_result;

  if (v_result->'summary'->>'duplicate_wallets')::int <> 0
     or (v_result->'summary'->>'duplicate_installments')::int <> 0
     or (v_result->'summary'->>'missing_payment_date')::int <> 0
     or (v_result->'summary'->>'zero_valor_pago_on_paid')::int <> 0
     or (v_result->'summary'->>'nonzero_valor_pago_on_unpaid')::int <> 0
     or (v_result->'summary'->>'overdue_not_marked')::int <> 0 then
    raise exception 'FALHOU (5a): após a correção, todas as contagens do tenant A deveriam ser 0, veio %', v_result->'summary';
  end if;
end $$;

reset role;

-- Confirma que este segundo dry_run não criou mais nada.
do $$
declare v_events_a_count int;
begin
  select count(*) into v_events_a_count from public.finance_events where tenant_id = '68000000-0000-0000-0000-00000000000a';
  if v_events_a_count <> 2 then
    raise exception 'FALHOU (5b): dry_run repetido não deveria criar novo finance_events, contagem mudou para %', v_events_a_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 6: comercial_a (mesmo tenant, tenant_role != admin) NÃO consegue
-- chamar a função, nem em dry_run.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000a0002","tenant_id":"68000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.run_finance_checkup(true);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (6a): tenant_role=comercial conseguiu chamar run_finance_checkup -- checagem interna de admin não está barrando';
  end if;
end $$;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.run_finance_checkup(false);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (6b): tenant_role=comercial conseguiu chamar run_finance_checkup(false) -- checagem interna de admin não está barrando';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 7: usuário autenticado SEM tenant_id no claim NÃO consegue chamar
-- a função.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"68000000-0000-0000-0000-0000000a0003","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.run_finance_checkup(true);
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (7): usuário sem tenant_id no claim conseguiu chamar run_finance_checkup';
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 8: grants -- `anon` nunca tem EXECUTE, só `authenticated`.
-- =======================================================================

do $$
declare
  v_anon_can_execute boolean;
  v_authenticated_can_execute boolean;
begin
  select has_function_privilege('anon', 'public.run_finance_checkup(boolean)', 'execute') into v_anon_can_execute;
  select has_function_privilege('authenticated', 'public.run_finance_checkup(boolean)', 'execute') into v_authenticated_can_execute;

  if v_anon_can_execute then
    raise exception 'FALHOU (8a): anon NÃO deveria ter EXECUTE em run_finance_checkup';
  end if;

  if not v_authenticated_can_execute then
    raise exception 'FALHOU (8b): authenticated deveria ter EXECUTE em run_finance_checkup';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Se chegou até aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE run_finance_checkup PASSARAM (0068)' as resultado;

-- Desfaz TUDO -- nenhum dado sintético de teste fica no banco.
rollback;
