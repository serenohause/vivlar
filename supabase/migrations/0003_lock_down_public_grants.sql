-- 0003_lock_down_public_grants.sql
-- Correcao de seguranca descoberta ao auditar os grants reais de
-- `tenants`/`tenant_users` apos aplicar 0002: o schema `public` deste
-- projeto tem DEFAULT PRIVILEGES (definidos na criacao do projeto, nao
-- por nenhuma migration nossa) que concedem `ALL` -- select, insert,
-- update, delete, truncate, references, trigger -- a `anon` E
-- `authenticated` em toda tabela nova criada pelos roles `postgres`/
-- `supabase_admin`. Isso significa que `tenants` e `tenant_users` (e toda
-- tabela futura, a menos que isto seja corrigido) nasceram com privilegio
-- de tabela muito mais amplo do que a intencao das policies de RLS de
-- 0002 -- a comment de 0002 que diz "tabelas criadas por postgres NAO
-- recebem GRANT automatico" estava ERRADA nesse ponto (o comportamento
-- observado no projeto real diverge do exemplo de config.toml). Corrigido
-- aqui, documentado para nao repetir o erro em migrations futuras.
--
-- Risco concreto antes desta migration:
--   - `anon` (chave publica, sem login) tinha INSERT/UPDATE/DELETE/
--     TRUNCATE em tabelas que exigem autenticacao. RLS ja bloqueava
--     SELECT/INSERT/UPDATE/DELETE de `anon` (nenhuma policy cobre esse
--     role), mas TRUNCATE NAO e filtrado por Row Level Security -- e um
--     comando que ignora RLS completamente. Isso e uma superficie de
--     ataque real, independente de qualquer policy estar correta.
--   - `authenticated` tinha DELETE/TRUNCATE/REFERENCES/TRIGGER alem do
--     SELECT/INSERT/UPDATE que 0002 concedeu de proposito. DELETE ficava
--     coberto pela ausencia de policy (RLS nega por padrao), mas TRUNCATE
--     de novo escapa da RLS -- qualquer usuario autenticado, de qualquer
--     tenant, poderia em tese apagar TODAS as linhas de `tenants`/
--     `tenant_users` de TODOS os tenants com um unico TRUNCATE.
--
-- Esta migration faz duas coisas:
--   1. Revoga o excesso de privilegio ja concedido em `tenants` e
--      `tenant_users` (efeito imediato nas tabelas existentes).
--   2. Corrige o DEFAULT PRIVILEGE do schema `public` para as roles que
--      criam objetos via `supabase db push` (`postgres`, `supabase_admin`),
--      para que TABELAS FUTURAS parem de nascer super-expostas. Daqui
--      pra frente, toda migration que cria uma tabela de negocio precisa
--      conceder explicitamente (select/insert/update/delete, nunca
--      truncate/references/trigger) ao role certo -- exatamente como
--      0002 ja fazia para `authenticated`, so que agora sem a rede de
--      seguranca (falsa) do default privilege builtin.

-- ---------------------------------------------------------------------
-- 1. Revoga excesso de privilegio ja concedido em tenants/tenant_users
-- ---------------------------------------------------------------------

-- `anon` nunca deveria ter QUALQUER privilegio aqui: login e obrigatorio
-- para tenants/tenant_users (nao ha fluxo publico/anonimo nessas duas
-- tabelas -- diferente de `projects`/`units`/`public_leads`, que terao
-- policy explicita de acesso anonimo quando forem criadas).
revoke all on public.tenants from anon;
revoke all on public.tenant_users from anon;

-- `authenticated` mantem exatamente o que 0002 concedeu de proposito
-- (select em tenants; select/insert/update em tenant_users) e perde o
-- resto, que nunca foi usado por nenhuma policy.
revoke delete, truncate, references, trigger on public.tenants from authenticated;
revoke delete, truncate, references, trigger on public.tenant_users from authenticated;

-- `supabase_auth_admin` mantem apenas o SELECT que o hook precisa (ja
-- concedido em 0002); confirma que nao ha nada alem disso.
revoke insert, update, delete, truncate, references, trigger
  on public.tenant_users from supabase_auth_admin;

-- `service_role` fica de fora deste revoke de proposito: e o role usado
-- exclusivamente server-side (Edge Functions), tem BYPASSRLS e precisa
-- de acesso total para operacoes administrativas (ex: criar tenant no
-- onboarding). Nunca e exposto ao client -- ver CLAUDE.md e
-- SUPABASE_SERVICE_ROLE_KEY em .env.local/.env.example.

-- ---------------------------------------------------------------------
-- 2. Corrige o default privilege do schema public para tabelas futuras
-- ---------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- LIMITACAO CONHECIDA: existe um segundo default privilege identico,
-- registrado para o role `supabase_admin` (visivel em `pg_default_acl`),
-- que este migration NAO consegue corrigir -- `postgres` (role usado por
-- `supabase db push`) nao tem permissao para alterar default privileges
-- de outro role (`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`
-- retorna `permission denied`, so o proprio `supabase_admin` ou um
-- superuser pode faze-lo). Na pratica isso so importa se uma tabela for
-- criada em `public` por algo rodando como `supabase_admin` (ex: certas
-- operacoes internas do Studio/dashboard) em vez de via
-- `supabase db push` (que roda como `postgres`, ja coberto acima).
-- Toda migration deste projeto roda como `postgres`, entao o caminho
-- normal esta protegido; mesmo assim, TODA tabela nova precisa continuar
-- concedendo grants explicitos e nunca assumir que o default esta seguro
-- -- documentar isso para o `schema-architect` conferir em cada tabela
-- nova (ex: rodar a mesma consulta a `information_schema.role_table_
-- grants` feita aqui antes de aprovar uma migration).

-- A partir de agora, `create table` em `public` rodado via
-- `supabase db push` (role `postgres`) NAO concede mais nada a
-- `anon`/`authenticated` por default -- cada migration de tabela de
-- negocio precisa conceder explicitamente o que a RLS dela pretende
-- permitir, igual 0002 fez para tenant_users. `service_role` continua
-- recebendo tudo por default (essa parte do default privilege NAO foi
-- tocada), o que e o comportamento desejado para o role administrativo
-- server-side.
