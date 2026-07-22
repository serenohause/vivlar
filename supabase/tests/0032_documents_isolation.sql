-- 0032_documents_isolation.sql
-- Teste de isolamento para a RLS de `documents` e de `storage.objects`
-- (bucket `documents`) introduzida em
-- supabase/migrations/0032_rls_documents.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0002_tenant_isolation.sql,
-- .../0010_catalog_isolation.sql, .../0017_crm_isolation.sql,
-- .../0023_financeiro_isolation.sql e .../0027_comissoes_isolation.sql:
-- rodado via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0032_documents_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0032_documents_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/documents/storage.objects) fica
-- no banco, mesmo rodando contra o projeto remoto real. Qualquer assercao
-- que falhe faz `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST/Storage API
-- fazem numa requisicao autenticada -- igual ao padrao de
-- 0002/0010/0017/0023/0027.
--
-- Nao da pra fazer upload de arquivo de verdade via SQL puro -- este teste
-- insere linhas diretamente em `storage.objects` (bucket_id, name, owner)
-- simulando dois tenants, adaptado ao schema real de storage.objects
-- (conferido via information_schema.columns antes de escrever este script:
-- unica FK e `bucket_id -> storage.buckets(id)`; `path_tokens` e coluna
-- GERADA a partir de `name`, nao precisa ser inserida a mao).
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Auditoria de grants (information_schema.role_table_grants) feita a parte,
-- fora deste script, confirmou que `authenticated` tem exatamente
-- select/insert/update em `documents` (sem delete -- soft delete via
-- update), `anon` sem NENHUM privilegio em `documents`. Em
-- `storage.objects`, `anon`/`authenticated` ja tem grants de tabela AMPLOS
-- por padrao (parte da extensao de Storage do Supabase, presentes em todo
-- projeto, nao concedidos por nenhuma migration deste repo) -- o isolamento
-- real vem inteiramente das policies de RLS testadas abaixo, nao dos
-- grants de tabela (ver comentario em 0032_rls_documents.sql).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve documents/storage.objects
--    do Tenant B, e vice-versa (isolamento nos dois sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO nao
--    enxerga NENHUMA linha em documents nem em storage.objects, e nao
--    consegue inserir em nenhuma das duas -- prova que a RLS nega por
--    papel, nao so por tenant.
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue INSERIR e VER documents e objetos do bucket
--    `documents` desse tenant, e ATUALIZAR documents.
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma linha
--    em documents nem em storage.objects.
-- 5. WITH CHECK bloqueia INSERT cross-tenant em `documents` (payload
--    malicioso tentando gravar tenant_id de outro tenant) e, especificamente,
--    bloqueia INSERT em `storage.objects` cujo path COMECA com o tenant_id
--    de OUTRO tenant (o client nao pode escolher fazer upload na pasta de
--    outro tenant) -- e USING bloqueia UPDATE cross-tenant em `documents`
--    (0 linhas afetadas, sem erro).
-- 6. Sem policy de UPDATE/DELETE em `storage.objects`: tentativa de UPDATE
--    (mesmo dentro do proprio tenant, papel autorizado) afeta 0 linhas --
--    RLS nega por padrao quando nao ha policy pro comando, mesmo com grant
--    de tabela presente.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants; no tenant A um usuario 'comercial' (deve ter
-- acesso), um 'cliente' (nao deve), um 'investidor' (nao deve) e um
-- 'administrativo' (usado no teste positivo de insert/update); no tenant B
-- um 'admin' (dono dos dados "do outro lado", prova isolamento
-- cross-tenant); e um usuario orfao, sem tenant_users (0 vinculos ativos).
-- IDs fixos para o script inteiro ser SQL puro.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('f1111111-1111-1111-1111-111111111111'), -- user_a_comercial: tenant A, comercial
  ('f2222222-2222-2222-2222-222222222222'), -- user_a_cliente: tenant A, cliente
  ('f3333333-1111-1111-1111-111111111111'), -- user_a_investidor: tenant A, investidor
  ('f4444444-1111-1111-1111-111111111111'), -- user_b_admin: tenant B, admin
  ('f5555555-1111-1111-1111-111111111111'), -- user_orphan: sem tenant_users
  ('f6666666-1111-1111-1111-111111111111'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('f7777777-7777-7777-7777-777777777777', 'Tenant A - teste isolamento documentos 0032', 'tenant-a-teste-isolamento-documentos-0032'),
  ('f8888888-8888-8888-8888-888888888888', 'Tenant B - teste isolamento documentos 0032', 'tenant-b-teste-isolamento-documentos-0032');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('f7777777-7777-7777-7777-777777777777', 'f1111111-1111-1111-1111-111111111111', 'comercial', 'active'),
  ('f7777777-7777-7777-7777-777777777777', 'f2222222-2222-2222-2222-222222222222', 'cliente', 'active'),
  ('f7777777-7777-7777-7777-777777777777', 'f3333333-1111-1111-1111-111111111111', 'investidor', 'active'),
  ('f7777777-7777-7777-7777-777777777777', 'f6666666-1111-1111-1111-111111111111', 'administrativo', 'active'),
  ('f8888888-8888-8888-8888-888888888888', 'f4444444-1111-1111-1111-111111111111', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario -- os
-- testes reais de leitura/escrita usam os roles simulados abaixo).
-- project_id/unit_id/deal_id ficam de fora de proposito -- todos nullable
-- (ver 0030), nao sao relevantes para o isolamento por tenant_id/role.

insert into public.documents (id, tenant_id, doc_type, title, status)
values
  ('f9111111-1111-1111-1111-111111111111', 'f7777777-7777-7777-7777-777777777777', 'outros', 'Documento Tenant A', 'recebido'),
  ('fa111111-1111-1111-1111-111111111111', 'f8888888-8888-8888-8888-888888888888', 'outros', 'Documento Tenant B', 'recebido');

insert into storage.objects (id, bucket_id, name, owner)
values
  ('fb111111-1111-1111-1111-111111111111', 'documents', 'f7777777-7777-7777-7777-777777777777/teste-a.pdf', 'f1111111-1111-1111-1111-111111111111'),
  ('fc111111-1111-1111-1111-111111111111', 'documents', 'f8888888-8888-8888-8888-888888888888/teste-b.pdf', 'f4444444-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente os dados do
-- proprio tenant em documents e storage.objects (bucket documents), nada do
-- tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1111111-1111-1111-1111-111111111111","tenant_id":"f7777777-7777-7777-7777-777777777777","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_docs int; v_objs int; v_docs_b int; v_objs_b int;
begin
  select count(*) into v_docs from public.documents;
  select count(*) into v_objs from storage.objects where bucket_id = 'documents';

  select count(*) into v_docs_b from public.documents where tenant_id = 'f8888888-8888-8888-8888-888888888888';
  select count(*) into v_objs_b from storage.objects where bucket_id = 'documents' and name like 'f8888888-8888-8888-8888-888888888888/%';

  if v_docs <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em documents (%) e 1 objeto em storage.objects (%)', v_docs, v_objs;
  end if;

  if v_docs_b <> 0 or v_objs_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (documents=%, storage.objects=%)', v_docs_b, v_objs_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f4444444-1111-1111-1111-111111111111","tenant_id":"f8888888-8888-8888-8888-888888888888","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_docs int; v_objs int; v_docs_a int; v_objs_a int;
begin
  select count(*) into v_docs from public.documents;
  select count(*) into v_objs from storage.objects where bucket_id = 'documents';

  select count(*) into v_docs_a from public.documents where tenant_id = 'f7777777-7777-7777-7777-777777777777';
  select count(*) into v_objs_a from storage.objects where bucket_id = 'documents' and name like 'f7777777-7777-7777-7777-777777777777/%';

  if v_docs <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em documents (%) e 1 objeto em storage.objects (%)', v_docs, v_objs;
  end if;

  if v_docs_a <> 0 or v_objs_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (documents=%, storage.objects=%)', v_docs_a, v_objs_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha em documents nem storage.objects, mesmo o dado do
-- proprio tenant existindo de verdade -- e nao consegue inserir em nenhuma
-- das duas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f2222222-2222-2222-2222-222222222222","tenant_id":"f7777777-7777-7777-7777-777777777777","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_docs int; v_objs int;
begin
  select count(*) into v_docs from public.documents;
  select count(*) into v_objs from storage.objects where bucket_id = 'documents';

  if v_docs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (documents=%, storage.objects=%)', v_docs, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.documents (tenant_id, doc_type, title)
    values ('f7777777-7777-7777-7777-777777777777', 'outros', 'Tentativa cliente');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em documents -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('documents', 'f7777777-7777-7777-7777-777777777777/tentativa-cliente.pdf', 'f2222222-2222-2222-2222-222222222222');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em storage.objects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3, para
-- o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f3333333-1111-1111-1111-111111111111","tenant_id":"f7777777-7777-7777-7777-777777777777","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_docs int; v_objs int;
begin
  select count(*) into v_docs from public.documents;
  select count(*) into v_objs from storage.objects where bucket_id = 'documents';

  if v_docs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (documents=%, storage.objects=%)', v_docs, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.documents (tenant_id, doc_type, title)
    values ('f7777777-7777-7777-7777-777777777777', 'outros', 'Tentativa investidor');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em documents -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('documents', 'f7777777-7777-7777-7777-777777777777/tentativa-investidor.pdf', 'f3333333-1111-1111-1111-111111111111');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4c): tenant_role=investidor conseguiu inserir em storage.objects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue INSERIR e VER em documents
-- e storage.objects (prova positiva), e ATUALIZAR documents. WITH CHECK
-- bloqueia insert cross-tenant nas duas tabelas (o caso especifico exigido:
-- path de storage.objects comecando com tenant_id de OUTRO tenant). USING
-- bloqueia UPDATE cross-tenant em documents.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f6666666-1111-1111-1111-111111111111","tenant_id":"f7777777-7777-7777-7777-777777777777","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_doc_id uuid;
  v_obj_id uuid;
begin
  insert into public.documents (tenant_id, doc_type, title)
    values ('f7777777-7777-7777-7777-777777777777', 'rg_cpf_cliente', 'Documento criado por administrativo')
    returning id into v_doc_id;

  insert into storage.objects (bucket_id, name, owner)
    values ('documents', 'f7777777-7777-7777-7777-777777777777/1721606400000-novo.pdf', 'f6666666-1111-1111-1111-111111111111')
    returning id into v_obj_id;

  if v_doc_id is null or v_obj_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir em documents e storage.objects';
  end if;

  if not exists (select 1 from public.documents where id = v_doc_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver o document que acabou de criar';
  end if;
  if not exists (select 1 from storage.objects where id = v_obj_id) then
    raise exception 'FALHOU (5c): administrativo nao consegue ver o objeto de storage que acabou de criar';
  end if;

  -- UPDATE em documents deve funcionar.
  update public.documents set status = 'aprovado' where id = v_doc_id;
  if not exists (select 1 from public.documents where id = v_doc_id and status = 'aprovado') then
    raise exception 'FALHOU (5d): administrativo deveria conseguir atualizar documents (status = aprovado)';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant em documents (payload malicioso tentando
-- "escapar" do tenant do claim) deve ser bloqueada pelo WITH CHECK.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.documents (tenant_id, doc_type, title)
    values ('f8888888-8888-8888-8888-888888888888', 'outros', 'Tentativa cross-tenant');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5e): administrativo do tenant A conseguiu inserir document com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
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
    values ('documents', 'f8888888-8888-8888-8888-888888888888/upload-malicioso.pdf', 'f6666666-1111-1111-1111-111111111111');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5f): administrativo do tenant A conseguiu inserir objeto de storage cujo path comeca com o tenant_id do tenant B -- WITH CHECK nao esta bloqueando upload cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant em documents: linha do tenant B nem aparece para o
-- UPDATE (USING filtra por tenant_id do claim) -- 0 linhas afetadas, sem
-- erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.documents set status = 'rejeitado'
    where tenant_id = 'f8888888-8888-8888-8888-888888888888';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5g): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de documents do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- storage.objects: SEM policy de UPDATE/DELETE de proposito (ver
-- 0032_rls_documents.sql) -- UPDATE, mesmo dentro do proprio tenant e por
-- papel autorizado, afeta 0 linhas (RLS nega por padrao quando nao ha
-- policy pro comando, mesmo com grant de tabela presente por default da
-- extensao de Storage).
do $$
declare v_linhas_afetadas int;
begin
  update storage.objects set owner = 'f6666666-1111-1111-1111-111111111111'
    where bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'f7777777-7777-7777-7777-777777777777';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5h): administrativo conseguiu dar UPDATE em % objeto(s) de storage.objects -- deveria ser negado por padrao (sem policy de update)', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em documents nem em storage.objects.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f5555555-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_docs int; v_objs int;
begin
  select count(*) into v_docs from public.documents;
  select count(*) into v_objs from storage.objects where bucket_id = 'documents';

  if v_docs <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (6): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (documents=%, storage.objects=%)', v_docs, v_objs;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0032 - Documentos + Storage)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
