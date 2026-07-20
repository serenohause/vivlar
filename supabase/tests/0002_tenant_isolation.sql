-- 0002_tenant_isolation.sql
-- Teste de isolamento para a RLS de `tenants`/`tenant_users` introduzida em
-- supabase/migrations/0002_rls_tenants_and_claim_hook.sql.
--
-- COMO RODAR
-- ----------
-- Escolha: rodado via `supabase db query --linked` (contra o banco remoto
-- ja linkado), NAO via `supabase test db` (pgTAP). Motivo: `supabase test
-- db` precisa de containers locais (Docker), e este ambiente de dev nao
-- tem Docker instalado/rodando. Se Docker estiver disponivel no seu
-- ambiente, prefira portar este script para pgTAP em
-- `supabase/tests/database/` e rodar `npx supabase test db` -- e a forma
-- nativa da CLI e roda em isolamento total (banco descartavel).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0002_tenant_isolation.sql
--
-- Alternativa local (se voce tiver `psql` e a connection string do
-- projeto): `psql "<connection-string>" -f supabase/tests/0002_tenant_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- O script inteiro roda dentro de UMA transacao com ROLLBACK no final --
-- nao deixa nenhum dado de teste (tenants/tenant_users/auth.users
-- sinteticos) no banco, mesmo rodando contra o projeto remoto real. Se
-- qualquer asserção falhar, o bloco correspondente faz `raise exception`,
-- o que aborta a transacao inteira (== rollback automatico) e a CLI
-- retorna exit code != 0 com a mensagem "FALHOU (...)" no erro.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` +
-- `set local role authenticated` para simular, dentro da mesma sessao
-- Postgres, exatamente o que o PostgREST faz para uma requisicao
-- autenticada: assume o role `authenticated` e injeta os claims do JWT
-- (incluindo o `tenant_id`/`tenant_role` que o custom access token hook
-- adicionaria de verdade em producao). `auth.uid()`/`auth.jwt()` leem
-- justamente esse `current_setting('request.jwt.claims', true)`.
--
-- NAO testamos aqui: bypass de `service_role` -- e assumido por design
-- (service_role tem BYPASSRLS e so deve ser usado dentro de Edge
-- Functions, nunca exposto ao client; ver `.env.local` /
-- `SUPABASE_SERVICE_ROLE_KEY`, que so deve existir server-side).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A nao le linhas de `tenants`/`tenant_users` do Tenant B, e
--    vice-versa (isolamento de SELECT nos dois sentidos).
-- 2. Um usuario sem `tenant_id` no claim (0 vinculos ativos -- o hook
--    propositalmente nao injeta o claim nesse caso) nao enxerga NENHUMA
--    linha em `tenants` nem em `tenant_users`.
-- 3. `WITH CHECK` de INSERT/UPDATE em `tenant_users` de fato bloqueia
--    escrita cross-tenant (nao so o SELECT esta isolado -- a escrita
--    tambem), inclusive quando o `tenant_id` do payload tenta "escapar"
--    do tenant do claim.
-- 4. Um usuario autenticado sem `tenant_role = 'admin'` no claim nao
--    consegue inserir novos `tenant_users`, mesmo dentro do proprio
--    tenant -- prova que o `WITH CHECK` de fato considera o papel, nao so
--    o tenant.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants, um admin em cada, e um usuario "orfao" (sem
-- nenhuma linha em tenant_users -- simula 0 vinculos ativos, o caso em
-- que o hook do JWT nao injeta tenant_id).
-- IDs fixos (nao gen_random_uuid()) para o script inteiro ser SQL puro,
-- sem preciar passar variaveis entre statements via psql/CLI.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), -- user_a: admin do tenant A
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), -- user_b: admin do tenant B
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'); -- user_orphan: sem tenant_users

insert into public.tenants (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Tenant A - teste isolamento 0002', 'tenant-a-teste-isolamento-0002'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B - teste isolamento 0002', 'tenant-b-teste-isolamento-0002');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'active');

-- ---------------------------------------------------------------------
-- TESTE 1: Tenant A (user_a, claim tenant_id = Tenant A) so ve seus
-- proprios dados.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-1111-1111-111111111111","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_tenants_visiveis int;
  v_tenant_users_visiveis int;
  v_linhas_do_tenant_b int;
begin
  select count(*) into v_tenants_visiveis from public.tenants;
  select count(*) into v_tenant_users_visiveis from public.tenant_users;
  select count(*) into v_linhas_do_tenant_b
    from public.tenant_users
    where tenant_id = '22222222-2222-2222-2222-222222222222';

  if v_tenants_visiveis <> 1 then
    raise exception 'FALHOU (1a): tenant A deveria ver exatamente 1 tenant (o proprio), viu %', v_tenants_visiveis;
  end if;

  if v_tenant_users_visiveis <> 1 then
    raise exception 'FALHOU (1b): tenant A deveria ver exatamente 1 linha em tenant_users (a propria), viu %', v_tenant_users_visiveis;
  end if;

  if v_linhas_do_tenant_b <> 0 then
    raise exception 'FALHOU (1c): tenant A NAO deveria enxergar nenhuma linha de tenant_users do tenant B, viu %', v_linhas_do_tenant_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: Tenant B (user_b, claim tenant_id = Tenant B) -- simetrico ao
-- teste 1, prova que o isolamento vale nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","tenant_id":"22222222-2222-2222-2222-222222222222","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_tenants_visiveis int;
  v_tenant_users_visiveis int;
  v_linhas_do_tenant_a int;
begin
  select count(*) into v_tenants_visiveis from public.tenants;
  select count(*) into v_tenant_users_visiveis from public.tenant_users;
  select count(*) into v_linhas_do_tenant_a
    from public.tenant_users
    where tenant_id = '11111111-1111-1111-1111-111111111111';

  if v_tenants_visiveis <> 1 then
    raise exception 'FALHOU (2a): tenant B deveria ver exatamente 1 tenant (o proprio), viu %', v_tenants_visiveis;
  end if;

  if v_tenant_users_visiveis <> 1 then
    raise exception 'FALHOU (2b): tenant B deveria ver exatamente 1 linha em tenant_users (a propria), viu %', v_tenant_users_visiveis;
  end if;

  if v_linhas_do_tenant_a <> 0 then
    raise exception 'FALHOU (2c): tenant B NAO deveria enxergar nenhuma linha de tenant_users do tenant A, viu %', v_linhas_do_tenant_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario sem tenant_id no claim (0 vinculos ativos -- caso real
-- do hook para quem nunca foi convidado, ou so tem convite pendente) nao
-- enxerga NENHUMA linha em tenants nem em tenant_users.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_tenants_visiveis int;
  v_tenant_users_visiveis int;
begin
  select count(*) into v_tenants_visiveis from public.tenants;
  select count(*) into v_tenant_users_visiveis from public.tenant_users;

  if v_tenants_visiveis <> 0 then
    raise exception 'FALHOU (3a): usuario sem tenant_id no claim nao deveria ver NENHUM tenant, viu %', v_tenants_visiveis;
  end if;

  if v_tenant_users_visiveis <> 0 then
    raise exception 'FALHOU (3b): usuario sem tenant_id no claim nao deveria ver NENHUMA linha de tenant_users, viu %', v_tenant_users_visiveis;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: WITH CHECK bloqueia escrita cross-tenant -- admin do tenant A
-- tenta inserir um tenant_users com tenant_id do tenant B (poderia ser um
-- payload malicioso de client tentando "escapar" do proprio tenant).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-1111-1111-111111111111","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values (
      '22222222-2222-2222-2222-222222222222', -- tenant B, fora do claim do admin logado
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'cliente',
      'invited'
    );
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado: RLS deve rejeitar via WITH CHECK
  end;

  if v_insert_ok then
    raise exception 'FALHOU (4): admin do tenant A conseguiu inserir uma linha de tenant_users no tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- Mesmo cenario, agora via UPDATE: tenta mudar uma linha do tenant B.
-- Como o USING ja filtra por tenant_id do claim, a linha do tenant B nem
-- aparece para o UPDATE -- 0 linhas afetadas, sem erro (comportamento
-- esperado de RLS em UPDATE: filtra silenciosamente, nao lanca excecao).
do $$
declare
  v_linhas_afetadas int;
begin
  update public.tenant_users
    set role = 'comercial'
    where tenant_id = '22222222-2222-2222-2222-222222222222';

  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (4b): admin do tenant A conseguiu dar UPDATE em % linha(s) do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: usuario autenticado do MESMO tenant, mas sem tenant_role =
-- 'admin' no claim, nao pode inserir novo tenant_users -- prova que o
-- WITH CHECK considera o papel, nao so a fronteira de tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","tenant_id":"11111111-1111-1111-1111-111111111111","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values (
      '11111111-1111-1111-1111-111111111111', -- mesmo tenant do claim
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'cliente',
      'invited'
    );
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado: apenas tenant_role = admin pode inserir
  end;

  if v_insert_ok then
    raise exception 'FALHOU (5): usuario com tenant_role = cliente conseguiu inserir tenant_users -- WITH CHECK nao esta exigindo tenant_role = admin';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0002)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco (nem em
-- tenants/tenant_users, nem os auth.users fake).
rollback;
