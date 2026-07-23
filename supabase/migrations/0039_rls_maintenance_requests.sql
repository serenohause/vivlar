-- 0039_rls_maintenance_requests.sql
-- RLS de `maintenance_requests` (0037) e de `storage.objects` para o bucket
-- privado `maintenance-photos` (0038). Fecha a lacuna deixada de proposito
-- nas duas migrations anteriores (RLS PENDENTE), seguindo exatamente o mesmo
-- padrao ja estabelecido em 0002/0010/0017/0023/0027/0032/0036
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao).
--
-- Tabela e storage numa unica migration (mesma escolha de 0032/0036): mesma
-- "leva" de trabalho, sobre o mesmo modulo, com a MESMA regra de
-- autorizacao (mesmos 3 papeis internos).
--
-- REGRA DE AUTORIZACAO (mesmo criterio de 0010/0023/0027/0032/0036): so a
-- equipe interna do tenant mexe em manutencao pos-entrega nesta rodada
-- (confirmado no comentario de escopo de 0037: sem portal do cliente no
-- projeto, `client_id` e so referencia de para quem e o chamado, preenchido
-- pelo operador). `tenant_role in ('admin', 'comercial', 'administrativo')`
-- do tenant certo (via claim) tem select/insert/update em
-- `maintenance_requests` (sem delete -- exclusao e sempre soft delete via
-- UPDATE de `is_deleted`, mesmo grant de 0037), e select/insert nos objetos
-- do bucket `maintenance-photos` cujo primeiro segmento do path bate com o
-- tenant_id do claim (sem update/delete, mesmo criterio de 0032/0036).
-- `cliente`/`investidor` NAO tem nenhuma policy aqui -- RLS nega tudo por
-- padrao pra eles, de proposito (portal do cliente abrir/ver o proprio
-- chamado e feature futura, fora de escopo nesta leva -- revisitar esta
-- migration quando ClientMaintenance.jsx for implementado).

-- =======================================================================
-- 1. maintenance_requests
-- =======================================================================

alter table public.maintenance_requests enable row level security;

create policy "maintenance_requests_select_tenant_team"
  on public.maintenance_requests
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "maintenance_requests_insert_tenant_team"
  on public.maintenance_requests
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "maintenance_requests_update_tenant_team"
  on public.maintenance_requests
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de DELETE de proposito: exclusao e sempre soft delete
-- (`is_deleted = true` via UPDATE, ja coberto pela policy de UPDATE acima).
-- Grant de delete tambem nao foi concedido em 0037 -- nada a revogar aqui.

comment on policy "maintenance_requests_select_tenant_team" on public.maintenance_requests is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a manutencao pos-entrega nesta '
  'leva (portal do cliente abrir/ver o proprio chamado e feature futura).';

-- Grants: `maintenance_requests` ja tem exatamente `select, insert, update`
-- concedido a `authenticated` desde 0037 -- bate exatamente com as 3
-- policies acima. Nada concedido a `anon`. Nenhuma correcao necessaria
-- (confirmado por auditoria pos-push em information_schema.
-- role_table_grants, ver commit).

-- =======================================================================
-- 2. storage.objects (bucket `maintenance-photos`)
-- =======================================================================
--
-- RLS ja vem habilitada por padrao pelo Supabase em storage.objects (nao e
-- necessario, nem eu deveria, rodar `alter table storage.objects enable row
-- level security` aqui) -- confirmado por auditoria pos-push
-- (pg_class.relrowsecurity = true) antes desta migration existir. As
-- policies abaixo sao restritas ao bucket `maintenance-photos`
-- (`bucket_id = 'maintenance-photos'`) -- nao afetam os buckets `documents`
-- (0032) nem `inspection-media` (0036), nem nenhum outro bucket futuro.
--
-- Convencao de path (documentada em 0038, o frontend precisa seguir
-- exatamente isto): {tenant_id}/{uuid_ou_timestamp}-{nome_original}. O
-- PRIMEIRO segmento do path (`(storage.foldername(name))[1]`) e sempre o
-- tenant_id -- e o que isola por tenant abaixo. Path de qualquer objeto que
-- nao comece com o tenant_id do proprio usuario (do claim, nunca do client)
-- e rejeitado tanto para leitura (using) quanto para escrita (with check).
--
-- NOTA: os grants de tabela (INSERT/SELECT/UPDATE/DELETE) em storage.objects
-- para `anon`/`authenticated` sao os grants DEFAULT da extensao de Storage
-- do Supabase, presentes em todo projeto (nao foram concedidos por nenhuma
-- migration deste repo, e nao sao revogados aqui). Isso e seguro porque RLS
-- ja esta habilitada e, sem nenhuma policy que autorize `anon`, ZERO linhas
-- ficam visiveis/graváveis por esse papel, independente do grant de tabela
-- -- confirmado no teste de isolamento
-- (supabase/tests/0039_maintenance_isolation.sql).

create policy "maintenance_photos_bucket_select_tenant_team"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "maintenance_photos_bucket_insert_tenant_team"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE/DELETE em storage.objects, de proposito (mesma
-- decisao de produto de 0032/0036, repetida aqui para o bucket
-- maintenance-photos): um re-upload deveria virar um NOVO objeto (novo
-- path, com timestamp/uuid diferente) + um novo elemento no array
-- `maintenance_requests.photos` via UPDATE na tabela (ja coberto pela
-- policy de UPDATE de `maintenance_requests` acima) -- nao uma substituicao
-- in-place do arquivo no bucket. Remocao de foto e sempre uma edicao do
-- array `photos` na tabela (UPDATE); o objeto correspondente no bucket pode
-- ficar orfao -- rotina de limpeza e decisao de produto futura, fora do
-- escopo desta migration. Sem policy de update/delete aqui, qualquer
-- tentativa nesse sentido e negada por padrao pela RLS.
--
-- Nada para `anon` -- bucket privado (0038, public = false), sem leitura ou
-- escrita publica.
