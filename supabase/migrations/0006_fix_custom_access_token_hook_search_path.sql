-- 0006_fix_custom_access_token_hook_search_path.sql
-- Bug real encontrado em smoke test manual (signup via REST API do
-- Supabase Auth falhava com "Error running hook URI:
-- pg-functions://postgres/public/custom_access_token_hook" para TODO
-- usuário novo, inclusive sem nenhuma linha em tenant_users).
--
-- Causa: o role supabase_auth_admin (quem invoca o hook) tem
-- `search_path=auth` (confirmado via `select rolconfig from pg_roles`),
-- sem `public`. A função `custom_access_token_hook` declarava a variável
-- `selected_tenant_role tenant_role` (tipo sem qualificar o schema) —
-- com `public` fora do search_path do invocador, o Postgres não resolve
-- o tipo `tenant_role` e a função falha ao ser chamada, derrubando o
-- login/signup inteiro (o hook do access token é obrigatório: se ele
-- falha, o Auth nega o token).
--
-- Correção: fixar o search_path da própria função para `public` (mesmo
-- padrão já usado em `create_tenant_with_admin`), independente do
-- search_path do role que a invoca. Mantém os grants/policies de 0002 e
-- 0003 inalterados — só corrige o corpo da função.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
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
  'tenant_users; caso contrario deixa os claims ausentes de proposito. '
  'search_path fixado em public porque o invocador (supabase_auth_admin) '
  'nao tem public no proprio search_path.';
