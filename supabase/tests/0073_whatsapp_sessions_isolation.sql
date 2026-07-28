-- 0073_whatsapp_sessions_isolation.sql
-- Teste de isolamento para a RLS de `whatsapp_sessions` introduzida em
-- supabase/migrations/0073_rls_whatsapp_sessions.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo critério de supabase/tests/0045_investors_isolation.sql: rodado
-- via `supabase db query --linked` (banco remoto já linkado), não via
-- `supabase test db` (pgTAP exige Docker, indisponível neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0073_whatsapp_sessions_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0073_whatsapp_sessions_isolation.sql`.
--
-- SEGURANÇA DO TESTE
-- ------------------
-- Roda inteiro dentro de UMA transação com ROLLBACK no final -- nenhum
-- dado sintético (tenants/tenant_users/auth.users/whatsapp_sessions) fica
-- no banco, mesmo rodando contra o projeto remoto real. Qualquer
-- asserção que falhe faz `raise exception`, abortando a transação
-- inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set
-- local role authenticated` para simular exatamente o que o PostgREST faz
-- numa requisição autenticada -- igual ao padrão de
-- 0032/0036/0039/0040/0045.
--
-- NÃO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS,
-- só deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Confirmado que não existe nenhuma Edge Function desta entidade hoje
-- (nenhum bot de WhatsApp integrado neste repositório -- ver 0072).
-- Auditoria de grants (information_schema.role_table_grants), rodada
-- manualmente após aplicar 0073 contra produção, confirma que
-- `authenticated` tem exatamente `select` em whatsapp_sessions (sem
-- insert/update/delete -- revogados nesta migration por não terem
-- policy correspondente), e `anon` sem NENHUM privilégio.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. 'admin' do tenant A lê exatamente as linhas do próprio tenant, nada
--    do tenant B, e vice-versa ('admin' do tenant B) -- isolamento nos
--    dois sentidos.
-- 2. 'comercial'/'administrativo'/'cliente'/'investidor' do tenant CERTO
--    (mesmo tenant_id no claim) NÃO enxergam NENHUMA linha -- confirma o
--    gate "só admin", mais restrito que investors (0045), onde
--    comercial/administrativo liam.
-- 3. Usuário sem tenant_id no claim (0 vínculos ativos) não vê nenhuma
--    linha, mesmo sendo 'admin' de algum tenant_users que não está ativo
--    no claim (aqui simulado como ausência total do claim, cenário mais
--    comum de "sessão sem tenant" -- órfão).
-- 4. NENHUM papel -- nem mesmo 'admin' -- consegue INSERT/UPDATE/DELETE
--    diretamente na tabela: confirma a decisão de "sem policy de escrita
--    agora" (ver racional completo em 0073_rls_whatsapp_sessions.sql) --
--    o grant de insert/update foi revogado, então mesmo que uma policy
--    fosse adicionada por engano no futuro sem reconceder o grant, a
--    escrita continuaria bloqueada (defesa em profundidade grant+RLS).

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants. No tenant A: admin, comercial, administrativo,
-- cliente, investidor (cobre os 5 papéis). No tenant B: admin (prova
-- isolamento cross-tenant). Mais um usuário órfão, sem tenant_users. IDs
-- fixos com prefixo 'd' para não colidir com prefixos já usados em
-- 0039/0040/0045.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('d1000000-0000-0000-0000-000000000001'), -- user_a_admin
  ('d1000000-0000-0000-0000-000000000002'), -- user_a_comercial
  ('d1000000-0000-0000-0000-000000000003'), -- user_a_administrativo
  ('d1000000-0000-0000-0000-000000000004'), -- user_a_cliente
  ('d1000000-0000-0000-0000-000000000005'), -- user_a_investidor
  ('d1000000-0000-0000-0000-000000000006'), -- user_b_admin
  ('d1000000-0000-0000-0000-000000000007'); -- user_orphan

insert into public.tenants (id, name, slug) values
  ('d2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento whatsapp_sessions 0073', 'tenant-a-teste-isolamento-whatsapp-sessions-0073'),
  ('d2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento whatsapp_sessions 0073', 'tenant-b-teste-isolamento-whatsapp-sessions-0073');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000002', 'comercial', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000003', 'administrativo', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000004', 'cliente', 'active'),
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000005', 'investidor', 'active'),
  ('d2000000-0000-0000-0000-00000000000b', 'd1000000-0000-0000-0000-000000000006', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como
-- dono da tabela (bypassa RLS de propósito aqui só para popular o
-- cenário -- os testes reais de leitura/escrita usam os roles simulados
-- abaixo).

insert into public.whatsapp_sessions (id, tenant_id, phone, flow_type, state, status, last_message_at) values
  ('d3000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', '+5511900000001', 'manutencao', 'aguardando_cpf', 'ativa', now()),
  ('d3000000-0000-0000-0000-00000000000b', 'd2000000-0000-0000-0000-00000000000b', '+5511900000002', 'corretor', 'menu_principal', 'ativa', now());

-- ---------------------------------------------------------------------
-- TESTE 1: 'admin' do tenant A lê exatamente 1 linha (a própria), nada do
-- tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000001","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_own int;
  v_other int;
begin
  select count(*) into v_own from public.whatsapp_sessions;
  if v_own <> 1 then
    raise exception 'FALHOU (1a): admin do tenant A deveria ver exatamente 1 linha (viu %)', v_own;
  end if;

  select count(*) into v_other from public.whatsapp_sessions where tenant_id = 'd2000000-0000-0000-0000-00000000000b';
  if v_other <> 0 then
    raise exception 'FALHOU (1b): admin do tenant A NAO deveria enxergar nenhuma linha do tenant B (viu %)', v_other;
  end if;

  if not exists (select 1 from public.whatsapp_sessions where id = 'd3000000-0000-0000-0000-00000000000a') then
    raise exception 'FALHOU (1c): admin do tenant A deveria ver a propria sessao (id d3...a)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: 'admin' do tenant B -- simétrico ao teste 1, prova isolamento
-- nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000006","tenant_id":"d2000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_own int;
  v_other int;
begin
  select count(*) into v_own from public.whatsapp_sessions;
  if v_own <> 1 then
    raise exception 'FALHOU (2a): admin do tenant B deveria ver exatamente 1 linha (viu %)', v_own;
  end if;

  select count(*) into v_other from public.whatsapp_sessions where tenant_id = 'd2000000-0000-0000-0000-00000000000a';
  if v_other <> 0 then
    raise exception 'FALHOU (2b): admin do tenant B NAO deveria enxergar nenhuma linha do tenant A (viu %)', v_other;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: 'comercial'/'administrativo'/'cliente'/'investidor' do tenant
-- CERTO (mesmo tenant_id no claim) NAO enxergam NENHUMA linha -- gate "so
-- admin", mais restrito que investors (0045).
-- ---------------------------------------------------------------------

do $$
declare
  v_roles text[] := array['comercial', 'administrativo', 'cliente', 'investidor'];
  v_subs text[] := array[
    'd1000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000003',
    'd1000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-000000000005'
  ];
  v_role text;
  v_sub text;
  v_count int;
begin
  for i in 1 .. array_length(v_roles, 1) loop
    v_role := v_roles[i];
    v_sub := v_subs[i];

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', v_sub,
        'tenant_id', 'd2000000-0000-0000-0000-00000000000a',
        'tenant_role', v_role,
        'role', 'authenticated'
      )::text,
      true
    );
    execute 'set local role authenticated';

    execute 'select count(*) from public.whatsapp_sessions' into v_count;

    if v_count <> 0 then
      raise exception 'FALHOU (3-%): tenant_role=% do tenant certo NAO deveria ver NENHUMA linha (viu %)', v_role, v_role, v_count;
    end if;

    execute 'reset role';
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.whatsapp_sessions;
  if v_count <> 0 then
    raise exception 'FALHOU (4): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (viu %)', v_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: NENHUM papel -- nem mesmo 'admin' -- consegue INSERT/UPDATE/
-- DELETE diretamente na tabela (sem policy de escrita, de proposito, e
-- grant de insert/update revogado -- ver 0073_rls_whatsapp_sessions.sql).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-0000-0000-000000000001","tenant_id":"d2000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.whatsapp_sessions (tenant_id, phone, flow_type, status)
    values ('d2000000-0000-0000-0000-00000000000a', '+5511900000099', 'indefinido', 'ativa');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5a): tenant_role=admin conseguiu INSERIR em whatsapp_sessions -- deveria ser bloqueado (sem policy de insert, grant revogado)';
  end if;
end $$;

do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.whatsapp_sessions set status = 'concluida' where id = 'd3000000-0000-0000-0000-00000000000a';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5b): tenant_role=admin conseguiu ATUALIZAR whatsapp_sessions -- deveria ser bloqueado (sem policy de update, grant revogado)';
  end if;
end $$;

do $$
declare v_delete_ok boolean := false;
begin
  begin
    delete from public.whatsapp_sessions where id = 'd3000000-0000-0000-0000-00000000000a';
    v_delete_ok := true;
  exception when others then v_delete_ok := false;
  end;
  if v_delete_ok then
    raise exception 'FALHOU (5c): tenant_role=admin conseguiu DELETAR de whatsapp_sessions -- deveria ser bloqueado (sem grant de delete a authenticated)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou até aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0073 - WhatsApp Sessions)' as resultado;

-- Desfaz TUDO -- nenhum dado sintético de teste fica no banco.
rollback;
