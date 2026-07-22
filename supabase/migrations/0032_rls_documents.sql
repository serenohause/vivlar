-- 0032_rls_documents.sql
-- RLS de `documents` (0030) e de `storage.objects` para o bucket privado
-- `documents` (0031). Fecha a lacuna deixada de proposito nas duas
-- migrations anteriores (RLS PENDENTE), seguindo o mesmo padrao ja
-- estabelecido em 0002/0010/0017/0023/0027
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao).
--
-- Tabela e storage numa unica migration (escolha explicita, ao inves de
-- separar em duas): sao a mesma "leva" de trabalho, sobre o mesmo modulo,
-- com a MESMA regra de autorizacao (mesmos 3 papeis internos) -- separar
-- so adicionaria overhead de numeracao sem ganho de auditabilidade real.
--
-- REGRA DE AUTORIZACAO (mesmo criterio de 0023/0027): so a equipe interna
-- do tenant mexe em documentos. `tenant_role in ('admin', 'comercial',
-- 'administrativo')` do tenant certo (via claim) tem select/insert/update
-- em `documents`, e select/insert nos objetos do bucket `documents` cujo
-- primeiro segmento do path bate com o tenant_id do claim.
-- `cliente`/`investidor` NAO tem nenhuma policy aqui -- RLS nega tudo por
-- padrao pra eles, de proposito (portal do cliente ver os proprios
-- documentos e feature futura, fora de escopo nesta leva).

-- =======================================================================
-- 1. documents
-- =======================================================================

alter table public.documents enable row level security;

create policy "documents_select_tenant_team"
  on public.documents
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "documents_insert_tenant_team"
  on public.documents
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "documents_update_tenant_team"
  on public.documents
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
-- Grant de delete tambem nao foi concedido em 0030 -- nada a revogar aqui.

comment on policy "documents_select_tenant_team" on public.documents is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a documentos nesta leva (portal '
  'do cliente ver os proprios documentos e feature futura).';

-- Grants: `documents` ja tem exatamente `select, insert, update` concedido
-- a `authenticated` desde 0030 -- bate exatamente com as 3 policies acima.
-- Nada concedido a `anon`. Nenhuma correcao necessaria (confirmado por
-- auditoria pos-push em information_schema.role_table_grants, ver commit).

-- =======================================================================
-- 2. storage.objects (bucket `documents`)
-- =======================================================================
--
-- RLS ja vem habilitada por padrao pelo Supabase em storage.objects (nao e
-- necessario, nem eu deveria, rodar `alter table storage.objects enable row
-- level security` aqui) -- confirmado por auditoria pos-push
-- (pg_class.relrowsecurity = true) antes desta migration existir. As
-- policies abaixo sao restritas ao bucket `documents`
-- (`bucket_id = 'documents'`) -- nao afetam nenhum outro bucket futuro.
--
-- Convencao de path (documentada em 0031, o frontend precisa seguir
-- exatamente isto): {tenant_id}/{uuid_ou_timestamp}-{nome_original}. O
-- PRIMEIRO segmento do path (`(storage.foldername(name))[1]`) e sempre o
-- tenant_id -- e o que isola por tenant abaixo. Path de qualquer objeto que
-- nao comece com o tenant_id do proprio usuario (do claim, nunca do client)
-- e rejeitado tanto para leitura (using) quanto para escrita (with check).
--
-- NOTA: os grants de tabela (INSERT/SELECT/UPDATE/DELETE) em storage.objects
-- para `anon`/`authenticated` sao os grants DEFAULT da extensao de Storage
-- do Supabase, presentes em todo projeto (nao foram concedidos por nenhuma
-- migration deste repo, e nao sao revogados aqui -- revogar privilegio de
-- tabela de um schema gerenciado pela extensao arrisca quebrar a Storage
-- API). Isso e seguro porque RLS ja esta habilitada e, sem nenhuma policy
-- que autorize `anon`, ZERO linhas ficam visiveis/graváveis por esse papel,
-- independente do grant de tabela -- confirmado no teste de isolamento
-- (supabase/tests/0032_documents_isolation.sql).

create policy "documents_bucket_select_tenant_team"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "documents_bucket_insert_tenant_team"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE/DELETE em storage.objects, de proposito (decisao de
-- produto registrada aqui, nao no schema-architect): um re-upload deveria
-- virar um NOVO objeto (novo path, com timestamp/uuid diferente) + um novo
-- `documents.file_url` via UPDATE na tabela (ja coberto pela policy de
-- UPDATE de `documents` acima) -- nao uma substituicao in-place do arquivo
-- no bucket. Exclusao de documento e sempre soft-delete na tabela
-- `documents` (is_deleted); o objeto correspondente no bucket pode ficar
-- orfao -- uma rotina de limpeza (ex.: Edge Function agendada comparando
-- storage.objects com documents.file_url) e decisao de produto futura, fora
-- do escopo desta migration. Sem policy de update/delete aqui, qualquer
-- tentativa nesse sentido e negada por padrao pela RLS.
--
-- Nada para `anon` -- bucket privado, sem leitura/escrita publica.
