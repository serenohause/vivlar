-- 0054_maintenance_photos_client_isolation.sql
-- Teste de isolamento para a RLS de `storage.objects` (bucket
-- `maintenance-photos`) para o papel `cliente`, introduzida em
-- supabase/migrations/0054_rls_maintenance_photos_client.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0039_maintenance_isolation.sql/
-- 0051_client_portal_isolation.sql/0053_client_portal_access_isolation.sql:
-- rodado via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0054_maintenance_photos_client_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0054_maintenance_photos_client_isolation.sql`.
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
-- fazem numa requisicao autenticada -- igual ao padrao de 0039/0051/0053.
-- Nao da pra fazer upload de arquivo de verdade via SQL puro -- este teste
-- insere linhas diretamente em `storage.objects` (bucket_id, name, owner)
-- simulando o cenario, mesmo criterio de 0039.
--
-- CENARIO: tenant A com DOIS clientes reais (cliente_1 e cliente_2), cada um
-- com o proprio chamado de manutencao e a propria foto no bucket -- prova o
-- caso central desta migration (isolamento ENTRE clientes do MESMO tenant,
-- nao so entre tenants). Tenant B com um chamado/foto "do outro lado" prova
-- isolamento cross-tenant tambem para o papel cliente. Equipe interna
-- (comercial) do tenant A testada para regressao (0039 continua valendo).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Cliente 1 consegue subir foto (INSERT) na propria pasta do tenant.
-- 2. Cliente 1 consegue ler (SELECT) a PROPRIA foto (referenciada no proprio
--    chamado).
-- 3. Cliente 1 NAO consegue ler a foto do chamado de Cliente 2 -- MESMO
--    tenant, MESMO bucket, path conhecido EXATO (simulando um cliente que
--    descobriu/adivinhou o path de outra foto) -- prova o caso central: so
--    tenant+role NAO bastaria, precisa da posse via maintenance_requests.
-- 4. Cliente 1 NAO consegue ler nem inserir foto na pasta do tenant B
--    (isolamento cross-tenant, mesmo papel).
-- 5. Equipe interna (comercial) do tenant A continua vendo TODAS as fotos do
--    tenant, incluindo as dos dois clientes -- sem regressao de 0039.
-- 6. Cliente 1 NAO consegue UPDATE/DELETE em nenhum objeto (sem policy,
--    mesmo criterio de 0039).

begin;

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('e1000000-0000-0000-0000-000000000001'), -- user_a_cliente_1: tenant A, cliente (dono do chamado 1)
  ('e1000000-0000-0000-0000-000000000002'), -- user_a_cliente_2: tenant A, cliente (dono do chamado 2)
  ('e1000000-0000-0000-0000-000000000003'), -- user_a_comercial: tenant A, equipe interna
  ('e1000000-0000-0000-0000-000000000004'); -- user_b_cliente: tenant B, cliente

insert into public.tenants (id, name, slug) values
  ('e2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento fotos manutencao cliente 0054', 'tenant-a-teste-0054'),
  ('e2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento fotos manutencao cliente 0054', 'tenant-b-teste-0054');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'cliente', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000002', 'cliente', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000003', 'comercial', 'active'),
  ('e2000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000004', 'cliente', 'active');

-- Dado "de fato existente", inserido diretamente como dono das tabelas
-- (bypassa RLS de proposito so pra popular o cenario). Cadeia completa por
-- tenant/cliente: project -> unit -> deal (vendido) -> client (user_id) ->
-- maintenance_request (com photos[]) -> storage.objects.

insert into public.projects (id, tenant_id, code, name) values
  ('e3000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'PROJ-A-0054', 'Projeto Tenant A'),
  ('e3000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'PROJ-B-0054', 'Projeto Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('e4000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'UN-A1-0054', 100000),
  ('e4000000-0000-0000-0000-00000000000c', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'UN-A2-0054', 100000),
  ('e4000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'UN-B-0054', 100000);

insert into public.clients (id, tenant_id, name, user_id) values
  ('e5000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'Cliente 1 Tenant A', 'e1000000-0000-0000-0000-000000000001'),
  ('e5000000-0000-0000-0000-00000000000c', 'e2000000-0000-0000-0000-00000000000a', 'Cliente 2 Tenant A', 'e1000000-0000-0000-0000-000000000002'),
  ('e5000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'Cliente Tenant B', 'e1000000-0000-0000-0000-000000000004');

insert into public.deals (id, tenant_id, project_id, client_id, unit_id, sales_stage) values
  ('e8000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'vendido'),
  ('e8000000-0000-0000-0000-00000000000c', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000c', 'e4000000-0000-0000-0000-00000000000c', 'vendido'),
  ('e8000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'vendido');

insert into public.maintenance_requests (id, tenant_id, project_id, unit_id, client_id, title, description, photos) values
  ('e6000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-00000000000a', 'Chamado Cliente 1', 'Descricao', array['e2000000-0000-0000-0000-00000000000a/1721606400000-foto-cliente-1.jpg']),
  ('e6000000-0000-0000-0000-00000000000c', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000c', 'e5000000-0000-0000-0000-00000000000c', 'Chamado Cliente 2', 'Descricao', array['e2000000-0000-0000-0000-00000000000a/1721606400001-foto-cliente-2.jpg']),
  ('e6000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-00000000000b', 'Chamado Tenant B', 'Descricao', array['e2000000-0000-0000-0000-00000000000b/1721606400002-foto-tenant-b.jpg']);

insert into storage.objects (id, bucket_id, name, owner) values
  ('e7000000-0000-0000-0000-00000000000a', 'maintenance-photos', 'e2000000-0000-0000-0000-00000000000a/1721606400000-foto-cliente-1.jpg', 'e1000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-00000000000c', 'maintenance-photos', 'e2000000-0000-0000-0000-00000000000a/1721606400001-foto-cliente-2.jpg', 'e1000000-0000-0000-0000-000000000002'),
  ('e7000000-0000-0000-0000-00000000000b', 'maintenance-photos', 'e2000000-0000-0000-0000-00000000000b/1721606400002-foto-tenant-b.jpg', 'e1000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------
-- TESTE 1 e 2: Cliente 1 (tenant A) consegue subir foto na propria pasta
-- (INSERT) e ler a PROPRIA foto (SELECT, referenciada no proprio chamado).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_obj_id uuid;
begin
  insert into storage.objects (bucket_id, name, owner)
    values ('maintenance-photos', 'e2000000-0000-0000-0000-00000000000a/1721606400099-upload-novo-cliente-1.jpg', 'e1000000-0000-0000-0000-000000000001')
    returning id into v_obj_id;

  if v_obj_id is null then
    raise exception 'FALHOU (1): cliente 1 deveria conseguir fazer INSERT na propria pasta do tenant no bucket maintenance-photos';
  end if;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from storage.objects
    where bucket_id = 'maintenance-photos'
    and name = 'e2000000-0000-0000-0000-00000000000a/1721606400000-foto-cliente-1.jpg';

  if v_count <> 1 then
    raise exception 'FALHOU (2): cliente 1 deveria conseguir ler a PROPRIA foto (referenciada no proprio chamado), encontrou %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 3: Cliente 1 NAO consegue ler a foto do chamado de Cliente 2 --
-- MESMO tenant, path EXATO conhecido (simula path adivinhado/observado).
-- Este e o caso central desta migration.
-- ---------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from storage.objects
    where bucket_id = 'maintenance-photos'
    and name = 'e2000000-0000-0000-0000-00000000000a/1721606400001-foto-cliente-2.jpg';

  if v_count <> 0 then
    raise exception 'FALHOU (3): cliente 1 NAO deveria conseguir ler a foto do chamado de cliente 2 (mesmo tenant, path exato conhecido) -- vazamento entre clientes do mesmo tenant';
  end if;
end $$;

-- Confirma tambem via contagem total: cliente 1 so enxerga 2 objetos no
-- bucket inteiro (o proprio antigo + o que acabou de subir no teste 1),
-- nunca a foto de cliente 2 nem de tenant B.
do $$
declare v_total int;
begin
  select count(*) into v_total from storage.objects where bucket_id = 'maintenance-photos';
  if v_total <> 2 then
    raise exception 'FALHOU (3b): cliente 1 deveria enxergar exatamente 2 objetos no bucket (proprios), encontrou %', v_total;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 4: Cliente 1 NAO consegue ler nem inserir foto na pasta do tenant B.
-- ---------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from storage.objects
    where bucket_id = 'maintenance-photos'
    and name = 'e2000000-0000-0000-0000-00000000000b/1721606400002-foto-tenant-b.jpg';

  if v_count <> 0 then
    raise exception 'FALHOU (4a): cliente 1 (tenant A) NAO deveria conseguir ler foto da pasta do tenant B';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('maintenance-photos', 'e2000000-0000-0000-0000-00000000000b/upload-malicioso-cliente.jpg', 'e1000000-0000-0000-0000-000000000001');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): cliente 1 (tenant A) conseguiu inserir objeto de storage na pasta do tenant B -- WITH CHECK nao esta bloqueando upload cross-tenant';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 6 (parte 1): Cliente 1 NAO consegue UPDATE/DELETE em objeto algum
-- (nem no proprio) -- sem policy pro papel cliente, mesmo criterio de 0039.
-- ---------------------------------------------------------------------

do $$
declare v_linhas_afetadas int;
begin
  update storage.objects set owner = 'e1000000-0000-0000-0000-000000000001'
    where bucket_id = 'maintenance-photos'
    and name = 'e2000000-0000-0000-0000-00000000000a/1721606400000-foto-cliente-1.jpg';
  get diagnostics v_linhas_afetadas = row_count;
  if v_linhas_afetadas <> 0 then
    raise exception 'FALHOU (6a): cliente 1 conseguiu dar UPDATE em % objeto(s) de storage.objects -- deveria ser negado por padrao (sem policy de update pro papel cliente)', v_linhas_afetadas;
  end if;
end $$;

-- DELETE direto em storage.objects e bloqueado em uma camada ANTES da RLS
-- pelo proprio Supabase Storage (trigger `storage.protect_delete()`, "Direct
-- deletion from storage tables is not allowed. Use the Storage API
-- instead.") -- capturado como excecao aqui (nao como 0 linhas afetadas),
-- mas o resultado pratico e o mesmo pedido pelo teste: cliente NAO consegue
-- apagar o objeto por este caminho, com ou sem policy de RLS de DELETE.
do $$
declare v_delete_ok boolean := false;
begin
  begin
    delete from storage.objects
      where bucket_id = 'maintenance-photos'
      and name = 'e2000000-0000-0000-0000-00000000000a/1721606400000-foto-cliente-1.jpg';
    v_delete_ok := true;
  exception when others then v_delete_ok := false;
  end;
  if v_delete_ok then
    raise exception 'FALHOU (6b): cliente 1 conseguiu dar DELETE em storage.objects -- deveria ser negado (sem policy de delete pro papel cliente, e protect_delete() do Storage)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: equipe interna (comercial) do tenant A continua vendo TODAS as
-- fotos do tenant, incluindo as de cliente 1 E cliente 2 -- sem regressao
-- de 0039 (policy da equipe interna nao foi tocada por esta migration).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000003","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_total int;
begin
  -- 3 objetos do tenant A no cenario original (cliente 1, cliente 2, + o
  -- que o proprio cliente 1 subiu no teste 1) -- equipe interna ve todos.
  select count(*) into v_total from storage.objects
    where bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = 'e2000000-0000-0000-0000-00000000000a';

  if v_total <> 3 then
    raise exception 'FALHOU (5a): equipe interna (comercial) do tenant A deveria ver 3 objetos do proprio tenant (regressao de 0039), encontrou %', v_total;
  end if;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from storage.objects
    where bucket_id = 'maintenance-photos'
    and name = 'e2000000-0000-0000-0000-00000000000a/1721606400001-foto-cliente-2.jpg';

  if v_count <> 1 then
    raise exception 'FALHOU (5b): equipe interna (comercial) deveria conseguir ler a foto do chamado de cliente 2 (ve tudo do tenant, regressao de 0039)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0054 - fotos de manutencao, papel cliente)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
