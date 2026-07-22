-- 0029_commission_transactional_rpcs.sql (teste)
-- Teste das 4 funcoes introduzidas em
-- supabase/migrations/0029_commission_transactional_rpcs.sql:
-- `create_commission_adjustment`, `register_commission_payment`,
-- `update_commission_payment`, `delete_commission_payment`.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0018_update_deal_stage_rpc.sql: rodado
-- via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0029_commission_transactional_rpcs.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0029_commission_transactional_rpcs.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer assercao que falhe faz `raise exception`, abortando a transacao
-- inteira (o que por sua vez teria feito o rollback de qualquer forma --
-- o `rollback;` explicito no fim so cobre o caminho feliz).
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0002/0010/0017/0018/0027.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. create_commission_adjustment grava o ajuste e recalcula gross_value/
--    saldo corretamente para os 3 tipos (desconto diminui, acrescimo/bonus
--    aumentam).
-- 2. register_commission_payment recalcula total_pago/saldo/status e
--    bloqueia valor acima do saldo disponivel.
-- 3. update_commission_payment recalcula corretamente devolvendo o valor
--    antigo do pagamento antes de validar o novo.
-- 4. delete_commission_payment recalcula e reverte status para 'a_pagar'
--    quando aplicavel.
-- 5. Qualquer uma das 4 falha com is_finalizada = true.
-- 6. Atomicidade: forcando uma falha no meio de register_commission_payment
--    (revogando temporariamente o privilegio de UPDATE em `commissions` de
--    `authenticated`, igual ao teste de update_deal_stage em 0018),
--    confirma-se que a comissao NAO fica com saldo desatualizado -- nem o
--    INSERT em commission_payments fica gravado -- rollback automatico da
--    funcao inteira. Esse e o ponto central do achado de atomicidade que
--    esta migration corrige.

begin;

-- ---------------------------------------------------------------------
-- Setup: um tenant, um usuario 'comercial' (autorizado), um usuario
-- 'cliente' (sem policy nas 3 tabelas envolvidas), um projeto, uma unit, um
-- client, um broker, um deal, e 3 commissions (uma para cada trilha de
-- teste: ajustes, pagamentos/atomicidade, is_finalizada).
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('e1111111-1111-1111-1111-111111111111'), -- user_comercial: tenant, comercial
  ('e2222222-2222-2222-2222-222222222222'); -- user_cliente: tenant, cliente

insert into public.tenants (id, name, slug) values
  ('b9111111-1111-1111-1111-111111111111', 'Tenant - teste commission rpcs 0029', 'tenant-teste-commission-rpcs-0029');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('b9111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('b9111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222', 'cliente', 'active');

insert into public.projects (id, tenant_id, code, name)
values
  ('b9222222-2222-2222-2222-222222222222', 'b9111111-1111-1111-1111-111111111111', 'PRJ-0029', 'Projeto teste 0029');

-- 3 units (uma por commission -- deals_tenant_id_unit_id_active_uidx so
-- permite 1 deal ativo por unit, e commissions_tenant_id_deal_id_uidx so
-- permite 1 commission ativa por deal, entao cada trilha de teste precisa
-- do proprio par unit/deal).
insert into public.units (id, tenant_id, project_id, sku, list_price, status)
values
  ('b9333333-3333-3333-3333-333333333333', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0029-A', 200000, 'vendida'),
  ('b9333333-3333-3333-3333-333333333334', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0029-B', 200000, 'vendida'),
  ('b9333333-3333-3333-3333-333333333335', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'UN-0029-C', 200000, 'vendida');

insert into public.clients (id, tenant_id, name)
values
  ('b9444444-4444-4444-4444-444444444444', 'b9111111-1111-1111-1111-111111111111', 'Cliente teste 0029');

insert into public.brokers (id, tenant_id, name, commission_rate)
values
  ('b9555555-5555-5555-5555-555555555555', 'b9111111-1111-1111-1111-111111111111', 'Corretor teste 0029', 0.05);

insert into public.deals (id, tenant_id, project_id, client_id, unit_id, broker_id, sales_stage, is_active)
values
  ('b9666666-6666-6666-6666-666666666666', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9444444-4444-4444-4444-444444444444', 'b9333333-3333-3333-3333-333333333333', 'b9555555-5555-5555-5555-555555555555', 'vendido', true),
  ('b9666666-6666-6666-6666-666666666667', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9444444-4444-4444-4444-444444444444', 'b9333333-3333-3333-3333-333333333334', 'b9555555-5555-5555-5555-555555555555', 'vendido', true),
  ('b9666666-6666-6666-6666-666666666668', 'b9111111-1111-1111-1111-111111111111', 'b9222222-2222-2222-2222-222222222222', 'b9444444-4444-4444-4444-444444444444', 'b9333333-3333-3333-3333-333333333335', 'b9555555-5555-5555-5555-555555555555', 'vendido', true);

-- commission A: usada nos testes 1 (ajustes) e 2/3/4 (pagamentos) --
-- base_value 10000, sem gross_value ainda (fallback = base_value).
insert into public.commissions (id, tenant_id, broker_id, deal_id, unit_id, project_id, base_value, status)
values
  ('b9777777-7777-7777-7777-777777777777', 'b9111111-1111-1111-1111-111111111111', 'b9555555-5555-5555-5555-555555555555', 'b9666666-6666-6666-6666-666666666666', 'b9333333-3333-3333-3333-333333333333', 'b9222222-2222-2222-2222-222222222222', 10000, 'a_pagar');

-- commission B: usada no teste 5 (is_finalizada trava as 4 funcoes).
insert into public.commissions (id, tenant_id, broker_id, deal_id, unit_id, project_id, base_value, status, is_finalizada, finalized_at)
values
  ('b9888888-8888-8888-8888-888888888888', 'b9111111-1111-1111-1111-111111111111', 'b9555555-5555-5555-5555-555555555555', 'b9666666-6666-6666-6666-666666666667', 'b9333333-3333-3333-3333-333333333334', 'b9222222-2222-2222-2222-222222222222', 10000, 'pago', true, now());

-- commission C: usada no teste 6 (atomicidade -- falha no meio de
-- register_commission_payment).
insert into public.commissions (id, tenant_id, broker_id, deal_id, unit_id, project_id, base_value, status)
values
  ('b9999999-9999-9999-9999-999999999999', 'b9111111-1111-1111-1111-111111111111', 'b9555555-5555-5555-5555-555555555555', 'b9666666-6666-6666-6666-666666666668', 'b9333333-3333-3333-3333-333333333335', 'b9222222-2222-2222-2222-222222222222', 10000, 'a_pagar');

-- ---------------------------------------------------------------------
-- TESTE 1: create_commission_adjustment -- 3 tipos, sinal correto.
-- commission A: base_value = 10000.
--   1a. bonus   +500  -> gross_value = 10500, saldo = 10500
--   1b. acrescimo +300 -> gross_value = 10800, saldo = 10800
--   1c. desconto  -200 -> gross_value = 10600, saldo = 10600
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_adjustment public.commission_adjustments;
  v_commission public.commissions;
begin
  -- 1a. bonus.
  select * into v_adjustment from public.create_commission_adjustment(
    'b9777777-7777-7777-7777-777777777777'::uuid,
    'bonus'::commission_adjustment_type,
    500,
    'Bônus de meta',
    null,
    null
  );

  if v_adjustment.type <> 'bonus' or v_adjustment.amount <> 500 then
    raise exception 'FALHOU (1a-adj): ajuste gravado incorretamente (type=%, amount=%)', v_adjustment.type, v_adjustment.amount;
  end if;

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.gross_value <> 10500 or v_commission.saldo <> 10500 then
    raise exception 'FALHOU (1a-comm): esperava gross_value=10500/saldo=10500 apos bonus, achou gross_value=%/saldo=%', v_commission.gross_value, v_commission.saldo;
  end if;

  -- 1b. acrescimo.
  perform public.create_commission_adjustment(
    'b9777777-7777-7777-7777-777777777777'::uuid,
    'acrescimo'::commission_adjustment_type,
    300,
    'Acréscimo negociado',
    null,
    null
  );

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.gross_value <> 10800 or v_commission.saldo <> 10800 then
    raise exception 'FALHOU (1b-comm): esperava gross_value=10800/saldo=10800 apos acrescimo, achou gross_value=%/saldo=%', v_commission.gross_value, v_commission.saldo;
  end if;

  -- 1c. desconto -- diminui.
  perform public.create_commission_adjustment(
    'b9777777-7777-7777-7777-777777777777'::uuid,
    'desconto'::commission_adjustment_type,
    200,
    'Desconto comercial',
    'https://exemplo.com/comprovante.pdf',
    'comprovante.pdf'
  );

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.gross_value <> 10600 or v_commission.saldo <> 10600 then
    raise exception 'FALHOU (1c-comm): esperava gross_value=10600/saldo=10600 apos desconto, achou gross_value=%/saldo=%', v_commission.gross_value, v_commission.saldo;
  end if;

  -- 1d. anexo gravado corretamente quando attachment_url informado.
  if not exists (
    select 1 from public.commission_adjustments
    where commission_id = 'b9777777-7777-7777-7777-777777777777'
      and type = 'desconto'
      and attachment_url = 'https://exemplo.com/comprovante.pdf'
      and attachment_uploaded_at is not null
      and attachment_uploaded_by_user_id = 'e1111111-1111-1111-1111-111111111111'
  ) then
    raise exception 'FALHOU (1d): ajuste de desconto deveria ter attachment_url/attachment_uploaded_at/attachment_uploaded_by_user_id preenchidos';
  end if;

  if (select count(*) from public.commission_adjustments where commission_id = 'b9777777-7777-7777-7777-777777777777') <> 3 then
    raise exception 'FALHOU (1e): esperava exatamente 3 ajustes gravados para a commission A';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: register_commission_payment -- recalcula total_pago/saldo/
-- status e bloqueia valor acima do saldo disponivel.
-- commission A apos teste 1: gross_value = 10600, saldo = 10600,
-- total_pago = 0, status = 'a_pagar'.
--   2a. pagamento de 6000 -> total_pago=6000, saldo=4600, status
--       permanece 'a_pagar' (nao zerou).
--   2b. tentativa de pagar 5000 (> saldo disponivel 4600) -> deve falhar,
--       sem alterar nada.
--   2c. pagamento de 4600 -> total_pago=10600, saldo=0, status='pago'.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_payment public.commission_payments;
  v_commission public.commissions;
  v_call_ok boolean := false;
begin
  -- 2a.
  select * into v_payment from public.register_commission_payment(
    'b9777777-7777-7777-7777-777777777777'::uuid,
    6000,
    current_date,
    'PIX',
    'ref-0029-a',
    null,
    'Primeira parcela'
  );

  if v_payment.valor_pago <> 6000 then
    raise exception 'FALHOU (2a-pay): pagamento gravado com valor errado, %', v_payment.valor_pago;
  end if;

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 6000 or v_commission.saldo <> 4600 or v_commission.status <> 'a_pagar' then
    raise exception 'FALHOU (2a-comm): esperava total_pago=6000/saldo=4600/status=a_pagar, achou total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;

  -- 2b. valor acima do saldo disponivel -- deve falhar.
  begin
    perform public.register_commission_payment(
      'b9777777-7777-7777-7777-777777777777'::uuid,
      5000,
      current_date,
      'PIX',
      'ref-0029-b',
      null,
      null
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;

  if v_call_ok then
    raise exception 'FALHOU (2b): register_commission_payment deveria ter bloqueado valor acima do saldo disponivel';
  end if;

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 6000 or v_commission.saldo <> 4600 then
    raise exception 'FALHOU (2b-comm): a tentativa bloqueada nao deveria ter alterado total_pago/saldo, achou total_pago=%/saldo=%', v_commission.total_pago, v_commission.saldo;
  end if;

  if (select count(*) from public.commission_payments where commission_id = 'b9777777-7777-7777-7777-777777777777') <> 1 then
    raise exception 'FALHOU (2b-count): a tentativa bloqueada nao deveria ter inserido um segundo pagamento';
  end if;

  -- 2c. zera o saldo -- status vira 'pago'.
  perform public.register_commission_payment(
    'b9777777-7777-7777-7777-777777777777'::uuid,
    4600,
    current_date,
    'TED',
    'ref-0029-c',
    null,
    'Quitação'
  );

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 10600 or v_commission.saldo <> 0 or v_commission.status <> 'pago' then
    raise exception 'FALHOU (2c-comm): esperava total_pago=10600/saldo=0/status=pago, achou total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: update_commission_payment -- recalcula devolvendo o valor
-- antigo antes de validar o novo. commission A apos teste 2: total_pago =
-- 10600, saldo = 0, status = 'pago' (2 pagamentos: 6000 e 4600).
--   3a. edita o pagamento de 4600 para 3000 -> devolve 4600 (saldo
--       disponivel provisorio = 0 + 4600 = 4600), aceita 3000 (< 4600),
--       total_pago = 6000 + 3000 = 9000, saldo = 1600, status volta para
--       'a_pagar' (nao zera mais -- SEMPRE recai para a_pagar, diferente
--       de register_commission_payment).
--   3b. tentativa de editar o mesmo pagamento para 5000 (saldo disponivel
--       provisorio = 1600 + 3000 = 4600, 5000 > 4600) -> deve falhar.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_payment_id uuid;
  v_payment public.commission_payments;
  v_commission public.commissions;
  v_call_ok boolean := false;
begin
  select id into v_payment_id from public.commission_payments
    where commission_id = 'b9777777-7777-7777-7777-777777777777' and payment_reference = 'ref-0029-c';

  -- 3a.
  select * into v_payment from public.update_commission_payment(
    v_payment_id,
    3000,
    current_date,
    'TED',
    'ref-0029-c-editado',
    null,
    'Quitação editada'
  );

  if v_payment.valor_pago <> 3000 or v_payment.payment_reference <> 'ref-0029-c-editado' then
    raise exception 'FALHOU (3a-pay): pagamento nao foi editado corretamente (valor_pago=%, payment_reference=%)', v_payment.valor_pago, v_payment.payment_reference;
  end if;

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 9000 or v_commission.saldo <> 1600 or v_commission.status <> 'a_pagar' then
    raise exception 'FALHOU (3a-comm): esperava total_pago=9000/saldo=1600/status=a_pagar, achou total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;

  -- 3b. valor acima do saldo disponivel provisorio -- deve falhar.
  begin
    perform public.update_commission_payment(
      v_payment_id,
      5000,
      current_date,
      'TED',
      'ref-0029-c-invalida',
      null,
      null
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;

  if v_call_ok then
    raise exception 'FALHOU (3b): update_commission_payment deveria ter bloqueado valor acima do saldo disponivel';
  end if;

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 9000 or v_commission.saldo <> 1600 then
    raise exception 'FALHOU (3b-comm): a tentativa bloqueada nao deveria ter alterado total_pago/saldo, achou total_pago=%/saldo=%', v_commission.total_pago, v_commission.saldo;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: delete_commission_payment -- recalcula e reverte status para
-- 'a_pagar' quando aplicavel. commission A apos teste 3: total_pago =
-- 9000, saldo = 1600, status = 'a_pagar' (pagamentos: 6000 e 3000).
--   4a. exclui o pagamento de 3000 -> total_pago = 6000, saldo = 4600,
--       status continua 'a_pagar' (saldo > 0.01).
--   4b. exclui o pagamento de 6000 -> total_pago = 0, saldo = 10600,
--       status continua 'a_pagar' (saldo > 0.01) -- confirma o `else
--       'pago'` do caso contrario nao dispara incorretamente aqui.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_payment_id_c uuid;
  v_payment_id_a uuid;
  v_commission public.commissions;
begin
  select id into v_payment_id_c from public.commission_payments
    where commission_id = 'b9777777-7777-7777-7777-777777777777' and payment_reference = 'ref-0029-c-editado';
  select id into v_payment_id_a from public.commission_payments
    where commission_id = 'b9777777-7777-7777-7777-777777777777' and payment_reference = 'ref-0029-a';

  -- 4a.
  perform public.delete_commission_payment(v_payment_id_c);

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 6000 or v_commission.saldo <> 4600 or v_commission.status <> 'a_pagar' then
    raise exception 'FALHOU (4a-comm): esperava total_pago=6000/saldo=4600/status=a_pagar, achou total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;

  if not exists (select 1 from public.commission_payments where id = v_payment_id_c and is_deleted = true and deleted_at is not null and deleted_by_user_id = 'e1111111-1111-1111-1111-111111111111') then
    raise exception 'FALHOU (4a-flags): pagamento excluido deveria ter is_deleted/deleted_at/deleted_by_user_id preenchidos';
  end if;

  -- 4b.
  perform public.delete_commission_payment(v_payment_id_a);

  select * into v_commission from public.commissions where id = 'b9777777-7777-7777-7777-777777777777';
  if v_commission.total_pago <> 0 or v_commission.saldo <> 10600 or v_commission.status <> 'a_pagar' then
    raise exception 'FALHOU (4b-comm): esperava total_pago=0/saldo=10600/status=a_pagar, achou total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: is_finalizada trava as 4 funcoes. commission B foi criada com
-- is_finalizada = true.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_payment_id uuid;
  v_call_ok boolean;
begin
  -- 5a. create_commission_adjustment.
  v_call_ok := true;
  begin
    perform public.create_commission_adjustment('b9888888-8888-8888-8888-888888888888'::uuid, 'bonus'::commission_adjustment_type, 100, 'teste', null, null);
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5a): create_commission_adjustment deveria ter sido bloqueada por is_finalizada';
  end if;

  -- 5b. register_commission_payment.
  v_call_ok := true;
  begin
    perform public.register_commission_payment('b9888888-8888-8888-8888-888888888888'::uuid, 100, current_date, null, null, null, null);
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5b): register_commission_payment deveria ter sido bloqueada por is_finalizada';
  end if;

  -- Para testar update/delete precisamos de um pagamento existente --
  -- insere direto via SQL (fora das RPCs, contornando a trava de
  -- is_finalizada de proposito, so para ter uma linha para tentar
  -- editar/excluir).
  insert into public.commission_payments (id, tenant_id, commission_id, valor_pago, data_pagamento, created_by_user_id, updated_by_user_id)
  values ('b9aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b9111111-1111-1111-1111-111111111111', 'b9888888-8888-8888-8888-888888888888', 500, current_date, 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111')
  returning id into v_payment_id;

  -- 5c. update_commission_payment.
  v_call_ok := true;
  begin
    perform public.update_commission_payment(v_payment_id, 400, current_date, null, null, null, null);
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5c): update_commission_payment deveria ter sido bloqueada por is_finalizada';
  end if;

  -- 5d. delete_commission_payment.
  v_call_ok := true;
  begin
    perform public.delete_commission_payment(v_payment_id);
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (5d): delete_commission_payment deveria ter sido bloqueada por is_finalizada';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: atomicidade -- forca uma falha no meio de
-- register_commission_payment (revoga temporariamente o UPDATE em
-- `commissions` de `authenticated`, DDL transacional -- desfeito pelo
-- rollback no fim do script) e confirma que NEM o INSERT em
-- commission_payments (passo anterior ao UPDATE que falha) fica gravado --
-- rollback automatico da funcao inteira. Esse e o ponto central do achado
-- de atomicidade que esta migration corrige: antes, feito via 2 chamadas
-- separadas do client Supabase, o INSERT em commission_payments teria sido
-- gravado mesmo com o UPDATE em commissions falhando em seguida, deixando
-- o saldo da comissao desatualizado (pagamento registrado sem refletir no
-- saldo/total_pago).
-- ---------------------------------------------------------------------

revoke update on table public.commissions from authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"e1111111-1111-1111-1111-111111111111","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    -- commission C: base_value = 10000, sem pagamentos ainda. O INSERT em
    -- commission_payments (passo 4 da funcao) roda com sucesso; o UPDATE
    -- em commissions (passo 6, sem privilegio -- revogado acima) falha com
    -- "permission denied".
    perform public.register_commission_payment(
      'b9999999-9999-9999-9999-999999999999'::uuid,
      3000,
      current_date,
      'PIX',
      'ref-0029-atomicidade',
      null,
      'Tentativa que deve falhar no meio'
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (6a): register_commission_payment deveria ter falhado (UPDATE em commissions sem privilegio), mas retornou sucesso';
  end if;
end $$;

reset role;
grant update on table public.commissions to authenticated;

do $$
declare
  v_commission public.commissions;
  v_payment_count int;
begin
  -- commission C deveria continuar EXATAMENTE como foi criada -- total_pago
  -- = 0, saldo = 0 (default), status = 'a_pagar' -- SEM nenhum resquicio da
  -- tentativa de pagamento que falhou no meio.
  select * into v_commission from public.commissions where id = 'b9999999-9999-9999-9999-999999999999';
  if v_commission.total_pago <> 0 or v_commission.saldo <> 0 or v_commission.status <> 'a_pagar' then
    raise exception 'FALHOU (6b): commission C deveria continuar com total_pago=0/saldo=0/status=a_pagar apos a falha no meio (rollback automatico) -- total_pago=%/saldo=%/status=%',
      v_commission.total_pago, v_commission.saldo, v_commission.status;
  end if;

  -- Nenhum commission_payment gravado -- o INSERT que rodou com sucesso
  -- dentro da funcao foi desfeito junto com o UPDATE que falhou depois,
  -- porque toda a function e uma unica transacao atomica.
  select count(*) into v_payment_count from public.commission_payments
    where commission_id = 'b9999999-9999-9999-9999-999999999999';
  if v_payment_count <> 0 then
    raise exception 'FALHOU (6c): nenhum commission_payment deveria ter sido gravado pela tentativa que falhou no meio (isso e o proprio achado de atomicidade que 0029 corrige) -- achou %', v_payment_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 7 (bonus, RLS): 'cliente' do tenant certo (sem policy nas 3
-- tabelas envolvidas) NAO consegue completar nenhuma chamada -- confirma
-- que as funcoes (sem security definer) nao bypassam RLS.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e2222222-2222-2222-2222-222222222222","tenant_id":"b9111111-1111-1111-1111-111111111111","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.register_commission_payment(
      'b9999999-9999-9999-9999-999999999999'::uuid,
      100,
      current_date,
      null, null, null, null
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (7): tenant_role=cliente conseguiu chamar register_commission_payment com sucesso -- RLS interna nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE commission_transactional_rpcs PASSARAM (0029)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
