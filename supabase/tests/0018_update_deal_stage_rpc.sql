-- 0018_update_deal_stage_rpc.sql (teste)
-- Teste da funcao `public.update_deal_stage` introduzida em
-- supabase/migrations/0018_update_deal_stage_rpc.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql,
-- supabase/tests/0010_catalog_isolation.sql e
-- supabase/tests/0017_crm_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0018_update_deal_stage_rpc.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0018_update_deal_stage_rpc.sql`.
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
-- requisicao autenticada -- igual ao padrao de 0002/0010/0017.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Um usuario 'comercial' do tenant certo, chamando update_deal_stage
--    para mover um deal de 'reservado' para 'vendido': o deal reflete o
--    novo sales_stage/is_active/sold_at, a unit vinculada vira 'vendida', a
--    status_transitions grava from/to corretos, e uma activities e criada
--    (so porque o destino e 'vendido').
-- 2. Mover um deal para 'perdido' NAO cria activities (so vendido cria) e
--    grava lost_reason com a nota informada.
-- 3. Um usuario 'cliente' do tenant certo (papel sem policy de UPDATE/
--    INSERT nas 4 tabelas envolvidas) NAO consegue completar a chamada --
--    a RLS interna barra, confirmando que a funcao nao bypassa RLS (sem
--    security definer).
-- 4. Forcando uma falha no meio da funcao -- como deals.unit_id e
--    deals.client_id tem FK enforced contra units/clients (o proprio
--    schema ja impede o cenario "unit_id inexistente" sugerido como
--    exemplo, porque nao daria pra gravar um deal/chamar a funcao com uma
--    referencia invalida em primeiro lugar), o jeito confiavel de simular
--    "o passo 5/6 falha depois do passo 4 (update em deals) ja ter
--    rodado" e revogar temporariamente o privilegio de INSERT em
--    `activities` de `authenticated` (revoke e transacional -- desfeito
--    pelo rollback no fim do script, junto com todo o resto). A funcao
--    chega a atualizar `deals` (passo 4) e `units` (passo 5) com sucesso,
--    falha no INSERT de `activities` (passo 7, so acontece quando o
--    destino e 'vendido') com "permission denied" -- e o teste confirma
--    que NADA disso fica gravado: nem deals, nem units, nem
--    status_transitions -- rollback automatico da funcao inteira (o ponto
--    central do achado de atomicidade que 0018 corrige).

begin;

-- ---------------------------------------------------------------------
-- Setup: um tenant, um usuario 'comercial' (autorizado), um usuario
-- 'cliente' (sem policy de update/insert nas tabelas envolvidas), um
-- projeto, duas units, um client, dois deals (um para o caminho feliz de
-- 'vendido', outro para 'perdido' e para o teste de falha no meio).
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('f1111111-1111-1111-1111-111111111111'), -- user_comercial: tenant, comercial
  ('f2222222-2222-2222-2222-222222222222'); -- user_cliente: tenant, cliente

insert into public.tenants (id, name, slug) values
  ('a9111111-1111-1111-1111-111111111111', 'Tenant - teste update_deal_stage 0018', 'tenant-teste-update-deal-stage-0018');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('a9111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('a9111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 'cliente', 'active');

insert into public.projects (id, tenant_id, code, name)
values
  ('c9111111-1111-1111-1111-111111111111', 'a9111111-1111-1111-1111-111111111111', 'PRJ-0018', 'Projeto teste 0018');

insert into public.units (id, tenant_id, project_id, sku, list_price, status)
values
  ('c9222222-2222-2222-2222-222222222222', 'a9111111-1111-1111-1111-111111111111', 'c9111111-1111-1111-1111-111111111111', 'UN-0018-A', 100000, 'reservada'),
  ('c9333333-3333-3333-3333-333333333333', 'a9111111-1111-1111-1111-111111111111', 'c9111111-1111-1111-1111-111111111111', 'UN-0018-B', 100000, 'reservada');

insert into public.clients (id, tenant_id, name)
values
  ('c9444444-4444-4444-4444-444444444444', 'a9111111-1111-1111-1111-111111111111', 'Cliente teste 0018');

insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage, is_active)
values
  ('c9555555-5555-5555-5555-555555555555', 'a9111111-1111-1111-1111-111111111111', 'c9111111-1111-1111-1111-111111111111', 'c9444444-4444-4444-4444-444444444444', 'c9222222-2222-2222-2222-222222222222', 'reservado', true),
  ('c9666666-6666-6666-6666-666666666666', 'a9111111-1111-1111-1111-111111111111', 'c9111111-1111-1111-1111-111111111111', 'c9444444-4444-4444-4444-444444444444', 'c9333333-3333-3333-3333-333333333333', 'reservado', true);

-- ---------------------------------------------------------------------
-- TESTE 1: comercial move o deal A de 'reservado' para 'vendido'.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1111111-1111-1111-1111-111111111111","tenant_id":"a9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_deal public.deals;
  v_unit_status unit_status;
  v_transition_count int;
  v_activity_count int;
  v_transition public.status_transitions;
begin
  select * into v_deal from public.update_deal_stage(
    'c9555555-5555-5555-5555-555555555555'::uuid,
    'vendido'::deal_sales_stage,
    'Assinatura do contrato concluída'
  );

  if v_deal.sales_stage <> 'vendido' or v_deal.is_active <> true or v_deal.sold_at is null then
    raise exception 'FALHOU (1a): deal deveria estar vendido/ativo/com sold_at preenchido (sales_stage=%, is_active=%, sold_at=%)',
      v_deal.sales_stage, v_deal.is_active, v_deal.sold_at;
  end if;

  select status into v_unit_status from public.units where id = 'c9222222-2222-2222-2222-222222222222';
  if v_unit_status <> 'vendida' then
    raise exception 'FALHOU (1b): unit deveria estar vendida, esta %', v_unit_status;
  end if;

  select count(*) into v_transition_count from public.status_transitions
    where deal_id = 'c9555555-5555-5555-5555-555555555555';
  if v_transition_count <> 1 then
    raise exception 'FALHOU (1c): esperava exatamente 1 status_transition para o deal, achou %', v_transition_count;
  end if;

  select * into v_transition from public.status_transitions
    where deal_id = 'c9555555-5555-5555-5555-555555555555';
  if v_transition.from_status <> 'reservado' or v_transition.to_status <> 'vendido' or v_transition.transition_type <> 'comercial' then
    raise exception 'FALHOU (1d): status_transition com from/to/type errados (from=%, to=%, type=%)',
      v_transition.from_status, v_transition.to_status, v_transition.transition_type;
  end if;

  select count(*) into v_activity_count from public.activities
    where deal_id = 'c9555555-5555-5555-5555-555555555555';
  if v_activity_count <> 1 then
    raise exception 'FALHOU (1e): esperava exatamente 1 activity criada ao marcar como vendido, achou %', v_activity_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: comercial move o deal B de 'reservado' para 'perdido' -- NAO
-- cria activities, grava lost_reason, unit volta para disponivel.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1111111-1111-1111-1111-111111111111","tenant_id":"a9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_deal public.deals;
  v_unit_status unit_status;
  v_activity_count int;
begin
  select * into v_deal from public.update_deal_stage(
    'c9666666-6666-6666-6666-666666666666'::uuid,
    'perdido'::deal_sales_stage,
    'Cliente desistiu'
  );

  if v_deal.sales_stage <> 'perdido' or v_deal.is_active <> false or v_deal.lost_reason <> 'Cliente desistiu' then
    raise exception 'FALHOU (2a): deal deveria estar perdido/inativo/com lost_reason (sales_stage=%, is_active=%, lost_reason=%)',
      v_deal.sales_stage, v_deal.is_active, v_deal.lost_reason;
  end if;

  select status into v_unit_status from public.units where id = 'c9333333-3333-3333-3333-333333333333';
  if v_unit_status <> 'disponivel' then
    raise exception 'FALHOU (2b): unit deveria voltar a disponivel, esta %', v_unit_status;
  end if;

  select count(*) into v_activity_count from public.activities
    where deal_id = 'c9666666-6666-6666-6666-666666666666';
  if v_activity_count <> 0 then
    raise exception 'FALHOU (2c): mover para perdido NAO deveria criar activity, achou %', v_activity_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: 'cliente' do tenant certo (sem policy de update/insert nas
-- tabelas envolvidas) NAO consegue completar a chamada -- confirma que a
-- funcao (sem security definer) nao bypassa RLS.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f2222222-2222-2222-2222-222222222222","tenant_id":"a9111111-1111-1111-1111-111111111111","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    perform public.update_deal_stage(
      'c9555555-5555-5555-5555-555555555555'::uuid,
      'proposta'::deal_sales_stage,
      null
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (3): tenant_role=cliente conseguiu chamar update_deal_stage com sucesso -- RLS interna nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- Confirma que a tentativa do teste 3 nao deixou nenhum rastro (RLS barrou
-- antes de qualquer INSERT/UPDATE completar, dentro da mesma chamada).
do $$
declare
  v_deal public.deals;
begin
  select * into v_deal from public.deals where id = 'c9555555-5555-5555-5555-555555555555';
  if v_deal.sales_stage <> 'vendido' then
    raise exception 'FALHOU (3b): deal do teste 1 nao deveria ter sido alterado pela tentativa bloqueada do teste 3, sales_stage=%', v_deal.sales_stage;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 4: atomicidade -- forca uma falha no meio da funcao (unit_id do
-- deal apontando para uma unit que nao existe mais, violando a FK
-- units.id no UPDATE do passo 5) e confirma que a mudanca em `deals` NAO
-- fica gravada -- rollback automatico da funcao inteira. Esse e o ponto
-- central do achado de atomicidade que esta migration corrige: antes,
-- feito via 3-4 chamadas separadas do client Supabase, o UPDATE em deals
-- (passo isolado) teria sido gravado mesmo com o passo seguinte falhando.
-- ---------------------------------------------------------------------

-- Revoga temporariamente o INSERT em activities de `authenticated` (DDL e
-- transacional -- desfeito pelo `rollback` no fim do script). Executado
-- como o role de conexao (dono/postgres), antes de simular a sessao do
-- usuario comercial.
revoke insert on table public.activities from authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"f1111111-1111-1111-1111-111111111111","tenant_id":"a9111111-1111-1111-1111-111111111111","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_call_ok boolean := false;
begin
  begin
    -- deal B esta em 'perdido' (teste 2) -- move para 'vendido', o que
    -- forca o INSERT em activities (passo 7). Sem privilegio de INSERT
    -- nessa tabela (revogado acima), o statement falha com "permission
    -- denied" DEPOIS que os passos 4 (update deals) e 5 (update units) ja
    -- rodaram dentro da mesma chamada de funcao.
    perform public.update_deal_stage(
      'c9666666-6666-6666-6666-666666666666'::uuid,
      'vendido'::deal_sales_stage,
      'Tentativa que deve falhar no meio'
    );
    v_call_ok := true;
  exception when others then v_call_ok := false;
  end;
  if v_call_ok then
    raise exception 'FALHOU (4a): update_deal_stage deveria ter falhado (INSERT em activities sem privilegio), mas retornou sucesso';
  end if;
end $$;

reset role;
grant insert on table public.activities to authenticated;

do $$
declare
  v_deal public.deals;
  v_unit_status unit_status;
  v_transition_count int;
  v_activity_count int;
begin
  -- O deal B deveria continuar exatamente como o teste 2 deixou --
  -- 'perdido', is_active = false -- SEM nenhum resquicio da tentativa de
  -- 'vendido' que falhou no meio.
  select * into v_deal from public.deals where id = 'c9666666-6666-6666-6666-666666666666';
  if v_deal.sales_stage <> 'perdido' or v_deal.is_active <> false then
    raise exception 'FALHOU (4b): deal deveria continuar em perdido/inativo apos a falha no meio (rollback automatico) -- sales_stage=%, is_active=%',
      v_deal.sales_stage, v_deal.is_active;
  end if;

  -- unit tambem deveria continuar disponivel (estado deixado pelo teste 2),
  -- nao 'vendida'.
  select status into v_unit_status from public.units where id = 'c9333333-3333-3333-3333-333333333333';
  if v_unit_status <> 'disponivel' then
    raise exception 'FALHOU (4c): unit nao deveria ter sido alterada pela tentativa que falhou no meio, esta %', v_unit_status;
  end if;

  -- Nenhuma status_transition nova (so a do teste 2, from reservado -> perdido).
  select count(*) into v_transition_count from public.status_transitions
    where deal_id = 'c9666666-6666-6666-6666-666666666666';
  if v_transition_count <> 1 then
    raise exception 'FALHOU (4d): esperava continuar com exatamente 1 status_transition (a do teste 2), achou %', v_transition_count;
  end if;

  -- Nenhuma activity gravada -- o proprio INSERT que falhou nao deixou
  -- rastro.
  select count(*) into v_activity_count from public.activities
    where deal_id = 'c9666666-6666-6666-6666-666666666666';
  if v_activity_count <> 0 then
    raise exception 'FALHOU (4e): nenhuma activity deveria ter sido gravada pela tentativa que falhou no meio, achou %', v_activity_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE update_deal_stage PASSARAM (0018)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
