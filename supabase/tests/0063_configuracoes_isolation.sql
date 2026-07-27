-- 0063_configuracoes_isolation.sql
-- Teste de isolamento para supabase/migrations/0063_rls_configuracoes.sql
-- (RLS de tenant_invites/doc_requirements/support_tickets +
-- accept_pending_invite()/get_tenant_members()).
--
-- COMO RODAR
-- ----------
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0063_configuracoes_isolation.sql
--
-- Mesmo padrao de supabase/tests/0002_tenant_isolation.sql/
-- 0005_create_tenant_rpc.sql: roda dentro de UMA transacao com ROLLBACK no
-- final (nenhum dado sintetico fica no banco), simula requisicao
-- autenticada via `set_config('request.jwt.claims', ..., true)` +
-- `set local role authenticated`. Inclui `"email"` no claim (alem de
-- `sub`/`tenant_id`/`tenant_role`) -- necessario aqui porque
-- accept_pending_invite() le `auth.jwt() ->> 'email'`, coisa que nenhum
-- teste anterior deste projeto precisou simular.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS,
-- so usado dentro de Edge Functions, nunca exposto ao client; nenhuma Edge
-- Function deste modulo existe hoje). As duas funcoes novas sao chamaveis
-- por `authenticated` via RPC normal, nunca dependem de service_role.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Fluxo completo de convite: admin cria convite -> usuario novo (sem
--    tenant_id no claim) se cadastra com esse e-mail -> chama
--    accept_pending_invite() -> vira tenant_users ativo com o papel do
--    convite -> convite marca accepted. Chamada repetida nao duplica
--    tenant_users nem re-aceita.
-- 2. E-mail sem convite pendente recebe {"accepted": false} sem erro e sem
--    side-effect (nenhuma linha criada). Chamada sem sessao (auth.uid()
--    nulo) e rejeitada com excecao, sem side-effect.
-- 3. Convite de tenant A nao e visivel nem aceitavel/revogavel por admin de
--    tenant B (select/insert/update isolados por tenant via claim).
-- 4. Criterio de desempate documentado (mais recente) quando 2 tenants
--    diferentes tem convite pending para o MESMO e-mail.
-- 5. get_tenant_members() so retorna dado para admin do tenant certo;
--    devolve SO membros do proprio tenant (nunca de outro); devolve vazio
--    (nao erro) para nao-admin e para quem nao tem tenant_id no claim;
--    inclui e-mail (via auth.users) e o cliente vinculado (via clients.
--    user_id), quando existir.
-- 6. doc_requirements: select liberado a equipe interna, insert/delete so
--    admin, isolado por tenant; grant de UPDATE herdado de 0061 foi de
--    fato revogado (nao so "sem policy", sem PRIVILEGIO nenhum).
-- 7. support_tickets: qualquer papel cria o proprio ticket; usuario ve so
--    os proprios; admin ve todos do tenant; isolado por tenant; grant de
--    UPDATE herdado de 0062 foi de fato revogado.

begin;

-- ---------------------------------------------------------------------
-- Setup: 2 tenants, 1 admin + 1 comercial no tenant A, 1 admin no tenant B.
-- IDs fixos e legiveis (nao gen_random_uuid()) para o script inteiro ser
-- SQL puro, sem passar variaveis entre statements via psql/CLI.
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('63000000-0000-0000-0000-0000000a0001', 'admin.a@empresa-0063.com'),       -- admin_a
  ('63000000-0000-0000-0000-0000000a0002', 'comercial.a@empresa-0063.com'),   -- comercial_a
  ('63000000-0000-0000-0000-0000000a0003', 'novo.membro@empresa-0063.com'),   -- new_user: acabou de se cadastrar, convite pendente esperando
  ('63000000-0000-0000-0000-0000000a0004', 'sem.convite@empresa-0063.com'),   -- uninvited_user: se cadastrou, nenhum convite bate com o e-mail
  ('63000000-0000-0000-0000-0000000b0001', 'admin.b@empresa-0063.com'),       -- admin_b
  ('63000000-0000-0000-0000-0000000a0005', 'tiebreak@empresa-0063.com');      -- tiebreak_user: e-mail com convite pending em 2 tenants diferentes

insert into public.tenants (id, name, slug) values
  ('63000000-0000-0000-0000-00000000000a', 'Tenant A - teste 0063', 'tenant-a-teste-0063'),
  ('63000000-0000-0000-0000-00000000000b', 'Tenant B - teste 0063', 'tenant-b-teste-0063');

insert into public.tenant_users (tenant_id, user_id, role, status, joined_at) values
  ('63000000-0000-0000-0000-00000000000a', '63000000-0000-0000-0000-0000000a0001', 'admin', 'active', now()),
  ('63000000-0000-0000-0000-00000000000a', '63000000-0000-0000-0000-0000000a0002', 'comercial', 'active', now()),
  ('63000000-0000-0000-0000-00000000000b', '63000000-0000-0000-0000-0000000b0001', 'admin', 'active', now());

-- =======================================================================
-- TESTE 1 (a): fluxo completo de convite -- admin_a convida, new_user
-- aceita, tenant_users criado com o papel certo, convite marca accepted.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t1_invite (id uuid) on commit drop;

do $$
declare
  v_invite_id uuid;
begin
  insert into public.tenant_invites (tenant_id, email, role, invited_by_user_id)
  values (
    '63000000-0000-0000-0000-00000000000a',
    'Novo.Membro@Empresa-0063.com', -- proposital: maiuscula, prova a trigger de normalizacao (0060)
    'comercial',
    '63000000-0000-0000-0000-0000000a0001'
  )
  returning id into v_invite_id;

  insert into t1_invite (id) values (v_invite_id);
end $$;

reset role;

do $$
declare
  v_email text;
  v_status public.tenant_invite_status;
begin
  select ti.email, ti.status into v_email, v_status
    from public.tenant_invites ti join t1_invite r on ti.id = r.id;

  if v_email <> 'novo.membro@empresa-0063.com' then
    raise exception 'FALHOU (1a): trigger de normalizacao deveria ter gravado e-mail em minusculo, veio %', v_email;
  end if;

  if v_status <> 'pending' then
    raise exception 'FALHOU (1b): convite recem-criado deveria estar pending, veio %', v_status;
  end if;
end $$;

-- new_user se cadastra (signup normal) -- sessao autenticada, SEM
-- tenant_id no claim (0 vinculos ativos ainda, exatamente o caso real do
-- hook para quem acabou de criar conta).
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0003","email":"novo.membro@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t1_result (accepted boolean, tenant_id uuid, tenant_name text, role text) on commit drop;

do $$
declare
  v_result jsonb;
begin
  select public.accept_pending_invite() into v_result;
  insert into t1_result (accepted, tenant_id, tenant_name, role)
  values (
    (v_result ->> 'accepted')::boolean,
    nullif(v_result ->> 'tenant_id', '')::uuid,
    v_result ->> 'tenant_name',
    v_result ->> 'role'
  );
end $$;

do $$
declare
  v_accepted boolean;
  v_tenant_id uuid;
  v_tenant_name text;
  v_role text;
begin
  select accepted, tenant_id, tenant_name, role into v_accepted, v_tenant_id, v_tenant_name, v_role from t1_result;

  if v_accepted is distinct from true then
    raise exception 'FALHOU (1c): accept_pending_invite() deveria retornar accepted=true para e-mail com convite pending, retornou %', v_accepted;
  end if;

  if v_tenant_id <> '63000000-0000-0000-0000-00000000000a' then
    raise exception 'FALHOU (1d): tenant_id retornado deveria ser o do convite (tenant A), veio %', v_tenant_id;
  end if;

  if v_tenant_name <> 'Tenant A - teste 0063' then
    raise exception 'FALHOU (1e): tenant_name retornado nao bate com o tenant do convite, veio %', v_tenant_name;
  end if;

  if v_role <> 'comercial' then
    raise exception 'FALHOU (1f): role retornado deveria ser o do convite (comercial), veio %', v_role;
  end if;
end $$;

reset role;

do $$
declare
  v_tu_role tenant_role;
  v_tu_status tenant_user_status;
  v_tu_invited_by uuid;
  v_tu_joined_at timestamptz;
  v_ti_status public.tenant_invite_status;
  v_ti_accepted_at timestamptz;
  v_count int;
begin
  select count(*) into v_count
    from public.tenant_users
    where tenant_id = '63000000-0000-0000-0000-00000000000a'
      and user_id = '63000000-0000-0000-0000-0000000a0003';

  if v_count <> 1 then
    raise exception 'FALHOU (1g): deveria existir exatamente 1 linha tenant_users para new_user no tenant A, existe %', v_count;
  end if;

  select role, status, invited_by_user_id, joined_at
    into v_tu_role, v_tu_status, v_tu_invited_by, v_tu_joined_at
    from public.tenant_users
    where tenant_id = '63000000-0000-0000-0000-00000000000a'
      and user_id = '63000000-0000-0000-0000-0000000a0003';

  if v_tu_role <> 'comercial' then
    raise exception 'FALHOU (1h): role gravado deveria ser comercial (do convite), veio %', v_tu_role;
  end if;

  if v_tu_status <> 'active' then
    raise exception 'FALHOU (1i): status gravado deveria ser active, veio %', v_tu_status;
  end if;

  if v_tu_invited_by <> '63000000-0000-0000-0000-0000000a0001' then
    raise exception 'FALHOU (1j): invited_by_user_id deveria ser admin_a (quem criou o convite), veio %', v_tu_invited_by;
  end if;

  if v_tu_joined_at is null then
    raise exception 'FALHOU (1k): joined_at deveria estar preenchido, veio NULL';
  end if;

  select ti.status, ti.accepted_at into v_ti_status, v_ti_accepted_at
    from public.tenant_invites ti join t1_invite r on ti.id = r.id;

  if v_ti_status <> 'accepted' then
    raise exception 'FALHOU (1l): convite deveria estar accepted apos aceite, veio %', v_ti_status;
  end if;

  if v_ti_accepted_at is null then
    raise exception 'FALHOU (1m): accepted_at deveria estar preenchido, veio NULL';
  end if;
end $$;

-- TESTE 1n: chamada repetida (2a aba, corrida, o que for) do MESMO
-- new_user -- convite ja esta accepted (nao pending), entao a segunda
-- chamada deve responder "sem convite" (accepted=false), sem duplicar
-- tenant_users nem re-mexer no convite.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0003","email":"novo.membro@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.accept_pending_invite() into v_result;
  if (v_result ->> 'accepted')::boolean is distinct from false then
    raise exception 'FALHOU (1n): 2a chamada (convite ja accepted) deveria retornar accepted=false, retornou %', v_result;
  end if;
end $$;

reset role;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.tenant_users
    where tenant_id = '63000000-0000-0000-0000-00000000000a'
      and user_id = '63000000-0000-0000-0000-0000000a0003';

  if v_count <> 1 then
    raise exception 'FALHOU (1o): 2a chamada nao deveria duplicar a linha de tenant_users, existem %', v_count;
  end if;
end $$;

-- =======================================================================
-- TESTE 2 (b): e-mail sem convite pendente -> accepted=false, sem side-
-- effect. Chamada sem sessao -> excecao, sem side-effect.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0004","email":"sem.convite@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.accept_pending_invite() into v_result;
  if (v_result ->> 'accepted')::boolean is distinct from false then
    raise exception 'FALHOU (2a): e-mail sem convite pendente deveria retornar accepted=false, retornou %', v_result;
  end if;
end $$;

reset role;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.tenant_users
    where user_id = '63000000-0000-0000-0000-0000000a0004';

  if v_count <> 0 then
    raise exception 'FALHOU (2b): e-mail sem convite pendente nao deveria ter criado nenhuma linha tenant_users, criou %', v_count;
  end if;
end $$;

-- Chamada sem sessao nenhuma (nem claims) -- auth.uid() nulo, deve rejeitar
-- com excecao, mesmo padrao de create_tenant_with_admin (0005). IMPORTANTE:
-- `reset role` sozinho NAO limpa `request.jwt.claims` (e um GUC de
-- transacao, nao ligado ao role) -- sem este set_config explicito para
-- string vazia, auth.uid() continuaria resolvendo o `sub` do ULTIMO
-- usuario simulado acima (uninvited_user), o que tornaria este teste um
-- falso "passou" por engano.
select set_config('request.jwt.claims', '', true);
reset role;

do $$
declare
  v_erro_ok boolean := false;
begin
  begin
    perform public.accept_pending_invite();
  exception
    when others then
      v_erro_ok := (sqlerrm like '%requer um usuario autenticado%');
      if not v_erro_ok then
        raise exception 'FALHOU (2c): erro inesperado para chamada sem sessao: %', sqlerrm;
      end if;
  end;

  if not v_erro_ok then
    raise exception 'FALHOU (2c): chamada sem auth.uid() deveria ter sido rejeitada e nao foi';
  end if;
end $$;

-- =======================================================================
-- TESTE 3 (c): convite de tenant A nao e visivel/aceitavel/revogavel por
-- admin de tenant B.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t3_invite (id uuid) on commit drop;

do $$
declare
  v_invite_id uuid;
begin
  insert into public.tenant_invites (tenant_id, email, role, invited_by_user_id)
  values (
    '63000000-0000-0000-0000-00000000000a',
    'equipe.a@empresa-0063.com',
    'administrativo',
    '63000000-0000-0000-0000-0000000a0001'
  )
  returning id into v_invite_id;

  insert into t3_invite (id) values (v_invite_id);
end $$;

reset role;

-- admin_b (tenant B) nao ve o convite de tenant A.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000b0001","tenant_id":"63000000-0000-0000-0000-00000000000b","tenant_role":"admin","email":"admin.b@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.tenant_invites ti join t3_invite r on ti.id = r.id;

  if v_count <> 0 then
    raise exception 'FALHOU (3a): admin do tenant B NAO deveria ver o convite do tenant A, viu %', v_count;
  end if;
end $$;

-- admin_b tenta criar convite "spoofando" tenant_id = tenant A -- WITH
-- CHECK deve bloquear (tenant_id tem que bater com o claim do proprio
-- admin_b).
do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.tenant_invites (tenant_id, email, role, invited_by_user_id)
    values (
      '63000000-0000-0000-0000-00000000000a', -- tenant A, fora do claim de admin_b
      'invasor@empresa-0063.com',
      'admin',
      '63000000-0000-0000-0000-0000000b0001'
    );
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado
  end;

  if v_insert_ok then
    raise exception 'FALHOU (3b): admin do tenant B conseguiu inserir convite com tenant_id do tenant A -- WITH CHECK nao esta bloqueando';
  end if;
end $$;

-- admin_b tenta revogar (UPDATE) o convite do tenant A -- USING filtra por
-- tenant_id do claim, entao a linha nem aparece: 0 linhas afetadas, sem
-- erro.
do $$
declare
  v_linhas_afetadas int;
begin
  update public.tenant_invites
    set status = 'revoked'
    where tenant_id = '63000000-0000-0000-0000-00000000000a';

  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (3c): admin do tenant B conseguiu revogar % convite(s) do tenant A -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- Confirma (bypass RLS) que o convite do tenant A continua pending, intacto
-- -- a tentativa do admin B nao teve NENHUM efeito colateral.
do $$
declare
  v_status public.tenant_invite_status;
begin
  select ti.status into v_status
    from public.tenant_invites ti join t3_invite r on ti.id = r.id;

  if v_status <> 'pending' then
    raise exception 'FALHOU (3d): convite do tenant A deveria continuar pending (intocado pelo admin B), veio %', v_status;
  end if;
end $$;

-- admin_a (dono de verdade) revoga o proprio convite -- prova que UPDATE
-- funciona normalmente dentro do tenant certo.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_linhas_afetadas int;
begin
  update public.tenant_invites
    set status = 'revoked'
    where id = (select id from t3_invite);

  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas <> 1 then
    raise exception 'FALHOU (3e): admin_a deveria conseguir revogar o proprio convite (1 linha), afetou %', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 4: criterio de desempate -- mesmo e-mail com convite pending em 2
-- tenants diferentes (indice unico parcial de 0060 so impede duplicata
-- DENTRO do mesmo tenant). accept_pending_invite() deve pegar o MAIS
-- RECENTE (created_at desc).
-- =======================================================================

insert into public.tenant_invites (tenant_id, email, role, invited_by_user_id, created_at)
values
  ('63000000-0000-0000-0000-00000000000a', 'tiebreak@empresa-0063.com', 'comercial', '63000000-0000-0000-0000-0000000a0001', now() - interval '2 hours'),
  ('63000000-0000-0000-0000-00000000000b', 'tiebreak@empresa-0063.com', 'administrativo', '63000000-0000-0000-0000-0000000b0001', now() - interval '1 hour');

select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0005","email":"tiebreak@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  select public.accept_pending_invite() into v_result;

  if (v_result ->> 'accepted')::boolean is distinct from true then
    raise exception 'FALHOU (4a): tiebreak_user deveria ter sido aceito, retornou %', v_result;
  end if;

  if (v_result ->> 'tenant_id')::uuid <> '63000000-0000-0000-0000-00000000000b' then
    raise exception 'FALHOU (4b): criterio de desempate deveria escolher o convite MAIS RECENTE (tenant B), escolheu tenant %', v_result ->> 'tenant_id';
  end if;

  if v_result ->> 'role' <> 'administrativo' then
    raise exception 'FALHOU (4c): role deveria ser o do convite mais recente (administrativo, tenant B), veio %', v_result ->> 'role';
  end if;
end $$;

reset role;

do $$
declare
  v_status_a public.tenant_invite_status;
  v_status_b public.tenant_invite_status;
begin
  select status into v_status_a from public.tenant_invites
    where tenant_id = '63000000-0000-0000-0000-00000000000a' and email = 'tiebreak@empresa-0063.com';
  select status into v_status_b from public.tenant_invites
    where tenant_id = '63000000-0000-0000-0000-00000000000b' and email = 'tiebreak@empresa-0063.com';

  if v_status_b <> 'accepted' then
    raise exception 'FALHOU (4d): convite mais recente (tenant B) deveria estar accepted, veio %', v_status_b;
  end if;

  if v_status_a <> 'pending' then
    raise exception 'FALHOU (4e): convite mais antigo (tenant A) nao deveria ter sido tocado, veio %', v_status_a;
  end if;
end $$;

-- =======================================================================
-- TESTE 5 (d): get_tenant_members() -- so admin, so do proprio tenant.
-- =======================================================================

-- Vincula um client a new_user (tenant A) para testar o join
-- clients.user_id na listagem.
insert into public.clients (tenant_id, name, user_id)
values ('63000000-0000-0000-0000-00000000000a', 'Cliente Vinculado - teste 0063', '63000000-0000-0000-0000-0000000a0003');

-- admin_a: ve os membros do tenant A (admin_a, comercial_a, new_user),
-- com e-mail correto e o client vinculado ao new_user.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
  v_new_user_email text;
  v_new_user_client_name text;
  v_admin_b_visivel int;
begin
  select count(*) into v_count from public.get_tenant_members();

  if v_count <> 3 then
    raise exception 'FALHOU (5a): admin_a deveria ver exatamente 3 membros do tenant A, viu %', v_count;
  end if;

  select email, client_name into v_new_user_email, v_new_user_client_name
    from public.get_tenant_members()
    where user_id = '63000000-0000-0000-0000-0000000a0003';

  if v_new_user_email <> 'novo.membro@empresa-0063.com' then
    raise exception 'FALHOU (5b): e-mail de new_user na listagem deveria vir de auth.users, veio %', v_new_user_email;
  end if;

  if v_new_user_client_name <> 'Cliente Vinculado - teste 0063' then
    raise exception 'FALHOU (5c): client_name de new_user deveria vir do vinculo clients.user_id, veio %', v_new_user_client_name;
  end if;

  select count(*) into v_admin_b_visivel
    from public.get_tenant_members()
    where user_id = '63000000-0000-0000-0000-0000000b0001';

  if v_admin_b_visivel <> 0 then
    raise exception 'FALHOU (5d): admin_a NAO deveria ver admin_b (outro tenant) na listagem, viu %', v_admin_b_visivel;
  end if;
end $$;

reset role;

-- comercial_a (mesmo tenant, NAO admin): lista vazia, sem erro.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0002","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"comercial","email":"comercial.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_tenant_members();
  if v_count <> 0 then
    raise exception 'FALHOU (5e): comercial_a (nao-admin) deveria receber lista VAZIA de get_tenant_members(), recebeu %', v_count;
  end if;
end $$;

reset role;

-- admin_b (tenant B): so ve o proprio tenant -- 2 membros (ele mesmo +
-- tiebreak_user, que aceitou o convite do tenant B no TESTE 4) -- nunca
-- membros do tenant A.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000b0001","tenant_id":"63000000-0000-0000-0000-00000000000b","tenant_role":"admin","email":"admin.b@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
  v_tenant_a_visivel int;
begin
  select count(*) into v_count from public.get_tenant_members();
  if v_count <> 2 then
    raise exception 'FALHOU (5f): admin_b deveria ver exatamente 2 membros do tenant B (ele mesmo + tiebreak_user, aceito no TESTE 4), viu %', v_count;
  end if;

  select count(*) into v_tenant_a_visivel
    from public.get_tenant_members()
    where user_id in (
      '63000000-0000-0000-0000-0000000a0001',
      '63000000-0000-0000-0000-0000000a0002',
      '63000000-0000-0000-0000-0000000a0003'
    );

  if v_tenant_a_visivel <> 0 then
    raise exception 'FALHOU (5g): admin_b NAO deveria ver NENHUM membro do tenant A, viu %', v_tenant_a_visivel;
  end if;
end $$;

reset role;

-- Usuario sem tenant_id no claim: lista vazia, sem erro.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0004","email":"sem.convite@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_tenant_members();
  if v_count <> 0 then
    raise exception 'FALHOU (5h): usuario sem tenant_id no claim deveria receber lista VAZIA, recebeu %', v_count;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 6 (e, parte 1): doc_requirements -- select equipe interna,
-- insert/delete so admin, isolado por tenant, grant de UPDATE revogado de
-- verdade.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t6_req (id uuid) on commit drop;

do $$
declare
  v_id uuid;
begin
  insert into public.doc_requirements (tenant_id, admin_status, doc_type)
  values ('63000000-0000-0000-0000-00000000000a', 'laudo_engenharia', 'laudo_eng')
  returning id into v_id;

  insert into t6_req (id) values (v_id);
end $$;

reset role;

-- comercial_a (equipe interna, nao-admin): SELECT funciona (info
-- operacional que todo mundo consulta), INSERT e bloqueado (so admin),
-- DELETE tambem bloqueado.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0002","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"comercial","email":"comercial.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.doc_requirements where tenant_id = '63000000-0000-0000-0000-00000000000a';
  if v_count <> 1 then
    raise exception 'FALHOU (6a): comercial_a (equipe interna) deveria ver o requisito do proprio tenant, viu %', v_count;
  end if;
end $$;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.doc_requirements (tenant_id, admin_status, doc_type)
    values ('63000000-0000-0000-0000-00000000000a', 'contrato_caixa', 'form_caixa_assinado');
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado: so admin insere
  end;

  if v_insert_ok then
    raise exception 'FALHOU (6b): comercial_a (nao-admin) conseguiu inserir doc_requirements -- policy de INSERT nao esta restrita a admin';
  end if;
end $$;

do $$
declare
  v_linhas_afetadas int;
begin
  delete from public.doc_requirements where tenant_id = '63000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (6c): comercial_a (nao-admin) conseguiu apagar % linha(s) de doc_requirements -- policy de DELETE nao esta restrita a admin', v_linhas_afetadas;
  end if;
end $$;

-- UPDATE: grant foi revogado explicitamente em 0063 -- nem chega a avaliar
-- RLS, deve estourar erro de PRIVILEGIO (nao so "0 linhas afetadas").
do $$
declare
  v_erro_ok boolean := false;
begin
  begin
    update public.doc_requirements set doc_type = 'itbi' where tenant_id = '63000000-0000-0000-0000-00000000000a';
    v_erro_ok := false;
  exception
    when insufficient_privilege then
      v_erro_ok := true;
    when others then
      raise exception 'FALHOU (6d): esperava insufficient_privilege (grant de update revogado), veio outro erro: % (%)', sqlerrm, sqlstate;
  end;

  if not v_erro_ok then
    raise exception 'FALHOU (6d): UPDATE em doc_requirements deveria falhar por falta de privilegio (grant revogado em 0063) e nao falhou';
  end if;
end $$;

reset role;

-- admin_b (tenant B) nao ve o requisito do tenant A.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000b0001","tenant_id":"63000000-0000-0000-0000-00000000000b","tenant_role":"admin","email":"admin.b@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.doc_requirements
    where tenant_id = '63000000-0000-0000-0000-00000000000a';

  if v_count <> 0 then
    raise exception 'FALHOU (6e): admin do tenant B NAO deveria ver requisito do tenant A, viu %', v_count;
  end if;
end $$;

reset role;

-- admin_a (dono de verdade) apaga o proprio requisito -- prova que DELETE
-- funciona normalmente para admin do tenant certo.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_linhas_afetadas int;
begin
  delete from public.doc_requirements where id = (select id from t6_req);
  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas <> 1 then
    raise exception 'FALHOU (6f): admin_a deveria conseguir apagar o proprio requisito (1 linha), afetou %', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE 7 (e, parte 2): support_tickets -- qualquer papel cria o proprio,
-- usuario ve so os proprios, admin ve todos do tenant, isolado por tenant,
-- grant de UPDATE revogado de verdade.
-- =======================================================================

-- comercial_a cria o proprio ticket.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0002","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"comercial","email":"comercial.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t7_ticket_comercial (id uuid) on commit drop;

do $$
declare
  v_id uuid;
begin
  insert into public.support_tickets (tenant_id, user_id, user_email, type, subject, description)
  values (
    '63000000-0000-0000-0000-00000000000a',
    '63000000-0000-0000-0000-0000000a0002',
    'comercial.a@empresa-0063.com',
    'account_deletion',
    'Quero excluir minha conta',
    'Solicitacao de exclusao de conta - teste 0063'
  )
  returning id into v_id;

  insert into t7_ticket_comercial (id) values (v_id);
end $$;

-- comercial_a NAO pode abrir ticket em nome de outra pessoa (user_id
-- spoofado) nem em outro tenant (tenant_id spoofado).
do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.support_tickets (tenant_id, user_id, user_email, type, subject, description)
    values (
      '63000000-0000-0000-0000-00000000000a',
      '63000000-0000-0000-0000-0000000a0001', -- admin_a, nao quem esta logado
      'admin.a@empresa-0063.com',
      'account_deletion',
      'Ticket em nome de outro usuario',
      'Tentativa de spoof de user_id - teste 0063'
    );
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado
  end;

  if v_insert_ok then
    raise exception 'FALHOU (7a): comercial_a conseguiu criar ticket com user_id de outra pessoa -- WITH CHECK nao esta validando user_id = auth.uid()';
  end if;
end $$;

do $$
declare
  v_insert_ok boolean := false;
begin
  begin
    insert into public.support_tickets (tenant_id, user_id, user_email, type, subject, description)
    values (
      '63000000-0000-0000-0000-00000000000b', -- tenant B, fora do claim de comercial_a
      '63000000-0000-0000-0000-0000000a0002',
      'comercial.a@empresa-0063.com',
      'account_deletion',
      'Ticket com tenant_id spoofado',
      'Tentativa de spoof de tenant_id - teste 0063'
    );
    v_insert_ok := true;
  exception
    when others then
      v_insert_ok := false; -- esperado
  end;

  if v_insert_ok then
    raise exception 'FALHOU (7b): comercial_a conseguiu criar ticket com tenant_id de outro tenant -- WITH CHECK nao esta validando tenant_id = claim';
  end if;
end $$;

reset role;

-- new_user (mesmo tenant A) abre o proprio ticket -- usado para provar
-- isolamento por USUARIO, nao so por tenant.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0003","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"comercial","email":"novo.membro@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t7_ticket_new_user (id uuid) on commit drop;

do $$
declare
  v_id uuid;
begin
  insert into public.support_tickets (tenant_id, user_id, user_email, type, subject, description)
  values (
    '63000000-0000-0000-0000-00000000000a',
    '63000000-0000-0000-0000-0000000a0003',
    'novo.membro@empresa-0063.com',
    'account_deletion',
    'Meu proprio pedido de exclusao',
    'Solicitacao de exclusao de conta - new_user - teste 0063'
  )
  returning id into v_id;

  insert into t7_ticket_new_user (id) values (v_id);
end $$;

reset role;

-- comercial_a: ve so o PROPRIO ticket, nao o de new_user (mesmo tenant,
-- usuario diferente).
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0002","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"comercial","email":"comercial.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
  v_ve_ticket_alheio int;
begin
  select count(*) into v_count
    from public.support_tickets
    where tenant_id = '63000000-0000-0000-0000-00000000000a';

  if v_count <> 1 then
    raise exception 'FALHOU (7c): comercial_a (nao-admin) deveria ver exatamente 1 ticket (o proprio), viu %', v_count;
  end if;

  select count(*) into v_ve_ticket_alheio
    from public.support_tickets t join t7_ticket_new_user r on t.id = r.id;

  if v_ve_ticket_alheio <> 0 then
    raise exception 'FALHOU (7d): comercial_a NAO deveria ver o ticket de new_user (mesmo tenant, usuario diferente), viu %', v_ve_ticket_alheio;
  end if;
end $$;

-- UPDATE: grant revogado explicitamente em 0063 -- nem o dono do proprio
-- ticket consegue, erro de privilegio.
do $$
declare
  v_erro_ok boolean := false;
begin
  begin
    update public.support_tickets set status = 'resolvido' where id = (select id from t7_ticket_comercial);
    v_erro_ok := false;
  exception
    when insufficient_privilege then
      v_erro_ok := true;
    when others then
      raise exception 'FALHOU (7e): esperava insufficient_privilege (grant de update revogado), veio outro erro: % (%)', sqlerrm, sqlstate;
  end;

  if not v_erro_ok then
    raise exception 'FALHOU (7e): UPDATE em support_tickets deveria falhar por falta de privilegio (grant revogado em 0063) e nao falhou';
  end if;
end $$;

reset role;

-- admin_a: ve os DOIS tickets do tenant A (o de comercial_a e o de
-- new_user) -- admin enxerga todos do proprio tenant, nao so os proprios.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000a0001","tenant_id":"63000000-0000-0000-0000-00000000000a","tenant_role":"admin","email":"admin.a@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.support_tickets
    where tenant_id = '63000000-0000-0000-0000-00000000000a';

  if v_count <> 2 then
    raise exception 'FALHOU (7f): admin_a deveria ver os 2 tickets do tenant A (proprio tenant, todos os usuarios), viu %', v_count;
  end if;
end $$;

reset role;

-- admin_b (tenant B) nao ve NENHUM ticket do tenant A, nem sendo admin.
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-0000-0000-0000000b0001","tenant_id":"63000000-0000-0000-0000-00000000000b","tenant_role":"admin","email":"admin.b@empresa-0063.com","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.support_tickets
    where tenant_id = '63000000-0000-0000-0000-00000000000a';

  if v_count <> 0 then
    raise exception 'FALHOU (7g): admin do tenant B NAO deveria ver NENHUM ticket do tenant A, viu %', v_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE CONFIGURACOES (0063) PASSARAM' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
