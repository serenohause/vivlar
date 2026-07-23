-- 0036_rls_inspections.sql
-- RLS das 6 tabelas de Vistorias (0034) e de `storage.objects` para o bucket
-- privado `inspection-media` (0035). Fecha a lacuna deixada de proposito nas
-- duas migrations anteriores (RLS PENDENTE), seguindo exatamente o mesmo
-- padrao ja estabelecido em 0002/0010/0017/0023/0027/0032
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao).
--
-- Tabelas e storage numa unica migration (mesma escolha de 0032): mesma
-- "leva" de trabalho, sobre o mesmo modulo, com a MESMA regra de
-- autorizacao (mesmos 3 papeis internos).
--
-- REGRA DE AUTORIZACAO (mesmo criterio de 0010/0023/0027/0032): so a equipe
-- interna do tenant mexe em vistorias. `tenant_role in ('admin', 'comercial',
-- 'administrativo')` do tenant certo (via claim) tem select/insert/update nas
-- 5 tabelas com update (templates, template_items, inspections, item_results,
-- media), e so select/insert em `inspection_signatures` (write-once, sem
-- update/delete no fluxo original, grant desde 0034 ja e so select/insert).
-- Mesma regra pros objetos do bucket `inspection-media` cujo primeiro
-- segmento do path bate com o tenant_id do claim. `cliente`/`investidor` NAO
-- tem nenhuma policy aqui -- RLS nega tudo por padrao pra eles, de proposito
-- (portal do cliente ver a propria vistoria e feature futura, fora de escopo
-- nesta leva).

-- =======================================================================
-- 1. inspection_templates
-- =======================================================================

alter table public.inspection_templates enable row level security;

create policy "inspection_templates_select_tenant_team"
  on public.inspection_templates
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_templates_insert_tenant_team"
  on public.inspection_templates
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_templates_update_tenant_team"
  on public.inspection_templates
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

comment on policy "inspection_templates_select_tenant_team" on public.inspection_templates is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a vistorias nesta leva.';

-- =======================================================================
-- 2. inspection_template_items
-- =======================================================================

alter table public.inspection_template_items enable row level security;

create policy "inspection_template_items_select_tenant_team"
  on public.inspection_template_items
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_template_items_insert_tenant_team"
  on public.inspection_template_items
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_template_items_update_tenant_team"
  on public.inspection_template_items
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

comment on policy "inspection_template_items_select_tenant_team" on public.inspection_template_items is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a vistorias nesta leva.';

-- =======================================================================
-- 3. inspections
-- =======================================================================

alter table public.inspections enable row level security;

create policy "inspections_select_tenant_team"
  on public.inspections
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspections_insert_tenant_team"
  on public.inspections
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspections_update_tenant_team"
  on public.inspections
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

comment on policy "inspections_select_tenant_team" on public.inspections is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- portal do cliente ver a propria vistoria e '
  'feature futura, fora de escopo nesta leva.';

-- =======================================================================
-- 4. inspection_item_results
-- =======================================================================

alter table public.inspection_item_results enable row level security;

create policy "inspection_item_results_select_tenant_team"
  on public.inspection_item_results
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_item_results_insert_tenant_team"
  on public.inspection_item_results
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_item_results_update_tenant_team"
  on public.inspection_item_results
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

comment on policy "inspection_item_results_select_tenant_team" on public.inspection_item_results is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a vistorias nesta leva. O indice '
  'unico parcial (tenant_id, inspection_id, template_item_id) where not '
  'is_deleted (0034) continua valendo normalmente com RLS habilitada -- '
  'unique index e aplicado pelo Postgres na escrita fisica da linha, nao e '
  'afetado por USING/WITH CHECK.';

-- =======================================================================
-- 5. inspection_media
-- =======================================================================

alter table public.inspection_media enable row level security;

create policy "inspection_media_select_tenant_team"
  on public.inspection_media
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_media_insert_tenant_team"
  on public.inspection_media
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_media_update_tenant_team"
  on public.inspection_media
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

comment on policy "inspection_media_select_tenant_team" on public.inspection_media is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a vistorias nesta leva.';

-- =======================================================================
-- 6. inspection_signatures (WRITE-ONCE -- so select/insert, sem update)
-- =======================================================================
--
-- Grant desde 0034 ja e so `select, insert` (sem update/delete) -- a policy
-- abaixo bate exatamente com isso: nenhuma policy de UPDATE e criada de
-- proposito, entao qualquer tentativa de UPDATE e negada por padrao pela
-- RLS, mesmo por um papel autorizado no proprio tenant (testado em
-- supabase/tests/0036_inspections_isolation.sql).

alter table public.inspection_signatures enable row level security;

create policy "inspection_signatures_select_tenant_team"
  on public.inspection_signatures
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_signatures_insert_tenant_team"
  on public.inspection_signatures
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "inspection_signatures_select_tenant_team" on public.inspection_signatures is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). SEM policy de UPDATE de '
  'proposito -- write-once, confirmado em 0034 (so InspectionSignature.'
  'create no original, sem .update()/.delete()). Grant de tabela ja e so '
  'select/insert desde a criacao -- bate exatamente com as 2 policies aqui.';

-- Grants: as 6 tabelas ja tem exatamente os privilegios esperados desde
-- 0034 -- select/insert/update para as 5 com update (templates,
-- template_items, inspections, item_results, media), select/insert (sem
-- update/delete) para inspection_signatures. Nada concedido a `anon` em
-- nenhuma das 6. Confirmado por auditoria pos-push em information_schema.
-- role_table_grants (ver commit) -- nenhuma correcao de grant necessaria
-- nesta migration, os grants de 0034 ja batem exatamente com as policies
-- acima.

-- =======================================================================
-- 7. storage.objects (bucket `inspection-media`)
-- =======================================================================
--
-- RLS ja vem habilitada por padrao pelo Supabase em storage.objects (nao e
-- necessario, nem eu deveria, rodar `alter table storage.objects enable row
-- level security` aqui) -- confirmado por auditoria pos-push
-- (pg_class.relrowsecurity = true) antes desta migration existir. As
-- policies abaixo sao restritas ao bucket `inspection-media`
-- (`bucket_id = 'inspection-media'`) -- nao afetam o bucket `documents`
-- (0032) nem nenhum outro bucket futuro.
--
-- Convencao de path (documentada em 0035, o frontend precisa seguir
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
-- (supabase/tests/0036_inspections_isolation.sql).

create policy "inspection_media_bucket_select_tenant_team"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "inspection_media_bucket_insert_tenant_team"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE/DELETE em storage.objects, de proposito (mesma
-- decisao de produto de 0032_rls_documents.sql, repetida aqui para o bucket
-- inspection-media): um re-upload deveria virar um NOVO objeto (novo path,
-- com timestamp/uuid diferente) + um novo `inspection_media.file_url` (ou
-- `inspection_signatures.signature_file_url`) via UPDATE/INSERT nas tabelas
-- correspondentes -- nao uma substituicao in-place do arquivo no bucket.
-- Exclusao de midia e sempre soft-delete na tabela `inspection_media`
-- (is_deleted); o objeto correspondente no bucket pode ficar orfao -- rotina
-- de limpeza e decisao de produto futura, fora do escopo desta migration.
-- `inspection_signatures` nem tem soft-delete (write-once) -- o objeto de
-- assinatura no bucket nunca deveria ser alterado nem removido de qualquer
-- forma pelo client. Sem policy de update/delete aqui, qualquer tentativa
-- nesse sentido e negada por padrao pela RLS.
--
-- Nada para `anon` -- bucket privado (0035, public = false), sem leitura ou
-- escrita publica.
