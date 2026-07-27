-- 0063_rls_configuracoes.sql
-- Modulo 14 (Configuracoes) -- RLS de `tenant_invites`/`doc_requirements`/
-- `support_tickets` (0060/0061/0062, todas deixadas de proposito com "RLS
-- PENDENTE") + as 2 funcoes `security definer` que fecham o fluxo de
-- convite ("lista de espera") e a listagem de membros com e-mail.
--
-- PRECEDENTE ESTILISTICO: 0005_create_tenant_rpc.sql -- mesma categoria de
-- problema (usuario autenticado SEM tenant_id no claim ainda, precisando de
-- uma acao que a RLS normal de tenant_users nao permite). Mesmo padrao:
-- `security definer`, `set search_path = ''`, todo objeto referenciado no
-- corpo schema-qualificado (pg_catalog resolve implicitamente mesmo com
-- search_path vazio -- now(), lower(), tipos builtin), comentario de
-- "superficie de risco deliberada" onde se aplica.
--
-- AUDITORIA DE GRANTS HERDADOS (achado desta etapa, corrigido abaixo):
-- 0061_doc_requirements.sql e 0062_support_tickets.sql concederam `update`
-- a `authenticated` em ambas as tabelas, mas nenhuma das duas recebe policy
-- de UPDATE aqui -- confirmado por grep no original (`Settings.jsx`): doc
-- requirement so tem `create`/`delete` (`createReqMutation`/
-- `deleteReqMutation`, sem nenhum `update(`), e ticket de suporte nao tem
-- nenhuma tela de gestao/edicao, nem no original nem neste projeto ainda
-- (mesmo criterio ja documentado em 0062 para justificar a ausencia de UI de
-- update/delete). Sem policy, o grant fica orfao -- mesmo problema ja
-- corrigido para `status_transitions` (0017) e para o insert de
-- `public_leads` (0059). Revogado explicitamente em cada secao abaixo, para
-- nao deixar privilegio de tabela concedido sem nenhuma policy que o torne
-- efetivo (principio de minimo privilegio).

-- =======================================================================
-- 1. tenant_invites -- so `admin` mexe (unico papel com o botao "Convidar
--    Usuario" no original, confirmado em Settings.jsx: `currentUser?.role
--    === "admin"`). SELECT/INSERT/UPDATE dentro do proprio tenant via
--    claim. Sem policy de DELETE: revogar convite e `status = 'revoked'`
--    (UPDATE), historico nao se apaga -- mesma decisao ja registrada no
--    comentario de 0060.
-- =======================================================================

alter table public.tenant_invites enable row level security;

create policy "tenant_invites_select_admin"
  on public.tenant_invites
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

create policy "tenant_invites_insert_admin"
  on public.tenant_invites
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- UPDATE cobre revogacao (status='revoked'). USING valida a linha atual,
-- WITH CHECK impede mover a linha para outro tenant_id na mesma operacao --
-- mesmo padrao de tenant_users_update_admin_same_tenant (0002).
create policy "tenant_invites_update_admin"
  on public.tenant_invites
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

comment on policy "tenant_invites_select_admin" on public.tenant_invites is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a admin -- '
  'unico papel com o botao "Convidar Usuario" no original (Settings.jsx).';

-- Nenhuma policy de DELETE de proposito: sem grant de delete a
-- `authenticated` em 0060 (so select/insert/update), entao nem precisa de
-- revoke aqui -- ausencia de grant ja nega por padrao.

-- =======================================================================
-- 2. doc_requirements -- SELECT para toda equipe interna (informacao
--    operacional, todo mundo consulta), INSERT/DELETE so admin (mesmo gate
--    do botao de lixeira original -- so admin mexe na config documental).
-- =======================================================================

alter table public.doc_requirements enable row level security;

create policy "doc_requirements_select_tenant_team"
  on public.doc_requirements
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "doc_requirements_insert_admin"
  on public.doc_requirements
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- DELETE precisa de policy explicita (tabela sem soft-delete, 0061 ja
-- concedeu `grant delete` mas sem RLS nenhum papel tinha, na pratica,
-- privilegio efetivo -- fechado aqui).
create policy "doc_requirements_delete_admin"
  on public.doc_requirements
  for delete
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

comment on policy "doc_requirements_select_tenant_team" on public.doc_requirements is
  'Isolamento por tenant via claim tenant_id do JWT, leitura liberada para '
  'toda equipe interna (admin/comercial/administrativo) -- config '
  'operacional que todo mundo consulta ao avancar status de unidade.';

-- Sem policy de UPDATE: original (Settings.jsx) so tem create/delete de
-- doc requirement, nenhum `update(` -- grant orfao herdado de 0061,
-- revogado explicitamente (ver nota de auditoria no topo do arquivo).
revoke update on public.doc_requirements from authenticated;

-- =======================================================================
-- 3. support_tickets -- qualquer authenticated do tenant cria o PROPRIO
--    ticket; usuario ve so os proprios, admin ve todos do tenant (2
--    policies de select, mesmo padrao OR ja usado em outras tabelas).
-- =======================================================================

alter table public.support_tickets enable row level security;

-- INSERT: qualquer papel do tenant pode abrir ticket para si mesmo --
-- user_id tem que ser o proprio auth.uid() (nao um user_id de outra
-- pessoa vindo do body), tenant_id tem que ser o do claim.
create policy "support_tickets_insert_own"
  on public.support_tickets
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and user_id = auth.uid()
  );

-- SELECT (a): usuario ve os proprios tickets, em qualquer papel.
create policy "support_tickets_select_own"
  on public.support_tickets
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and user_id = auth.uid()
  );

-- SELECT (b): admin ve todos os tickets do proprio tenant (inclusive os que
-- nao sao dele) -- policy separada, permissiva por padrao no Postgres
-- (OR implicito entre as duas policies de select da mesma tabela).
create policy "support_tickets_select_admin_all"
  on public.support_tickets
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

comment on policy "support_tickets_select_own" on public.support_tickets is
  'Usuario ve os proprios tickets (qualquer papel) -- combinada via OR com '
  'support_tickets_select_admin_all (admin ve todos os do tenant).';

-- Sem policy de UPDATE/DELETE: nenhuma tela de gestao de ticket existe,
-- nem no original nem aqui ainda -- mesmo criterio ja usado para
-- public_leads/maintenance_requests nesta fase (0057/0037). Grant de
-- `update` herdado de 0062 fica orfao sem policy -- revogado explicitamente
-- (ver nota de auditoria no topo do arquivo). Sem grant de delete desde
-- 0062 (nunca concedido), nada a revogar nesse caso.
revoke update on public.support_tickets from authenticated;

-- =======================================================================
-- 4. accept_pending_invite() -- aceite de convite no momento do signup.
-- =======================================================================
--
-- CONTRATO PARA O FRONTEND (frontend-builder):
--   supabase.rpc('accept_pending_invite') -- SEM parametros (usa o e-mail
--   do proprio JWT de quem chama, nunca aceito como argumento -- evita
--   spoofing de e-mail alheio).
--
--   Retorno (jsonb), SEMPRE 1 dos 2 formatos abaixo, NUNCA lanca excecao
--   para "sem convite" (so para auth.uid() nulo -- chamada sem sessao):
--     - Sem convite pendente para o e-mail do chamador:
--         {"accepted": false}
--     - Convite encontrado e aceito:
--         {
--           "accepted": true,
--           "tenant_id": "<uuid>",
--           "tenant_name": "<text>",
--           "role": "<tenant_role>"
--         }
--
--   ONDE CHAMAR: logo apos uma sessao autenticada existir E o claim
--   tenant_id ainda estiver ausente -- ou seja, o mesmo ponto que hoje
--   decide entre `NoTenantScreen`/`OnboardingPage` (ver
--   src/routes/ProtectedRoute.tsx, `if (!tenantId) return <NoTenantScreen
--   />`) e o passo "company" do signup (src/features/auth/pages/
--   SignupPage.tsx). Fluxo sugerido: antes de renderizar NoTenantScreen (ou
--   antes do passo "company" do SignupPage), chamar esta RPC; se
--   `accepted: true`, chamar `supabase.auth.refreshSession()` (MESMA
--   obrigacao ja documentada para `create_tenant_with_admin`/0005 -- o JWT
--   atual nao tem tenant_id/tenant_role ate o proximo refresh) e navegar
--   para a home; se `accepted: false`, cai no fluxo padrao existente
--   (criar propria empresa). Nao requer nenhuma mudanca nesta migration --
--   fica para a etapa do frontend-builder.
--
-- CRITERIO DE DESEMPATE (>1 convite pending para o mesmo e-mail em tenants
-- diferentes -- caso raro mas possivel, ja que o indice unico parcial de
-- 0060 so impede duplicata DENTRO do mesmo tenant): pega o MAIS RECENTE
-- (`order by created_at desc limit 1`) -- mesmo espirito de simplicidade ja
-- usado em 0005/0059 (`order by created_at ... limit 1` para desempate
-- deterministico), sem resolver selecao de tenant aqui (fora de escopo,
-- mesma lacuna ja documentada em 0005 e 0002).
--
-- DUPLICIDADE: se o usuario ja tiver uma linha em tenant_users para o
-- MESMO tenant (ex: chamou a funcao duas vezes, corrida entre 2 abas), o
-- INSERT usa `on conflict (tenant_id, user_id) do nothing` (unique desde
-- 0001) -- nao duplica nem estoura erro. O convite ainda e marcado
-- accepted normalmente.
--
-- LACUNA CONHECIDA (documentada, nao resolvida aqui, mesma ressalva de
-- 0005): NAO tratamos o caso do usuario ja pertencer a OUTRO tenant antes
-- de aceitar este convite -- ele pode acumular vinculos em tenants
-- diferentes, mesma lacuna do "seletor de tenant" ja registrada em 0002/
-- 0005.

create or replace function public.accept_pending_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  v_invite public.tenant_invites%rowtype;
  v_tenant_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'accept_pending_invite requer um usuario autenticado (auth.uid() nulo)'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  -- E-mail vem do JWT (disponivel mesmo sem claim de tenant_id), nunca de
  -- parametro -- normalizado em minusculo para casar com a trigger de
  -- normalize_tenant_invites_email (0060). Se o provider de auth nao
  -- expuser e-mail (ex: SSO sem e-mail no token, caso hoje inexistente
  -- neste projeto mas defensivo), trata como "sem convite" em vez de
  -- estourar erro.
  v_email := lower(auth.jwt() ->> 'email');

  if v_email is null or btrim(v_email) = '' then
    return jsonb_build_object('accepted', false);
  end if;

  -- Convite pendente mais recente para este e-mail -- ver criterio de
  -- desempate no comentario de topo da migration.
  select * into v_invite
  from public.tenant_invites
  where email = v_email
    and status = 'pending'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('accepted', false);
  end if;

  -- Vincula o usuario ao tenant do convite. on conflict do nothing cobre a
  -- chamada duplicada (mesmo tenant_id/user_id) sem estourar unique_
  -- violation nem duplicar a linha.
  insert into public.tenant_users (
    tenant_id, user_id, role, status, invited_by_user_id, joined_at
  )
  values (
    v_invite.tenant_id, v_user_id, v_invite.role, 'active',
    v_invite.invited_by_user_id, now()
  )
  on conflict (tenant_id, user_id) do nothing;

  update public.tenant_invites
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id;

  select t.name into v_tenant_name
  from public.tenants t
  where t.id = v_invite.tenant_id;

  return jsonb_build_object(
    'accepted', true,
    'tenant_id', v_invite.tenant_id,
    'tenant_name', v_tenant_name,
    'role', v_invite.role
  );
end;
$$;

comment on function public.accept_pending_invite() is
  'Aceite de convite "lista de espera" (tenant_invites) no momento do '
  'signup/login. SECURITY DEFINER deliberado -- roda como dono (postgres), '
  'bypassando a ausencia de policy de insert em tenant_users para um '
  'usuario que ainda pode nao ter tenant_id no claim. Le o e-mail do '
  'PROPRIO JWT do chamador (nunca aceito como parametro). Retorno jsonb '
  '{"accepted": false} (sem convite) ou {"accepted": true, tenant_id, '
  'tenant_name, role} (aceito) -- nunca lanca excecao para "sem convite", '
  'so para auth.uid() nulo. Contrato completo para o frontend no comentario '
  'de topo desta migration.';

revoke execute on function public.accept_pending_invite() from public, anon;
grant execute on function public.accept_pending_invite() to authenticated;

-- =======================================================================
-- 5. get_tenant_members() -- listagem da aba "Usuarios" (nome/e-mail de
--    cada membro), so para admin do PROPRIO tenant.
-- =======================================================================
--
-- CONTRATO PARA O FRONTEND (frontend-builder):
--   supabase.rpc('get_tenant_members') -- SEM parametros (usa
--   tenant_id/tenant_role do claim do chamador, nunca aceito como
--   argumento).
--
--   `returns table`, entao o client recebe um ARRAY (nao um jsonb unico) --
--   PostgREST RPC de uma `returns table` function sempre devolve lista,
--   mesmo com 0 linhas. Colunas: tenant_user_id (uuid), user_id (uuid),
--   role (tenant_role, chega como string), status (tenant_user_status,
--   idem), joined_at (timestamptz|null), email (text), client_id
--   (uuid|null), client_name (text|null) -- client_id/client_name so vem
--   preenchido quando existe uma linha em `clients` com
--   `clients.user_id = tenant_users.user_id` no mesmo tenant (dado que a UI
--   precisa para "este usuario esta vinculado a este cliente").
--
--   AUTORIZACAO: verificada DENTRO da funcao (tenant_role do claim tem que
--   ser 'admin') -- se quem chamar nao for admin do tenant, ou nao tiver
--   tenant_id/sessao valida, o retorno e uma lista VAZIA, nunca erro e
--   nunca linha de outro tenant. Nao confia em nenhuma validacao ja feita
--   no client antes de chamar.
--
-- POR QUE SECURITY DEFINER (e nao so uma policy de select em auth.users):
-- `auth.users` nunca tem RLS liberada para `authenticated` neste projeto
-- (nem em nenhuma migration anterior) -- um usuario comum nao consegue ler
-- e-mail de outros usuarios via select direto. A funcao roda como dono
-- (postgres), le auth.users/tenant_users/clients internamente, e devolve
-- so os campos allow-listed abaixo -- nunca um `select *` de auth.users
-- (sem hash de senha, sem metadata, sem nenhum outro campo sensivel).
--
-- CLIENTE POR user_id: sem unique(user_id) em `clients` (0011) -- em teoria
-- mais de um client poderia ter o mesmo user_id no mesmo tenant (nao
-- impedido pelo schema, ainda que nao seja o uso esperado). Para nao
-- duplicar linha por membro nesse caso raro, usa LATERAL com `limit 1`
-- (mais antigo primeiro, `order by created_at asc`) -- decisao
-- deterministica documentada, mesmo espirito do `limit 1` de 0005/0059.

create or replace function public.get_tenant_members()
returns table (
  tenant_user_id uuid,
  user_id uuid,
  role public.tenant_role,
  status public.tenant_user_status,
  joined_at timestamptz,
  email text,
  client_id uuid,
  client_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant_role text;
begin
  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  -- Sem sessao autenticada de verdade, sem claim de tenant, ou papel
  -- diferente de admin: lista vazia, nunca erro (mesmo padrao ja usado em
  -- get_project_operational_result, 0056).
  if auth.uid() is null or v_tenant_id is null or v_tenant_role is distinct from 'admin' then
    return;
  end if;

  return query
    select
      tu.id as tenant_user_id,
      tu.user_id,
      tu.role,
      tu.status,
      tu.joined_at,
      au.email::text,
      c.id as client_id,
      c.name as client_name
    from public.tenant_users tu
    join auth.users au on au.id = tu.user_id
    left join lateral (
      select cl.id, cl.name
      from public.clients cl
      where cl.user_id = tu.user_id
        and cl.tenant_id = tu.tenant_id
        and cl.is_deleted = false
      order by cl.created_at asc
      limit 1
    ) c on true
    where tu.tenant_id = v_tenant_id
    order by tu.created_at asc;
end;
$$;

comment on function public.get_tenant_members() is
  'Listagem da aba "Usuarios" (Settings.jsx): membros do PROPRIO tenant do '
  'chamador, com e-mail (auth.users, inacessivel via RLS comum) e o cliente '
  'vinculado (clients.user_id), quando existir. SECURITY DEFINER '
  'deliberado -- so assim consegue ler auth.users. Autorizacao (tenant_role '
  '= admin do claim) verificada DENTRO da funcao, nao confia em quem '
  'chamou -- retorna lista vazia (nunca erro, nunca linha de outro tenant) '
  'para qualquer chamador que nao seja admin ativo do tenant. Contrato '
  'completo para o frontend no comentario de topo desta migration.';

revoke execute on function public.get_tenant_members() from public, anon;
grant execute on function public.get_tenant_members() to authenticated;

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role`: nenhuma Edge Function deste modulo existe hoje
-- -- mesma ressalva ja registrada em 0045/0051/0055/0056. As 2 funcoes
-- acima sao `security definer` chamadas via PostgREST RPC por
-- `authenticated` (accept_pending_invite) e por `authenticated` com
-- checagem interna de admin (get_tenant_members) -- nenhuma delas expoe
-- nem depende de `service_role`/`SUPABASE_SERVICE_ROLE_KEY` no client.
--
-- Vinculo cliente<->usuario na edicao (trocar papel para 'cliente' e
-- escolher `clients` para linkar, setando `clients.user_id`): CONFIRMADO
-- que `clients_update_tenant_team` (0017_rls_crm.sql) ja cobre essa
-- escrita para admin/comercial/administrativo, sem restricao de coluna
-- (USING/WITH CHECK identicos, so tenant_id do claim + papel) -- nenhuma
-- policy nova necessaria para isso, confirmado lendo 0017 nesta etapa, nao
-- assumido.
--
-- Ver supabase/tests/0063_configuracoes_isolation.sql para o teste de
-- isolamento completo (tenant_invites/doc_requirements/support_tickets +
-- as 2 funcoes + regressao de 0002/0005/0017).
