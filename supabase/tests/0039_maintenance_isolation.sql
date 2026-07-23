-- 0039_maintenance_isolation.sql
-- Teste de isolamento para a RLS de `maintenance_requests` e de
-- `storage.objects` (bucket `maintenance-photos`) introduzida em
-- supabase/migrations/0039_rls_maintenance_requests.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0032_documents_isolation.sql/
-- 0036_inspections_isolation.sql: rodado via `supabase db query --linked`
-- (banco remoto ja linkado), nao via `supabase test db` (pgTAP exige
-- Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0039_maintenance_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0039_maintenance_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/clients/
-- maintenance_requests/storage.objects) fica no banco, mesmo rodando contra
-- o projeto remoto real. Qualquer assercao que falhe faz `raise exception`,
-- abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST/Storage API
-- fazem numa requisicao autenticada -- igual ao padrao de 0032/0036.
--
-- Nao da pra fazer upload de arquivo de verdade via SQL puro -- este teste
-- insere linhas diretamente em `storage.objects` (bucket_id, name, owner)
-- simulando dois tenants, mesmo criterio de 0032/0036.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client). Nenhuma
-- Edge Function deste modulo usa service_role hoje (confirmado: nao ha
-- Edge Function de manutencao pos-entrega no projeto ainda) -- ponto a
-- revisitar quando/se uma for criada. Auditoria de grants
-- (information_schema.role_table_grants) feita a parte, fora deste script,
-- confirmou que `authenticated` tem exatamente select/insert/update em
-- `maintenance_requests` (sem delete), bate exatamente com os grants ja
-- concedidos em 0037. `anon` sem NENHUM privilegio na tabela. Em
-- `storage.objects`, `anon`/`authenticated` ja tem grants de tabela AMPLOS
-- por padrao (parte da extensao de Storage do Supabase) -- o isolamento
-- real vem inteiramente das policies de RLS testadas abaixo, restritas a
-- `bucket_id = 'maintenance-photos'` (confirmado que nao afetam os buckets
-- `documents`/`inspection-media`).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (papel interno) nao le nem escreve `maintenance_requests` nem
--    storage.objects do Tenant B, e vice-versa (isolamento nos dois
--    sentidos).
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO nao
--    enxerga NENHUMA linha em `maintenance_requests` nem em storage.objects,
--    e nao consegue inserir em nenhuma delas -- prova que a RLS nega por
--    papel, nao so por tenant (confirma o escopo desta rodada: sem portal
--    do cliente, so equipe interna mexe em manutencao).
-- 3. Usuario com tenant_role in ('admin','comercial','administrativo') do
--    tenant certo consegue criar um chamado, fazer upload no bucket
--    `maintenance-photos` e ATUALIZAR o chamado (incl. soft-delete via
--    is_deleted).
-- 4. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma linha
--    em `maintenance_requests` nem em storage.objects.
-- 5. WITH CHECK bloqueia INSERT cross-tenant (payload malicioso tentando
--    gravar tenant_id de outro tenant, ou path de storage.objects comecando
--    com o tenant_id de outro tenant) -- e USING bloqueia UPDATE
--    cross-tenant (0 linhas afetadas, sem erro).
-- 6. storage.objects: SEM policy de UPDATE/DELETE de proposito -- UPDATE,
--    mesmo dentro do proprio tenant e por papel autorizado, afeta 0 linhas.

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
  ('f1000000-0000-0000-0000-000000000001'), -- user_a_comercial: tenant A, comercial
  ('f1000000-0000-0000-0000-000000000002'), -- user_a_cliente: tenant A, cliente
  ('f1000000-0000-0000-0000-000000000003'), -- user_a_investidor: tenant A, investidor
  ('f1000000-0000-0000-0000-000000000004'), -- user_b_admin: tenant B, admin
  ('f1000000-0000-0000-0000-000000000005'), -- user_orphan: sem tenant_users
  ('f1000000-0000-0000-0000-000000000006'); -- user_a_administrativo: tenant A, administrativo

insert into public.tenants (id, name, slug) values
  ('f2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento manutencao 0039', 'tenant-a-teste-isolamento-manutencao-0039'),
  ('f2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento manutencao 0039', 'tenant-b-teste-isolamento-manutencao-0039');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000001', 'comercial', 'active'),
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000002', 'cliente', 'active'),
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000003', 'investidor', 'active'),
  ('f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000006', 'administrativo', 'active'),
  ('f2000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-000000000004', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario --
-- os testes reais de leitura/escrita usam os roles simulados abaixo).
-- Cadeia completa por tenant: project -> unit -> client -> maintenance_request
-- -> storage.objects.

insert into public.projects (id, tenant_id, code, name) values
  ('f3000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'PROJ-A-0039', 'Projeto Tenant A'),
  ('f3000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-00000000000b', 'PROJ-B-0039', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('f4000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'UN-A-0039', 100000),
  ('f4000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-00000000000b', 'UN-B-0039', 100000);

insert into public.clients (id, tenant_id, name) values
  ('f5000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'Cliente Tenant A'),
  ('f5000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-00000000000b', 'Cliente Tenant B');

insert into public.maintenance_requests (id, tenant_id, project_id, unit_id, client_id, title, description) values
  ('f6000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'Chamado Tenant A', 'Descricao A'),
  ('f6000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-00000000000b', 'f4000000-0000-0000-0000-00000000000b', 'f5000000-0000-0000-0000-00000000000b', 'Chamado Tenant B', 'Descricao B');

insert into storage.objects (id, bucket_id, name, owner) values
  ('f7000000-0000-0000-0000-00000000000a', 'maintenance-photos', 'f2000000-0000-0000-0000-00000000000a/teste-a.jpg', 'f1000000-0000-0000-0000-000000000001'),
  ('f7000000-0000-0000-0000-00000000000b', 'maintenance-photos', 'f2000000-0000-0000-0000-00000000000b/teste-b.jpg', 'f1000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A ve exatamente o chamado do
-- proprio tenant e o objeto do proprio tenant no bucket, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000001","tenant_id":"f2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_requests int; v_objs int; v_requests_b int; v_objs_b int;
begin
  select count(*) into v_requests from public.maintenance_requests;
  select count(*) into v_objs from storage.objects where bucket_id = 'maintenance-photos';

  if v_requests <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha (requests=%, storage=%)', v_requests, v_objs;
  end if;

  select count(*) into v_requests_b from public.maintenance_requests where tenant_id = 'f2000000-0000-0000-0000-00000000000b';
  select count(*) into v_objs_b from storage.objects where bucket_id = 'maintenance-photos' and name like 'f2000000-0000-0000-0000-00000000000b/%';

  if v_requests_b <> 0 or v_objs_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (requests=%, storage.objects=%)', v_requests_b, v_objs_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000004","tenant_id":"f2000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_requests int; v_objs int; v_requests_a int; v_objs_a int;
begin
  select count(*) into v_requests from public.maintenance_requests;
  select count(*) into v_objs from storage.objects where bucket_id = 'maintenance-photos';

  if v_requests <> 1 or v_objs <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha (requests=%, storage=%)', v_requests, v_objs;
  end if;

  select count(*) into v_requests_a from public.maintenance_requests where tenant_id = 'f2000000-0000-0000-0000-00000000000a';
  select count(*) into v_objs_a from storage.objects where bucket_id = 'maintenance-photos' and name like 'f2000000-0000-0000-0000-00000000000a/%';

  if v_requests_a <> 0 or v_objs_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (requests=%, storage.objects=%)', v_requests_a, v_objs_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel errado) nao
-- enxerga NENHUMA linha em maintenance_requests nem storage.objects, mesmo
-- o dado do proprio tenant existindo de verdade -- e nao consegue inserir
-- em nenhuma delas. Confirma o escopo desta rodada: sem portal do cliente,
-- so equipe interna mexe em manutencao.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000002","tenant_id":"f2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_requests int; v_objs int;
begin
  select count(*) into v_requests from public.maintenance_requests;
  select count(*) into v_objs from storage.objects where bucket_id = 'maintenance-photos';

  if v_requests <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (requests=%, storage=%)', v_requests, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'Tentativa cliente', 'desc');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em maintenance_requests -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('maintenance-photos', 'f2000000-0000-0000-0000-00000000000a/tentativa-cliente.jpg', 'f1000000-0000-0000-0000-000000000002');
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
  '{"sub":"f1000000-0000-0000-0000-000000000003","tenant_id":"f2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_requests int; v_objs int;
begin
  select count(*) into v_requests from public.maintenance_requests;
  select count(*) into v_objs from storage.objects where bucket_id = 'maintenance-photos';

  if v_requests <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (requests=%, storage=%)', v_requests, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'Tentativa investidor', 'desc');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em maintenance_requests -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('maintenance-photos', 'f2000000-0000-0000-0000-00000000000a/tentativa-investidor.jpg', 'f1000000-0000-0000-0000-000000000003');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4c): tenant_role=investidor conseguiu inserir em storage.objects -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'administrativo' do tenant A consegue criar um chamado, fazer
-- upload em storage.objects (prova positiva de insert/select) e ATUALIZAR o
-- chamado (incl. soft-delete via is_deleted). WITH CHECK bloqueia insert
-- cross-tenant (maintenance_requests e storage.objects). USING bloqueia
-- UPDATE cross-tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000006","tenant_id":"f2000000-0000-0000-0000-00000000000a","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_request_id uuid;
  v_obj_id uuid;
begin
  insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'Chamado criado por administrativo', 'desc')
    returning id into v_request_id;

  insert into storage.objects (bucket_id, name, owner)
    values ('maintenance-photos', 'f2000000-0000-0000-0000-00000000000a/1721606400000-novo-chamado.jpg', 'f1000000-0000-0000-0000-000000000006')
    returning id into v_obj_id;

  if v_request_id is null or v_obj_id is null then
    raise exception 'FALHOU (5a): tenant_role=administrativo do tenant certo deveria conseguir inserir em maintenance_requests e em storage.objects';
  end if;

  if not exists (select 1 from public.maintenance_requests where id = v_request_id)
    or not exists (select 1 from storage.objects where id = v_obj_id) then
    raise exception 'FALHOU (5b): administrativo nao consegue ver alguma das linhas que acabou de criar';
  end if;

  -- UPDATE deve funcionar, incl. soft-delete via is_deleted.
  update public.maintenance_requests set operator_notes = 'atualizado', status = 'em_andamento' where id = v_request_id;

  if not exists (select 1 from public.maintenance_requests where id = v_request_id and operator_notes = 'atualizado' and status = 'em_andamento') then
    raise exception 'FALHOU (5c): administrativo deveria conseguir atualizar maintenance_requests';
  end if;

  update public.maintenance_requests set is_deleted = true, deleted_at = now(), deleted_by_user_id = 'f1000000-0000-0000-0000-000000000006' where id = v_request_id;

  if not exists (select 1 from public.maintenance_requests where id = v_request_id and is_deleted = true) then
    raise exception 'FALHOU (5d): administrativo deveria conseguir fazer soft-delete (UPDATE is_deleted) em maintenance_requests';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant em maintenance_requests (payload
-- malicioso tentando "escapar" do tenant do claim) deve ser bloqueada pelo
-- WITH CHECK.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('f2000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-00000000000b', 'f4000000-0000-0000-0000-00000000000b', 'f5000000-0000-0000-0000-00000000000b', 'Tentativa cross-tenant', 'desc');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5e): administrativo do tenant A conseguiu inserir maintenance_request com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
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
    values ('maintenance-photos', 'f2000000-0000-0000-0000-00000000000b/upload-malicioso.jpg', 'f1000000-0000-0000-0000-000000000006');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5f): administrativo do tenant A conseguiu inserir objeto de storage cujo path comeca com o tenant_id do tenant B -- WITH CHECK nao esta bloqueando upload cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant em maintenance_requests: linha do tenant B nem
-- aparece para o UPDATE (USING filtra por tenant_id do claim) -- 0 linhas
-- afetadas, sem erro.
do $$
declare v_linhas_afetadas int;
begin
  update public.maintenance_requests set operator_notes = 'tentativa cross-tenant'
    where tenant_id = 'f2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5g): administrativo do tenant A conseguiu dar UPDATE em % linha(s) de maintenance_requests do tenant B -- RLS de UPDATE nao esta isolando por tenant', v_linhas_afetadas;
  end if;
end $$;

-- storage.objects: SEM policy de UPDATE/DELETE de proposito -- UPDATE,
-- mesmo dentro do proprio tenant e por papel autorizado, afeta 0 linhas
-- (RLS nega por padrao quando nao ha policy pro comando, mesmo com grant de
-- tabela presente por default da extensao de Storage).
do $$
declare v_linhas_afetadas int;
begin
  update storage.objects set owner = 'f1000000-0000-0000-0000-000000000006'
    where bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = 'f2000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (5h): administrativo conseguiu dar UPDATE em % objeto(s) de storage.objects -- deveria ser negado por padrao (sem policy de update)', v_linhas_afetadas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em maintenance_requests nem em storage.objects.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_requests int; v_objs int;
begin
  select count(*) into v_requests from public.maintenance_requests;
  select count(*) into v_objs from storage.objects where bucket_id = 'maintenance-photos';

  if v_requests <> 0 or v_objs <> 0 then
    raise exception 'FALHOU (6): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (requests=%, storage=%)', v_requests, v_objs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.maintenance_requests (tenant_id, project_id, unit_id, client_id, title, description)
    values ('f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'Tentativa orfao', 'desc');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6b): usuario sem tenant_id no claim conseguiu inserir em maintenance_requests -- RLS nao esta bloqueando por ausencia de claim';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0039 - Manutencao + Storage)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
