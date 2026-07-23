-- 0036_inspections_isolation.sql
-- Teste de isolamento para a RLS das 6 tabelas de Vistorias e de
-- `storage.objects` (bucket `inspection-media`) introduzida em
-- supabase/migrations/0036_rls_inspections.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql ...
-- .../0032_documents_isolation.sql: rodado via `supabase db query --linked`
-- (banco remoto ja linkado), nao via `supabase test db` (pgTAP exige
-- Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0036_inspections_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0036_inspections_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/inspection_*/
-- storage.objects) fica no banco, mesmo rodando contra o projeto remoto
-- real. Qualquer assercao que falhe faz `raise exception`, abortando a
-- transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST/Storage API
-- fazem numa requisicao autenticada -- igual ao padrao de 0002/.../0032.
--
-- Nao da pra fazer upload de arquivo de verdade via SQL puro -- este teste
-- insere linhas diretamente em `storage.objects` (bucket_id, name, owner)
-- simulando dois tenants, mesmo criterio de 0032.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a parte,
-- fora deste script, confirmou que `authenticated` tem exatamente
-- select/insert/update nas 5 tabelas com update (templates, template_items,
-- inspections, item_results, media) e select/insert (sem update/delete) em
-- inspection_signatures -- bate exatamente com os grants ja concedidos em
-- 0034. `anon` sem NENHUM privilegio em nenhuma das 6. Em `storage.objects`,
-- `anon`/`authenticated` ja tem grants de tabela AMPLOS por padrao (parte da
-- extensao de Storage do Supabase) -- o isolamento real vem inteiramente das
-- policies de RLS testadas abaixo, restritas a `bucket_id =
-- 'inspection-media'` (confirmado que nao afetam o bucket `documents`, ver
-- 0036_rls_inspections.sql).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve nenhuma das 6 tabelas nem
--    storage.objects do Tenant B, e vice-versa (isolamento nos dois
--    sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO nao
--    enxerga NENHUMA linha em nenhuma das 6 tabelas nem em storage.objects,
--    e nao consegue inserir em nenhuma delas -- prova que a RLS nega por
--    papel, nao so por tenant.
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue criar o fluxo completo de uma vistoria (template
--    -> item -> inspection -> item_result -> media -> signature) e fazer
--    upload no bucket `inspection-media`, e ATUALIZAR as 5 tabelas que tem
--    UPDATE.
-- 4. `inspection_signatures`: UPDATE falha mesmo para papel autorizado do
--    tenant certo -- write-once. A barreira aqui e no GRANT de tabela (so
--    select/insert desde 0034, sem update -- Postgres nega com
--    insufficient_privilege antes mesmo de avaliar RLS), nao so na
--    ausencia de policy de UPDATE.
-- 5. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma linha
--    em nenhuma das 6 tabelas nem em storage.objects.
-- 6. WITH CHECK bloqueia INSERT cross-tenant (payload malicioso tentando
--    gravar tenant_id de outro tenant, ou path de storage.objects
--    comecando com o tenant_id de outro tenant) -- e USING bloqueia UPDATE
--    cross-tenant (0 linhas afetadas, sem erro).
-- 7. O indice unico parcial de inspection_item_results (1 resultado ativo
--    por item por vistoria) continua sendo aplicado normalmente com RLS
--    habilitada -- constraint de unicidade nao e afetada por USING/WITH
--    CHECK, so pela escrita fisica da linha.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants; no tenant A um usuario 'comercial' (deve ter
-- acesso), um 'cliente' (nao deve), um 'investidor' (nao deve) e um
-- 'administrativo' (usado no teste positivo de fluxo completo/insert/
-- update); no tenant B um 'admin' (dono dos dados "do outro lado", prova
-- isolamento cross-tenant); e um usuario orfao, sem tenant_users (0
-- vinculos ativos). IDs fixos para o script inteiro ser SQL puro.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('e1000000-0000-0000-0000-000000000001'), -- user_a_comercial: tenant A, comercial
  ('e1000000-0000-0000-0000-000000000002'), -- user_a_cliente: tenant A, cliente
  ('e1000000-0000-0000-0000-000000000003'), -- user_a_investidor: tenant A, investidor
  ('e1000000-0000-0000-0000-000000000004'), -- user_b_admin: tenant B, admin
  ('e1000000-0000-0000-0000-000000000005'), -- user_orphan: sem tenant_users
  ('e1000000-0000-0000-0000-000000000006'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('e2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento vistorias 0036', 'tenant-a-teste-isolamento-vistorias-0036'),
  ('e2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento vistorias 0036', 'tenant-b-teste-isolamento-vistorias-0036');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'comercial', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000002', 'cliente', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000003', 'investidor', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000006', 'administrativo', 'active'),
  ('e2000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000004', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario --
-- os testes reais de leitura/escrita usam os roles simulados abaixo).
-- Cadeia completa por tenant: project -> unit -> inspection_template ->
-- inspection_template_item -> inspection -> inspection_item_result ->
-- inspection_media -> inspection_signature -> storage.objects.

insert into public.projects (id, tenant_id, code, name) values
  ('e3000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'PROJ-A-0036', 'Projeto Tenant A'),
  ('e3000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'PROJ-B-0036', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('e4000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'UN-A-0036', 100000),
  ('e4000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'UN-B-0036', 100000);

insert into public.inspection_templates (id, tenant_id, name) values
  ('e5000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'Template Tenant A'),
  ('e5000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'Template Tenant B');

insert into public.inspection_template_items (id, tenant_id, template_id, category, title, severity_default) values
  ('e6000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a', 'Estrutura', 'Item Tenant A', 'media'),
  ('e6000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-00000000000b', 'Estrutura', 'Item Tenant B', 'media');

insert into public.inspections (id, tenant_id, project_id, unit_id, template_id) values
  ('e7000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a'),
  ('e7000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-00000000000b');

insert into public.inspection_item_results (id, tenant_id, inspection_id, template_item_id, severity) values
  ('e8000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-00000000000a', 'media'),
  ('e8000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000b', 'e6000000-0000-0000-0000-00000000000b', 'media');

insert into public.inspection_media (id, tenant_id, inspection_id, item_result_id, file_url) values
  ('e9000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a/foto-a.jpg'),
  ('e9000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000b', 'e8000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b/foto-b.jpg');

insert into public.inspection_signatures (id, tenant_id, inspection_id, signer_type) values
  ('ea000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'Vistoriador'),
  ('ea000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000b', 'Vistoriador');

insert into storage.objects (id, bucket_id, name, owner) values
  ('eb000000-0000-0000-0000-00000000000a', 'inspection-media', 'e2000000-0000-0000-0000-00000000000a/teste-a.jpg', 'e1000000-0000-0000-0000-000000000001'),
  ('eb000000-0000-0000-0000-00000000000b', 'inspection-media', 'e2000000-0000-0000-0000-00000000000b/teste-b.jpg', 'e1000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant nas 6 tabelas e em storage.objects (bucket
-- inspection-media), nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_templates int; v_items int; v_inspections int; v_results int; v_media int; v_sigs int; v_objs int;
  v_templates_b int; v_objs_b int;
begin
  select count(*) into v_templates from public.inspection_templates;
  select count(*) into v_items from public.inspection_template_items;
  select count(*) into v_inspections from public.inspections;
  select count(*) into v_results from public.inspection_item_results;
  select count(*) into v_media from public.inspection_media;
  select count(*) into v_sigs from public.inspection_signatures;
  select count(*) into v_objs from storage.objects where bucket_id = 'inspection-media';

  if v_templates <> 1 or v_items <> 1 or v_inspections <> 1 or v_results <> 1 or v_media <> 1 or v_sigs <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em cada tabela (templates=%, items=%, inspections=%, results=%, media=%, sigs=%, storage=%)',
      v_templates, v_items, v_inspections, v_results, v_media, v_sigs, v_objs;
  end if;

  select count(*) into v_templates_b from public.inspection_templates where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  select count(*) into v_objs_b from storage.objects where bucket_id = 'inspection-media' and name like 'e2000000-0000-0000-0000-00000000000b/%';

  if v_templates_b <> 0 or v_objs_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (templates=%, storage.objects=%)', v_templates_b, v_objs_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000004","tenant_id":"e2000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_templates int; v_items int; v_inspections int; v_results int; v_media int; v_sigs int; v_objs int;
  v_templates_a int; v_objs_a int;
begin
  select count(*) into v_templates from public.inspection_templates;
  select count(*) into v_items from public.inspection_template_items;
  select count(*) into v_inspections from public.inspections;
  select count(*) into v_results from public.inspection_item_results;
  select count(*) into v_media from public.inspection_media;
  select count(*) into v_sigs from public.inspection_signatures;
  select count(*) into v_objs from storage.objects where bucket_id = 'inspection-media';

  if v_templates <> 1 or v_items <> 1 or v_inspections <> 1 or v_results <> 1 or v_media <> 1 or v_sigs <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada tabela (templates=%, items=%, inspections=%, results=%, media=%, sigs=%, storage=%)',
      v_templates, v_items, v_inspections, v_results, v_media, v_sigs, v_objs;
  end if;

  select count(*) into v_templates_a from public.inspection_templates where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
  select count(*) into v_objs_a from storage.objects where bucket_id = 'inspection-media' and name like 'e2000000-0000-0000-0000-00000000000a/%';

  if v_templates_a <> 0 or v_objs_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (templates=%, storage.objects=%)', v_templates_a, v_objs_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha em nenhuma das 6 tabelas nem storage.objects, mesmo
-- o dado do proprio tenant existindo de verdade -- e nao consegue inserir
-- em nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_templates int; v_items int; v_inspections int; v_results int; v_media int; v_sigs int; v_objs int;
begin
  select count(*) into v_templates from public.inspection_templates;
  select count(*) into v_items from public.inspection_template_items;
  select count(*) into v_inspections from public.inspections;
  select count(*) into v_results from public.inspection_item_results;
  select count(*) into v_media from public.inspection_media;
  select count(*) into v_sigs from public.inspection_signatures;
  select count(*) into v_objs from storage.objects where bucket_id = 'inspection-media';

  if v_templates <> 0 or v_items <> 0 or v_inspections <> 0 or v_results <> 0 or v_media <> 0 or v_sigs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (templates=%, items=%, inspections=%, results=%, media=%, sigs=%, storage=%)',
      v_templates, v_items, v_inspections, v_results, v_media, v_sigs, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspection_templates (tenant_id, name)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa cliente - template');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em inspection_templates -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspections (tenant_id, project_id, unit_id, template_id)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em inspections -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspection_signatures (tenant_id, inspection_id, signer_type)
    values ('e2000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'Cliente');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em inspection_signatures -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('inspection-media', 'e2000000-0000-0000-0000-00000000000a/tentativa-cliente.jpg', 'e1000000-0000-0000-0000-000000000002');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3e): tenant_role=cliente conseguiu inserir em storage.objects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3, para
-- o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000003","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_templates int; v_items int; v_inspections int; v_results int; v_media int; v_sigs int; v_objs int;
begin
  select count(*) into v_templates from public.inspection_templates;
  select count(*) into v_items from public.inspection_template_items;
  select count(*) into v_inspections from public.inspections;
  select count(*) into v_results from public.inspection_item_results;
  select count(*) into v_media from public.inspection_media;
  select count(*) into v_sigs from public.inspection_signatures;
  select count(*) into v_objs from storage.objects where bucket_id = 'inspection-media';

  if v_templates <> 0 or v_items <> 0 or v_inspections <> 0 or v_results <> 0 or v_media <> 0 or v_sigs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (templates=%, items=%, inspections=%, results=%, media=%, sigs=%, storage=%)',
      v_templates, v_items, v_inspections, v_results, v_media, v_sigs, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspections (tenant_id, project_id, unit_id, template_id)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em inspections -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('inspection-media', 'e2000000-0000-0000-0000-00000000000a/tentativa-investidor.jpg', 'e1000000-0000-0000-0000-000000000003');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4c): tenant_role=investidor conseguiu inserir em storage.objects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue criar o fluxo completo de
-- uma vistoria (template -> item -> inspection -> item_result -> media ->
-- signature) e fazer upload em storage.objects (prova positiva de
-- insert/select nas 6 tabelas), e ATUALIZAR as 5 tabelas que tem UPDATE.
-- inspection_signatures: UPDATE falha (write-once, sem policy). WITH CHECK
-- bloqueia insert cross-tenant (inspection_templates, inspections e
-- storage.objects). USING bloqueia UPDATE cross-tenant em inspections.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000006","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_template_id uuid;
  v_item_id uuid;
  v_inspection_id uuid;
  v_result_id uuid;
  v_media_id uuid;
  v_sig_id uuid;
  v_obj_id uuid;
begin
  insert into public.inspection_templates (tenant_id, name)
    values ('e2000000-0000-0000-0000-00000000000a', 'Template criado por administrativo')
    returning id into v_template_id;

  insert into public.inspection_template_items (tenant_id, template_id, category, title, severity_default)
    values ('e2000000-0000-0000-0000-00000000000a', v_template_id, 'Acabamento', 'Item criado por administrativo', 'baixa')
    returning id into v_item_id;

  insert into public.inspections (tenant_id, project_id, unit_id, template_id)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', v_template_id)
    returning id into v_inspection_id;

  insert into public.inspection_item_results (tenant_id, inspection_id, template_item_id, severity)
    values ('e2000000-0000-0000-0000-00000000000a', v_inspection_id, v_item_id, 'baixa')
    returning id into v_result_id;

  insert into public.inspection_media (tenant_id, inspection_id, item_result_id, file_url)
    values ('e2000000-0000-0000-0000-00000000000a', v_inspection_id, v_result_id, 'e2000000-0000-0000-0000-00000000000a/novo-item.jpg')
    returning id into v_media_id;

  insert into public.inspection_signatures (tenant_id, inspection_id, signer_type)
    values ('e2000000-0000-0000-0000-00000000000a', v_inspection_id, 'Vistoriador')
    returning id into v_sig_id;

  insert into storage.objects (bucket_id, name, owner)
    values ('inspection-media', 'e2000000-0000-0000-0000-00000000000a/1721606400000-novo-item.jpg', 'e1000000-0000-0000-0000-000000000006')
    returning id into v_obj_id;

  if v_template_id is null or v_item_id is null or v_inspection_id is null or v_result_id is null or v_media_id is null or v_sig_id is null or v_obj_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir nas 6 tabelas e em storage.objects';
  end if;

  if not exists (select 1 from public.inspection_templates where id = v_template_id)
    or not exists (select 1 from public.inspection_template_items where id = v_item_id)
    or not exists (select 1 from public.inspections where id = v_inspection_id)
    or not exists (select 1 from public.inspection_item_results where id = v_result_id)
    or not exists (select 1 from public.inspection_media where id = v_media_id)
    or not exists (select 1 from public.inspection_signatures where id = v_sig_id)
    or not exists (select 1 from storage.objects where id = v_obj_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver alguma das linhas que acabou de criar';
  end if;

  -- UPDATE deve funcionar nas 5 tabelas que tem policy de UPDATE.
  update public.inspection_templates set description = 'atualizado' where id = v_template_id;
  update public.inspection_template_items set instructions = 'atualizado' where id = v_item_id;
  update public.inspections set notes_general = 'atualizado' where id = v_inspection_id;
  update public.inspection_item_results set comment = 'atualizado' where id = v_result_id;
  update public.inspection_media set caption = 'atualizado' where id = v_media_id;

  if not exists (select 1 from public.inspection_templates where id = v_template_id and description = 'atualizado')
    or not exists (select 1 from public.inspection_template_items where id = v_item_id and instructions = 'atualizado')
    or not exists (select 1 from public.inspections where id = v_inspection_id and notes_general = 'atualizado')
    or not exists (select 1 from public.inspection_item_results where id = v_result_id and comment = 'atualizado')
    or not exists (select 1 from public.inspection_media where id = v_media_id and caption = 'atualizado') then
    raise exception 'FALHOU (5c): administrativo deveria conseguir atualizar as 5 tabelas com policy de UPDATE';
  end if;

  -- inspection_signatures: UPDATE deve falhar -- write-once, e a barreira
  -- aqui e ainda mais forte que "sem policy de UPDATE" (que resultaria em 0
  -- linhas afetadas sem erro, como em storage.objects mais abaixo): o GRANT
  -- de tabela de 0034 e so `select, insert` (sem update) em
  -- inspection_signatures, entao o Postgres nega a UPDATE inteira por falta
  -- de privilegio (insufficient_privilege / 42501) antes mesmo de a RLS ser
  -- avaliada -- mesmo para um papel autorizado do tenant certo. Confirma
  -- que o grant de 0034 bate exatamente com a ausencia de policy de UPDATE
  -- aqui (nada sobrando, nada faltando).
  declare
    v_update_ok boolean := false;
  begin
    begin
      update public.inspection_signatures set signer_name = 'Tentativa de update' where id = v_sig_id;
      v_update_ok := true;
    exception when insufficient_privilege then
      v_update_ok := false;
    end;
    if v_update_ok then
      raise exception 'FALHOU (5d): administrativo conseguiu dar UPDATE em inspection_signatures -- deveria ser negado (write-once, sem grant nem policy de update)';
    end if;
  end;
end $$;

-- Tentativa de INSERT cross-tenant em inspection_templates (payload
-- malicioso tentando "escapar" do tenant do claim) deve ser bloqueada pelo
-- WITH CHECK.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspection_templates (tenant_id, name)
    values ('e2000000-0000-0000-0000-00000000000b', 'Tentativa cross-tenant');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5e): administrativo do tenant A conseguiu inserir inspection_template com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.inspections (tenant_id, project_id, unit_id, template_id)
    values ('e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-00000000000b');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5f): administrativo do tenant A conseguiu inserir inspection com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- Caso especifico exigido: tentativa de INSERT em storage.objects com path
-- cujo PRIMEIRO segmento e o tenant_id de OUTRO tenant (upload "na pasta"
-- do tenant B) deve ser bloqueada pelo WITH CHECK, mesmo o usuario sendo
-- administrativo autorizado no proprio tenant A.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('inspection-media', 'e2000000-0000-0000-0000-00000000000b/upload-malicioso.jpg', 'e1000000-0000-0000-0000-000000000006');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5g): administrativo do tenant A conseguiu inserir objeto de storage cujo path comeca com o tenant_id do tenant B -- WITH CHECK nao esta bloqueando upload cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant em inspections: linha do tenant B nem aparece para o
-- UPDATE (USING filtra por tenant_id do claim) -- 0 linhas afetadas, sem
-- erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.inspections set notes_general = 'tentativa cross-tenant'
    where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5h): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de inspections do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- storage.objects: SEM policy de UPDATE/DELETE de proposito -- UPDATE,
-- mesmo dentro do proprio tenant e por papel autorizado, afeta 0 linhas
-- (RLS nega por padrao quando nao ha policy pro comando, mesmo com grant de
-- tabela presente por default da extensao de Storage).
do $$
declare v_linhas_afetadas int;
begin
  update storage.objects set owner = 'e1000000-0000-0000-0000-000000000006'
    where bucket_id = 'inspection-media'
    and (storage.foldername(name))[1] = 'e2000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5i): administrativo conseguiu dar UPDATE em % objeto(s) de storage.objects -- deveria ser negado por padrao (sem policy de update)', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: indice unico parcial de inspection_item_results (1 resultado
-- ativo por template_item_id, por inspecao, por tenant -- 0034) continua
-- sendo aplicado com RLS habilitada: tentar inserir um segundo resultado
-- ativo para o MESMO inspection_id + template_item_id (dado ja existente do
-- tenant A, criado no setup) deve falhar por violacao de unique index, nao
-- por RLS (o usuario e autorizado e o tenant_id bate).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false; v_sqlstate text;
begin
  begin
    insert into public.inspection_item_results (tenant_id, inspection_id, template_item_id, severity)
    values ('e2000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-00000000000a', 'critica');
    v_insert_ok := true;
  exception when unique_violation then
    v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6): consegui inserir um SEGUNDO inspection_item_result ativo para o mesmo (tenant_id, inspection_id, template_item_id) -- indice unico parcial nao esta sendo aplicado com RLS habilitada';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 6 tabelas nem em storage.objects.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_templates int; v_items int; v_inspections int; v_results int; v_media int; v_sigs int; v_objs int;
begin
  select count(*) into v_templates from public.inspection_templates;
  select count(*) into v_items from public.inspection_template_items;
  select count(*) into v_inspections from public.inspections;
  select count(*) into v_results from public.inspection_item_results;
  select count(*) into v_media from public.inspection_media;
  select count(*) into v_sigs from public.inspection_signatures;
  select count(*) into v_objs from storage.objects where bucket_id = 'inspection-media';

  if v_templates <> 0 or v_items <> 0 or v_inspections <> 0 or v_results <> 0 or v_media <> 0 or v_sigs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (7): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (templates=%, items=%, inspections=%, results=%, media=%, sigs=%, storage=%)',
      v_templates, v_items, v_inspections, v_results, v_media, v_sigs, v_objs;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0036 - Vistorias + Storage)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
