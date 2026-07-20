-- 0002_rls_tenants_and_claim_hook.sql
-- Fundacao de RLS para `tenants`/`tenant_users` + mecanismo de custom claim
-- `tenant_id` no JWT via Custom Access Token Hook do Supabase Auth.
--
-- Pre-requisito de toda a RLS de tabelas de negocio: elas vao confiar em
-- `(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, e esse claim so existe
-- porque este hook o injeta na raiz do token (nao em app_metadata/user_
-- metadata) a partir de `tenant_users`.
--
-- IMPORTANTE (autoexposicao de tabelas): este projeto roda com o novo
-- default do Supabase em que tabelas criadas por `postgres` NAO recebem
-- GRANT automatico para os roles de Data API (`anon`, `authenticated`,
-- `service_role`) -- ver `auto_expose_new_tables` em supabase/config.toml.
-- RLS sozinha nao concede acesso: sem os GRANTs explicitos abaixo, mesmo
-- com policy permissiva o Postgres nega por falta de privilegio de
-- tabela. Por isso este arquivo concede explicitamente o minimo
-- necessario a `authenticated` (client comum) -- nunca a `anon`, pois
-- login e obrigatorio para `tenants`/`tenant_users`.

-- ---------------------------------------------------------------------
-- 1. RLS em `tenants`
-- ---------------------------------------------------------------------

alter table public.tenants enable row level security;

grant select on public.tenants to authenticated;

-- Excecao deliberada a convencao "tenant_id sempre via claim do JWT": a
-- listagem de tenants aos quais o usuario pertence e o que alimenta um
-- futuro seletor de tenant (caso de investidor com aportes em mais de uma
-- incorporadora, onde o hook do JWT propositalmente NAO injeta tenant_id
-- ate a selecao ser feita -- ver secao 3). Se essa policy tambem
-- dependesse do claim, um usuario multi-tenant nunca conseguiria ver a
-- lista de tenants para escolher um. `tenants` e uma tabela pequena e
-- lida raramente (tela de troca de tenant, bootstrap de login), entao o
-- custo do EXISTS aqui e aceitavel -- isso NAO deve virar padrao para
-- tabelas de negocio de alto volume, que devem usar o claim.
create policy "tenants_select_member"
  on public.tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = tenants.id
        and tu.user_id = auth.uid()
        and tu.status = 'active'
    )
  );

-- Sem policy de insert/update/delete para `authenticated`: criacao de
-- tenant e um fluxo especial (onboarding), feito server-side com
-- `service_role` (que ignora RLS), nunca pelo client direto. Sem policy
-- explicita, o Postgres nega o comando por padrao para `authenticated`.

comment on policy "tenants_select_member" on public.tenants is
  'Usuario ve apenas tenants aos quais tem vinculo ativo em tenant_users. '
  'Excecao documentada ao padrao de claim JWT: alimenta o futuro seletor '
  'de tenant para usuarios multi-tenant.';

-- ---------------------------------------------------------------------
-- 2. RLS em `tenant_users`
-- ---------------------------------------------------------------------

alter table public.tenant_users enable row level security;

grant select, insert, update on public.tenant_users to authenticated;

-- SELECT: usuario so ve vinculos do MESMO tenant ativo no token (claim,
-- nao lookup em tabela -- este e o padrao geral do CLAUDE.md). Cobre
-- tambem a propria linha do usuario.
create policy "tenant_users_select_same_tenant"
  on public.tenant_users
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- INSERT: so admin do tenant pode convidar (criar) novos tenant_users, e
-- somente dentro do proprio tenant do claim -- nunca confiando em um
-- tenant_id vindo do body da requisicao do client.
create policy "tenant_users_insert_admin_same_tenant"
  on public.tenant_users
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- UPDATE: so admin do tenant pode atualizar vinculos (mudar role,
-- suspender, ativar) e apenas dentro do proprio tenant -- USING valida a
-- linha atual, WITH CHECK impede o admin de "mover" a linha para outro
-- tenant_id na mesma operacao.
create policy "tenant_users_update_admin_same_tenant"
  on public.tenant_users
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

-- Sem policy de DELETE: offboarding de membro e feito via `status =
-- 'suspended'` (UPDATE), nunca apagando a linha -- mantem historico e
-- evita quebrar FKs de auditoria (`invited_by_user_id` etc.) em outras
-- tabelas futuras.

-- LACUNA CONHECIDA (documentada, nao resolvida nesta migration): um
-- usuario recem-convidado (status = 'invited') ainda NAO tem tenant_id no
-- claim (o hook so injeta para status = 'active' -- secao 3), logo ele
-- nao consegue, via RLS de tabela comum, fazer UPDATE na propria linha
-- para se auto-ativar (aceitar o convite). O fluxo de "aceitar convite"
-- precisa de um mecanismo a parte (ex: RPC `security definer` validando
-- um token de convite, ou Edge Function com `service_role`) -- fora do
-- escopo desta migration, mas precisa existir antes de o convite por
-- e-mail ser implementado.

comment on policy "tenant_users_select_same_tenant" on public.tenant_users is
  'Isolamento por tenant via claim tenant_id do JWT (custom access token '
  'hook), nunca via tenant_id vindo do client.';

-- ---------------------------------------------------------------------
-- 3. Custom Access Token Hook: injeta tenant_id/tenant_role no JWT
-- ---------------------------------------------------------------------

-- Indice de suporte ao hook: ele roda a cada login/refresh de token e
-- filtra tenant_users por user_id + status. O indice unique(tenant_id,
-- user_id) criado em 0001 tem tenant_id como coluna lider e nao serve
-- para esse lookup -- sem este indice o hook faria seq scan na tabela
-- inteira em todo login.
create index tenant_users_user_id_status_idx
  on public.tenant_users (user_id, status);

-- SEM `security definer` de proposito: o padrao oficial do Supabase para
-- este hook e uma funcao com privilegios do INVOCADOR (`supabase_auth_
-- admin`, quem chama o hook), nao do dono da funcao. E por isso que os
-- GRANTs de SELECT em tenant_users e a policy dedicada abaixo (secao
-- "Grants exigidos...") sao necessarios -- se fosse security definer eles
-- seriam irrelevantes (a funcao rodaria com privilegio de quem a criou).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  target_user_id uuid;
  active_tenant_count int;
  selected_tenant_id uuid;
  selected_tenant_role tenant_role;
begin
  target_user_id := (event->>'user_id')::uuid;
  claims := event->'claims';

  select count(*)
  into active_tenant_count
  from public.tenant_users
  where user_id = target_user_id
    and status = 'active';

  if active_tenant_count = 1 then
    select tenant_id, role
    into selected_tenant_id, selected_tenant_role
    from public.tenant_users
    where user_id = target_user_id
      and status = 'active';

    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(selected_tenant_id::text));
    claims := jsonb_set(claims, '{tenant_role}', to_jsonb(selected_tenant_role::text));
  end if;
  -- 0 tenants ativos (nunca convidado / so tem convite pendente) ou mais
  -- de 1 (investidor em multiplas incorporadoras): claims ficam sem
  -- tenant_id/tenant_role de proposito. RLS de tabelas de negocio nega
  -- tudo ate o usuario selecionar um tenant ativo (mecanismo de selecao
  -- e responsabilidade de uma feature futura no frontend, nao deste
  -- hook).

  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Custom Access Token Hook do Supabase Auth. Injeta tenant_id/tenant_role '
  'na raiz do JWT quando o usuario tem exatamente 1 vinculo ativo em '
  'tenant_users; caso contrario deixa os claims ausentes de proposito.';

-- Grants exigidos pelo recurso Custom Access Token Hook do Supabase: quem
-- invoca a funcao e o role `supabase_auth_admin`, nao `authenticated` nem
-- `service_role`. Sem estes grants o hook falha (e o login trava) ou fica
-- exposto a roles que nao deveriam poder chama-lo diretamente.
grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

revoke execute
  on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;

-- Como a funcao roda com privilegios do INVOCADOR (supabase_auth_admin,
-- sem `security definer`), ela precisa do proprio SELECT em tenant_users
-- -- daqui vem o grant abaixo e a policy dedicada a esse role, exatamente
-- como a documentacao oficial do "Custom Access Token Hook" recomenda.
grant select
  on public.tenant_users
  to supabase_auth_admin;

create policy "tenant_users_select_auth_admin"
  on public.tenant_users
  as permissive
  for select
  to supabase_auth_admin
  using (true);

comment on policy "tenant_users_select_auth_admin" on public.tenant_users is
  'Permite que o Custom Access Token Hook (executado pelo role '
  'supabase_auth_admin) leia tenant_users para montar o claim tenant_id. '
  'Restrita a esse role -- nao expoe as demais linhas a authenticated/anon.';
