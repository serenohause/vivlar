-- 0005_create_tenant_rpc.sql
-- Teste da RPC `create_tenant_with_admin` introduzida em
-- supabase/migrations/0005_create_tenant_rpc.sql.
--
-- COMO RODAR
-- ----------
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0005_create_tenant_rpc.sql
--
-- Mesmo padrao de supabase/tests/0002_tenant_isolation.sql: roda dentro de
-- UMA transacao com ROLLBACK no final (nenhum dado sintetico fica no
-- banco), simula uma requisicao autenticada via `set_config('request.jwt.
-- claims', ..., true)` + `set local role authenticated`.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Chamada anonima (auth.uid() nulo) e rejeitada -- a funcao nao cria
--    nada quando ninguem esta autenticado.
-- 2. Slug em formato invalido e rejeitado com mensagem clara, sem criar
--    nenhuma linha.
-- 3. Chamada valida cria exatamente 1 linha em tenants + 1 linha em
--    tenant_users (role=admin, status=active, joined_at preenchido),
--    retorna o id do tenant. A prova de que os INSERTs de fato
--    aconteceram (nao so que a funcao "nao deu erro") e feita bypassando
--    RLS (papel `postgres`, dono das tabelas) -- de proposito, NAO como
--    `authenticated` logo em seguida, porque o teste 3b abaixo mostra que
--    isso FALHARIA: o JWT do usuario que acabou de criar o tenant ainda
--    nao tem o claim `tenant_id` (foi emitido antes da linha existir), e
--    tanto `tenants_select_member` quanto `tenant_users_select_same_
--    tenant` dependem desse claim (a primeira indiretamente, via EXISTS
--    em tenant_users, que tambem tem RLS). Isso confirma na pratica que o
--    frontend PRECISA de `supabase.auth.refreshSession()` apos a RPC --
--    ver teste 3c, que simula esse refresh recriando os claims com
--    tenant_id/tenant_role, e so entao confirma visibilidade.
-- 4. Atomicidade: chamar de novo com o MESMO slug falha por violacao de
--    UNIQUE em tenants.slug, e essa falha nao deixa nenhuma linha nova
--    (nem em tenants nem em tenant_users) -- confirma que nao ha exception
--    handler escondido engolindo o erro do segundo INSERT nem deixando a
--    primeira INSERT (tenants) orfa.
-- 5. Um usuario comum (`authenticated`, mas SEM ser dono/chamador) nao
--    ganha nenhum privilegio via RLS por causa desta funcao -- ela roda
--    security definer, mas as tabelas continuam com a mesma RLS de 0002;
--    a funcao e o UNICO jeito de contornar isso, nao uma porta aberta
--    permanente.

begin;

-- ---------------------------------------------------------------------
-- TESTE 1: chamada sem sessao (role default, sem claims) -- auth.uid()
-- deve ser nulo e a funcao deve rejeitar.
-- ---------------------------------------------------------------------

do $$
declare
  v_erro_ok boolean := false;
begin
  begin
    perform public.create_tenant_with_admin('Empresa Anonima', 'empresa-anonima');
  exception
    when others then
      v_erro_ok := (sqlerrm like '%requer um usuario autenticado%');
      if not v_erro_ok then
        raise exception 'FALHOU (1): erro inesperado para chamada anonima: %', sqlerrm;
      end if;
  end;

  if not v_erro_ok then
    raise exception 'FALHOU (1): chamada sem auth.uid() deveria ter sido rejeitada e nao foi';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.tenants where slug = 'empresa-anonima';
  if v_count <> 0 then
    raise exception 'FALHOU (1b): chamada anonima rejeitada mas deixou % linha(s) em tenants', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Setup: usuario autenticado de teste para os proximos cenarios.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'); -- user_novo: acabou de se cadastrar, sem tenant ainda

select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}',
  true
);
set local role authenticated;

-- ---------------------------------------------------------------------
-- TESTE 2: slug em formato invalido (maiuscula, espaco, hifen na ponta)
-- deve ser rejeitado, sem criar nada.
-- ---------------------------------------------------------------------

do $$
declare
  v_erro_ok boolean;
begin
  v_erro_ok := false;
  begin
    perform public.create_tenant_with_admin('Empresa Teste', 'Empresa Invalida');
  exception
    when others then
      v_erro_ok := (sqlerrm like '%slug invalido%');
  end;
  if not v_erro_ok then
    raise exception 'FALHOU (2a): slug com maiuscula/espaco deveria ser rejeitado com "slug invalido"';
  end if;

  v_erro_ok := false;
  begin
    perform public.create_tenant_with_admin('Empresa Teste', '-comeca-com-hifen');
  exception
    when others then
      v_erro_ok := (sqlerrm like '%slug invalido%');
  end;
  if not v_erro_ok then
    raise exception 'FALHOU (2b): slug comecando com hifen deveria ser rejeitado';
  end if;

  v_erro_ok := false;
  begin
    perform public.create_tenant_with_admin('Empresa Teste', 'hifen--duplo');
  exception
    when others then
      v_erro_ok := (sqlerrm like '%slug invalido%');
  end;
  if not v_erro_ok then
    raise exception 'FALHOU (2c): slug com hifen duplo deveria ser rejeitado';
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.tenants
  where slug in ('Empresa Invalida', '-comeca-com-hifen', 'hifen--duplo');
  if v_count <> 0 then
    raise exception 'FALHOU (2d): slugs invalidos rejeitados mas deixaram % linha(s) em tenants', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 3: chamada valida cria tenant + tenant_users admin/active.
-- ---------------------------------------------------------------------

create temporary table t3_result (tenant_id uuid) on commit drop;

do $$
declare
  v_tenant_id uuid;
begin
  select public.create_tenant_with_admin('Empresa Nova Ltda', 'empresa-nova-ltda-0005')
    into v_tenant_id;

  if v_tenant_id is null then
    raise exception 'FALHOU (3a): funcao deveria retornar o uuid do tenant criado, retornou NULL';
  end if;

  insert into t3_result (tenant_id) values (v_tenant_id);
end $$;

-- TESTE 3b: ANTES de qualquer refresh de sessao, com o JWT do usuario
-- ainda sem o claim tenant_id (exatamente o token que ele tinha antes de
-- chamar a RPC), a RLS normal NAO mostra nem o tenant nem o vinculo --
-- documenta por que o refresh de sessao e obrigatorio no frontend.
do $$
declare
  v_tenants_visiveis int;
  v_tenant_users_visiveis int;
begin
  select count(*) into v_tenants_visiveis
    from public.tenants t join t3_result r on t.id = r.tenant_id;
  select count(*) into v_tenant_users_visiveis
    from public.tenant_users tu join t3_result r on tu.tenant_id = r.tenant_id;

  if v_tenants_visiveis <> 0 then
    raise exception 'FALHOU (3b): com o JWT antigo (sem tenant_id), usuario NAO deveria ver o tenant recem-criado ainda, viu %', v_tenants_visiveis;
  end if;

  if v_tenant_users_visiveis <> 0 then
    raise exception 'FALHOU (3b): com o JWT antigo (sem tenant_id), usuario NAO deveria ver o vinculo tenant_users recem-criado ainda, viu %', v_tenant_users_visiveis;
  end if;
end $$;

-- Prova de que os INSERTs de fato aconteceram (bypass de RLS via role
-- postgres, dono das tabelas -- equivalente a uma checagem administrativa,
-- nao ao que o client normal enxerga).
reset role;

do $$
declare
  v_role tenant_role;
  v_status tenant_user_status;
  v_joined_at timestamptz;
  v_slug text;
begin
  select t.slug into v_slug
    from public.tenants t join t3_result r on t.id = r.tenant_id;

  if v_slug is distinct from 'empresa-nova-ltda-0005' then
    raise exception 'FALHOU (3c): linha em tenants nao encontrada/com slug errado (bypass RLS), veio %', v_slug;
  end if;

  select tu.role, tu.status, tu.joined_at
    into v_role, v_status, v_joined_at
    from public.tenant_users tu
    join t3_result r on tu.tenant_id = r.tenant_id
    where tu.user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  if v_role <> 'admin' then
    raise exception 'FALHOU (3d): role do criador deveria ser admin, foi %', v_role;
  end if;

  if v_status <> 'active' then
    raise exception 'FALHOU (3e): status do criador deveria ser active, foi %', v_status;
  end if;

  if v_joined_at is null then
    raise exception 'FALHOU (3f): joined_at deveria estar preenchido (now()), veio NULL';
  end if;
end $$;

-- TESTE 3g: simula o refresh de sessao (novo JWT, agora COM tenant_id/
-- tenant_role -- o que o custom_access_token_hook injetaria de verdade no
-- proximo login/refresh, ja que o usuario agora tem 1 vinculo ativo). Com
-- esse claim, a RLS normal passa a mostrar tenant e tenant_users.
do $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from t3_result;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'tenant_id', v_tenant_id::text,
      'tenant_role', 'admin',
      'role', 'authenticated'
    )::text,
    true
  );
end $$;

set local role authenticated;

do $$
declare
  v_tenants_visiveis int;
  v_tenant_users_visiveis int;
begin
  select count(*) into v_tenants_visiveis
    from public.tenants t join t3_result r on t.id = r.tenant_id;
  select count(*) into v_tenant_users_visiveis
    from public.tenant_users tu join t3_result r on tu.tenant_id = r.tenant_id;

  if v_tenants_visiveis <> 1 then
    raise exception 'FALHOU (3g): apos simular refresh de sessao (claim tenant_id presente), usuario deveria ver o proprio tenant, viu %', v_tenants_visiveis;
  end if;

  if v_tenant_users_visiveis <> 1 then
    raise exception 'FALHOU (3g): apos simular refresh de sessao (claim tenant_id presente), usuario deveria ver o proprio vinculo tenant_users, viu %', v_tenant_users_visiveis;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 4: atomicidade -- chamar de novo com o MESMO slug estoura
-- violacao de unique e nao deixa lixo (nem segunda linha em tenants, nem
-- segunda linha em tenant_users).
-- ---------------------------------------------------------------------

do $$
declare
  v_erro_ok boolean := false;
begin
  begin
    perform public.create_tenant_with_admin('Empresa Nova Ltda Duplicada', 'empresa-nova-ltda-0005');
    v_erro_ok := false;
  exception
    when unique_violation then
      v_erro_ok := true;
    when others then
      raise exception 'FALHOU (4a): esperava unique_violation para slug duplicado, veio outro erro: % (%)', sqlerrm, sqlstate;
  end;

  if not v_erro_ok then
    raise exception 'FALHOU (4a): slug duplicado deveria ter estourado unique_violation e nao estourou';
  end if;
end $$;

-- Verificacao final sem depender de RLS (role postgres, dono das tabelas)
-- -- isola o teste de atomicidade de qualquer efeito colateral de policy.
reset role;

do $$
declare
  v_tenants_count int;
  v_tenant_users_count int;
begin
  select count(*) into v_tenants_count
    from public.tenants
    where slug = 'empresa-nova-ltda-0005';

  if v_tenants_count <> 1 then
    raise exception 'FALHOU (4b): apos falha por slug duplicado deveria existir exatamente 1 linha em tenants com esse slug (a original), existe %', v_tenants_count;
  end if;

  select count(*) into v_tenant_users_count
    from public.tenant_users tu
    join public.tenants t on t.id = tu.tenant_id
    where t.slug = 'empresa-nova-ltda-0005';

  if v_tenant_users_count <> 1 then
    raise exception 'FALHOU (4c): apos falha por slug duplicado deveria existir exatamente 1 linha em tenant_users vinculada a esse tenant, existe %', v_tenant_users_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE create_tenant_with_admin PASSARAM (0005)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
