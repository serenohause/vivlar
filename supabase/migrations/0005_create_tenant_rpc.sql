-- 0005_create_tenant_rpc.sql
-- RPC de onboarding: permite que um usuario recem-cadastrado (Supabase Auth
-- comum, email+senha, SEM tenant_id no JWT ainda) crie sua propria empresa
-- (`tenants`) e vire admin dela (`tenant_users`) em uma unica chamada
-- atomica.
--
-- POR QUE ESTA FUNCAO EXISTE
-- --------------------------
-- 0002_rls_tenants_and_claim_hook.sql deixou de proposito SEM policy de
-- INSERT em `tenants` e SEM caminho de "primeiro INSERT" em `tenant_users`
-- para o role `authenticated` -- criacao de tenant foi descrita la como
-- "fluxo especial (onboarding), feito server-side com service_role". Esta
-- migration formaliza esse fluxo especial como uma funcao `security
-- definer`: em vez de expor `service_role` a uma Edge Function so para
-- isso (superficie maior, mais uma peca de infra para manter), a funcao
-- roda com o privilegio do seu DONO (postgres, dono de `tenants`/
-- `tenant_users` e nao sujeito a FORCE ROW LEVEL SECURITY em nenhuma das
-- duas tabelas), o que permite os dois INSERTs mesmo sem nenhuma policy de
-- INSERT liberada para `authenticated`. `service_role` continua nunca
-- sendo exposto ao client -- ver CLAUDE.md e SUPABASE_SERVICE_ROLE_KEY.
--
-- SUPERFICIE DE RISCO DELIBERADA (leia antes de alterar)
-- --------------------------------------------------------
-- Qualquer usuario autenticado (auth.uid() nao nulo, QUALQUER usuario,
-- independente de ja pertencer a outro tenant ou nao) pode chamar esta
-- funcao e se auto-nomear ADMIN de um tenant novo. Isso e INTENCIONAL --
-- e exatamente o fluxo "criar minha empresa" do signup -- mas duas
-- consequencias precisam ficar explicitas para quem ler/alterar isto
-- depois:
--   1. Nao ha limite de quantos tenants um mesmo usuario pode criar. Isso
--      e uma decisao de produto NAO tomada ainda (rate limit, verificacao
--      de dominio de email, aprovacao manual, etc. ficam fora de escopo
--      aqui de proposito) -- se isso virar um vetor de abuso (spam de
--      tenants), tratar em uma migration/feature dedicada, nao aqui.
--   2. A funcao NAO verifica se o usuario ja tem um vinculo ativo em outro
--      tenant antes de criar mais um -- um usuario pode acumular multiplos
--      vinculos 'admin' em tenants diferentes. O hook do JWT (0002) ja
--      lida com isso ao nao injetar tenant_id quando ha mais de 1 vinculo
--      ativo (fica para uma feature futura de "seletor de tenant"), mas
--      isso significa que criar um segundo tenant pode "quebrar" o login
--      automatico do usuario ate essa feature existir. Documentado, nao
--      resolvido aqui.
--
-- SEARCH_PATH
-- -----------
-- `set search_path = ''` (vazio) -- pratica recomendada pelo Supabase para
-- funcoes `security definer`, para blindar contra search_path hijacking
-- (um atacante criando um objeto de mesmo nome em outro schema que entra
-- antes de `public` no path de sessao). Com search_path vazio, TODO objeto
-- referenciado no corpo da funcao precisa ser schema-qualificado
-- explicitamente (auth.uid(), public.tenants, public.tenant_users) --
-- funcoes de pg_catalog (now(), operadores, tipos como uuid/text) continuam
-- resolvendo normalmente, pois pg_catalog e sempre pesquisado implicitamente
-- pelo Postgres, mesmo com search_path vazio.
--
-- DONO DA FUNCAO
-- --------------
-- Sem `alter function ... owner to`: a funcao herda como dona o role que
-- executa esta migration (`postgres`, via `supabase db push`), exatamente
-- o mesmo padrao ja usado por `set_updated_at()` e `custom_access_token_
-- hook()` neste projeto -- nenhuma das duas seta owner explicitamente.

create or replace function public.create_tenant_with_admin(
  p_tenant_name text,
  p_tenant_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
begin
  -- 1. Rejeita chamada anonima/sem sessao -- auth.uid() so e nao nulo para
  --    uma requisicao autenticada de verdade (JWT valido no PostgREST).
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'create_tenant_with_admin requer um usuario autenticado (auth.uid() nulo)'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  -- Sanidade minima do nome -- nao e uma regra de negocio, so evita gravar
  -- uma linha com nome vazio/so espaco (a constraint NOT NULL sozinha nao
  -- pega isso).
  if p_tenant_name is null or btrim(p_tenant_name) = '' then
    raise exception 'nome do tenant nao pode ser vazio'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- 2. Valida formato do slug: letras minusculas, numeros, hifen simples
  --    entre segmentos -- sem espacos, maiusculas, hifen duplo/nas pontas.
  --    Mensagem clara para o frontend exibir direto ao usuario.
  if p_tenant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception
      'slug invalido: use apenas letras minusculas, numeros e hifen simples entre segmentos (ex: minha-empresa)'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- 3. Cria o tenant. Se o slug ja existir, a violacao de UNIQUE (tenants.
  --    slug) estoura aqui naturalmente e aborta a funcao inteira (function
  --    body roda em um bloco implicitamente atomico -- sem exception
  --    handler ao redor destes INSERTs, um erro em qualquer um desfaz os
  --    dois, entao nao ha risco de linha orfa em tenants sem o tenant_
  --    users correspondente).
  insert into public.tenants (name, slug)
  values (p_tenant_name, p_tenant_slug)
  returning id into v_tenant_id;

  -- 4. Vincula quem chamou como admin ativo do tenant recem-criado.
  insert into public.tenant_users (
    tenant_id, user_id, role, status, joined_at
  )
  values (
    v_tenant_id, v_user_id, 'admin', 'active', now()
  );

  -- 5. Retorna o id do tenant criado -- o frontend usa isso para navegar
  --    e, criticamente, para saber que precisa forcar um refresh de sessao
  --    (o JWT atual do usuario ainda nao tem tenant_id/tenant_role: esses
  --    claims so sao recalculados pelo custom_access_token_hook no proximo
  --    login/refresh de token, nao retroativamente na sessao corrente).
  return v_tenant_id;
end;
$$;

comment on function public.create_tenant_with_admin(text, text) is
  'Onboarding: cria um tenant novo e vincula o usuario autenticado como '
  'admin ativo dele, em uma transacao atomica. SECURITY DEFINER deliberado '
  '-- bypassa a ausencia de policy de INSERT em tenants/tenant_users para '
  '`authenticated` (ver 0002). Risco aceito e documentado: qualquer usuario '
  'autenticado pode se auto-nomear admin de um tenant novo (fluxo '
  '"criar minha empresa"), sem limite de quantos tenants pode criar -- '
  'limitar isso e decisao de produto pendente, fora de escopo aqui.';

-- Grants explicitos, nada implicito (mesmo padrao de seguranca ja usado
-- para custom_access_token_hook em 0002): funcoes nascem com EXECUTE
-- liberado para PUBLIC por padrao no Postgres -- revogamos isso e
-- concedemos so para `authenticated`. `anon` nunca deve poder chamar isto
-- (nao ha fluxo de criacao de tenant sem login) e fica coberto pelo
-- revoke de PUBLIC (que remove o grant implicito herdado por qualquer
-- role, incluindo anon).
grant execute
  on function public.create_tenant_with_admin(text, text)
  to authenticated;

revoke execute
  on function public.create_tenant_with_admin(text, text)
  from public, anon;
