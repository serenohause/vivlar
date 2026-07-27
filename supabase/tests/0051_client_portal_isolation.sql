-- 0051_client_portal_isolation.sql
-- Teste de isolamento para a RLS de `unit_checks`, `construction_photos` e
-- `client_messages` introduzida em
-- supabase/migrations/0051_rls_client_portal.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0045_investors_isolation.sql: rodado via
-- `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0051_client_portal_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0051_client_portal_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/units/clients/deals/
-- unit_checks/construction_photos/client_messages) fica no banco, mesmo
-- rodando contra o projeto remoto real. Qualquer assercao que falhe faz
-- `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0036/0039/0045.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Confirmado que nao existe nenhuma Edge Function deste modulo hoje
-- (supabase/functions/ sem nada de portal do cliente).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Equipe interna (comercial) do tenant A le TODAS as linhas do proprio
--    tenant nas 3 tabelas (2 em cada -- unidades/projetos/clientes A1 e A2),
--    nada do tenant B.
-- 2. Simetrico: admin do tenant B le so a linha do proprio tenant, nada do
--    tenant A.
-- 3 e 4. DENTRO DO MESMO TENANT A: cliente1 (comprador da unidade A1) ve
--    SOMENTE o check/foto/mensagem ligados a ele -- NAO ve os de cliente2
--    (mesma tenant, unidade/projeto/cliente diferente). E vice-versa para
--    cliente2. Prova o item (b) pedido: isolamento por posse dentro do
--    MESMO tenant, nao so por tenant_id.
-- 5. CROSS-TENANT: cliente do tenant B nao ve nenhuma linha do tenant A,
--    mesmo tendo unidade/projeto/cliente proprios e "vendido" la. Prova o
--    item (a): isolamento entre tenants nas 3 tabelas novas.
-- 6. cliente1 NAO consegue INSERIR em nenhuma das 3 tabelas (sem policy de
--    INSERT para tenant_role=cliente -- so leitura no Portal).
-- 7. cliente1 NAO consegue ATUALIZAR a propria linha em nenhuma das 3
--    tabelas (sem policy de UPDATE para tenant_role=cliente -- 0 linhas
--    afetadas, sem erro).
-- 8. admin do tenant A CONSEGUE inserir e atualizar nas 3 tabelas (prova
--    positiva); WITH CHECK bloqueia INSERT cross-tenant.
-- 9. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve NENHUMA
--    linha em nenhuma das 3 tabelas, e nao consegue inserir em nenhuma.

begin;

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------
-- Tenant A: admin, comercial, administrativo, cliente1 (compra unidade A1
-- no projeto A1), cliente2 (compra unidade A2 no projeto A2 -- projeto
-- DIFERENTE do de cliente1, para provar isolamento por posse tambem em
-- construction_photos, que so tem project_id, sem FK direta de cliente).
-- Tenant B: admin, cliente (compra unidade B1 no projeto B1) -- prova
-- isolamento cross-tenant. Mais um usuario orfao, sem tenant_users.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('c1000000-0000-0000-0000-000000000001'), -- user_a_admin
  ('c1000000-0000-0000-0000-000000000002'), -- user_a_comercial
  ('c1000000-0000-0000-0000-000000000003'), -- user_a_administrativo
  ('c1000000-0000-0000-0000-000000000004'), -- user_a_cliente1
  ('c1000000-0000-0000-0000-000000000005'), -- user_a_cliente2
  ('c1000000-0000-0000-0000-000000000006'), -- user_b_admin
  ('c1000000-0000-0000-0000-000000000007'), -- user_b_cliente
  ('c1000000-0000-0000-0000-000000000008'); -- user_orphan

insert into public.tenants (id, name, slug) values
  ('c2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento portal cliente 0051', 'tenant-a-teste-isolamento-portal-cliente-0051'),
  ('c2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento portal cliente 0051', 'tenant-b-teste-isolamento-portal-cliente-0051');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000002', 'comercial', 'active'),
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000003', 'administrativo', 'active'),
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000004', 'cliente', 'active'),
  ('c2000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000005', 'cliente', 'active'),
  ('c2000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000006', 'admin', 'active'),
  ('c2000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000007', 'cliente', 'active');

-- Dado "de fato existente", inserido diretamente como dono das tabelas
-- (bypassa RLS de proposito so para popular o cenario -- os testes reais de
-- leitura/escrita usam os roles simulados abaixo). Cadeia:
-- project -> unit -> deal (vendido) -> client (user_id = auth.uid()).

insert into public.projects (id, tenant_id, code, name) values
  ('c3000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'PROJ-A1-0051', 'Projeto A1 Tenant A'),
  ('c3000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'PROJ-A2-0051', 'Projeto A2 Tenant A'),
  ('c3000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'PROJ-B1-0051', 'Projeto B1 Tenant B');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('c4000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'U-A1-0051', 200000),
  ('c4000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000b', 'U-A2-0051', 200000),
  ('c4000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000c', 'U-B1-0051', 200000);

insert into public.clients (id, tenant_id, name, user_id) values
  ('c5000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'Cliente A1', 'c1000000-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'Cliente A2', 'c1000000-0000-0000-0000-000000000005'),
  ('c5000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'Cliente B1', 'c1000000-0000-0000-0000-000000000007');

insert into public.deals (id, tenant_id, project_id, unit_id, client_id, sales_stage) values
  ('c6000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000a', 'vendido'),
  ('c6000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-00000000000b', 'vendido'),
  ('c6000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000c', 'c4000000-0000-0000-0000-00000000000c', 'c5000000-0000-0000-0000-00000000000c', 'vendido');

insert into public.unit_checks (id, tenant_id, unit_id, check_code, required_for_status, status) values
  ('c7000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000a', 'CONF_CORRESPONDENTE_OK', 'laudo_engenharia', 'concluido'),
  ('c7000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000b', 'CONF_CORRESPONDENTE_OK', 'laudo_engenharia', 'pendente'),
  ('c7000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000000c', 'CONF_CORRESPONDENTE_OK', 'laudo_engenharia', 'pendente');

insert into public.construction_photos (id, tenant_id, project_id, file_url, caption) values
  ('c8000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'https://example.com/a1.jpg', 'Fundacao A1'),
  ('c8000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000b', 'https://example.com/a2.jpg', 'Fundacao A2'),
  ('c8000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000c', 'https://example.com/b1.jpg', 'Fundacao B1');

insert into public.client_messages (id, tenant_id, client_id, direction, message) values
  ('c9000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000a', 'to_client', 'Mensagem para Cliente A1'),
  ('c9000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000b', 'to_client', 'Mensagem para Cliente A2'),
  ('c9000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-00000000000c', 'to_client', 'Mensagem para Cliente B1');

-- ---------------------------------------------------------------------
-- TESTE 1: 'comercial' do tenant A le TODAS as linhas do proprio tenant nas
-- 3 tabelas (2 em cada), nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000002","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
  v_checks_b int; v_photos_b int; v_msgs_b int;
begin
  select count(*) into v_checks from public.unit_checks;
  select count(*) into v_photos from public.construction_photos;
  select count(*) into v_msgs from public.client_messages;

  if v_checks <> 2 or v_photos <> 2 or v_msgs <> 2 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 2 linhas em cada tabela (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;

  select count(*) into v_checks_b from public.unit_checks where tenant_id = 'c2000000-0000-0000-0000-00000000000b';
  select count(*) into v_photos_b from public.construction_photos where tenant_id = 'c2000000-0000-0000-0000-00000000000b';
  select count(*) into v_msgs_b from public.client_messages where tenant_id = 'c2000000-0000-0000-0000-00000000000b';

  if v_checks_b <> 0 or v_photos_b <> 0 or v_msgs_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (checks=%, photos=%, msgs=%)', v_checks_b, v_photos_b, v_msgs_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: simetrico -- 'admin' do tenant B le so a propria linha em cada
-- tabela, nada do tenant A.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000006","tenant_id":"c2000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
  v_checks_a int; v_photos_a int; v_msgs_a int;
begin
  select count(*) into v_checks from public.unit_checks;
  select count(*) into v_photos from public.construction_photos;
  select count(*) into v_msgs from public.client_messages;

  if v_checks <> 1 or v_photos <> 1 or v_msgs <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada tabela (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;

  select count(*) into v_checks_a from public.unit_checks where tenant_id = 'c2000000-0000-0000-0000-00000000000a';
  select count(*) into v_photos_a from public.construction_photos where tenant_id = 'c2000000-0000-0000-0000-00000000000a';
  select count(*) into v_msgs_a from public.client_messages where tenant_id = 'c2000000-0000-0000-0000-00000000000a';

  if v_checks_a <> 0 or v_photos_a <> 0 or v_msgs_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (checks=%, photos=%, msgs=%)', v_checks_a, v_photos_a, v_msgs_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: cliente1 (tenant A, comprador da unidade A1/projeto A1) ve
-- EXATAMENTE 1 linha em cada tabela -- a SUA -- e NAO ve as de cliente2
-- (MESMO tenant, unidade/projeto/cliente diferente). Item (b) do pedido.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000004","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
  v_check_ids uuid[]; v_photo_ids uuid[]; v_msg_ids uuid[];
begin
  select count(*), array_agg(id) into v_checks, v_check_ids from public.unit_checks;
  select count(*), array_agg(id) into v_photos, v_photo_ids from public.construction_photos;
  select count(*), array_agg(id) into v_msgs, v_msg_ids from public.client_messages;

  if v_checks <> 1 or v_photos <> 1 or v_msgs <> 1 then
    raise exception 'FALHOU (3a): cliente1 deveria ver exatamente 1 linha em cada tabela (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;

  if v_check_ids <> array['c7000000-0000-0000-0000-00000000000a'::uuid]
    or v_photo_ids <> array['c8000000-0000-0000-0000-00000000000a'::uuid]
    or v_msg_ids <> array['c9000000-0000-0000-0000-00000000000a'::uuid]
  then
    raise exception 'FALHOU (3b): cliente1 deveria ver exatamente a PROPRIA linha em cada tabela (unidade/projeto/cliente A1), nao outra do mesmo tenant -- checks=%, photos=%, msgs=%', v_check_ids, v_photo_ids, v_msg_ids;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: cliente2 (tenant A, comprador da unidade A2/projeto A2) --
-- simetrico ao teste 3, prova isolamento cliente-vs-cliente nos dois
-- sentidos dentro do MESMO tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000005","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
  v_check_ids uuid[]; v_photo_ids uuid[]; v_msg_ids uuid[];
begin
  select count(*), array_agg(id) into v_checks, v_check_ids from public.unit_checks;
  select count(*), array_agg(id) into v_photos, v_photo_ids from public.construction_photos;
  select count(*), array_agg(id) into v_msgs, v_msg_ids from public.client_messages;

  if v_checks <> 1 or v_photos <> 1 or v_msgs <> 1 then
    raise exception 'FALHOU (4a): cliente2 deveria ver exatamente 1 linha em cada tabela (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;

  if v_check_ids <> array['c7000000-0000-0000-0000-00000000000b'::uuid]
    or v_photo_ids <> array['c8000000-0000-0000-0000-00000000000b'::uuid]
    or v_msg_ids <> array['c9000000-0000-0000-0000-00000000000b'::uuid]
  then
    raise exception 'FALHOU (4b): cliente2 deveria ver exatamente a PROPRIA linha em cada tabela (unidade/projeto/cliente A2), nao a de cliente1 -- checks=%, photos=%, msgs=%', v_check_ids, v_photo_ids, v_msg_ids;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: cliente do tenant B (comprador de unidade/projeto/cliente
-- proprios, "vendido" tambem) nao ve NENHUMA linha do tenant A -- so a
-- propria, do tenant B. Item (a) do pedido: cross-tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000007","tenant_id":"c2000000-0000-0000-0000-00000000000b","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
  v_check_ids uuid[]; v_photo_ids uuid[]; v_msg_ids uuid[];
begin
  select count(*), array_agg(id) into v_checks, v_check_ids from public.unit_checks;
  select count(*), array_agg(id) into v_photos, v_photo_ids from public.construction_photos;
  select count(*), array_agg(id) into v_msgs, v_msg_ids from public.client_messages;

  if v_checks <> 1 or v_photos <> 1 or v_msgs <> 1 then
    raise exception 'FALHOU (5a): cliente do tenant B deveria ver exatamente 1 linha (a propria) em cada tabela (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;

  if v_check_ids <> array['c7000000-0000-0000-0000-00000000000c'::uuid]
    or v_photo_ids <> array['c8000000-0000-0000-0000-00000000000c'::uuid]
    or v_msg_ids <> array['c9000000-0000-0000-0000-00000000000c'::uuid]
  then
    raise exception 'FALHOU (5b): cliente do tenant B deveria ver exatamente a PROPRIA linha (tenant B), nunca nada do tenant A -- checks=%, photos=%, msgs=%', v_check_ids, v_photo_ids, v_msg_ids;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: cliente1 NAO consegue INSERIR em nenhuma das 3 tabelas -- Portal
-- do Cliente e so leitura, sem policy de INSERT para tenant_role=cliente.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000004","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.unit_checks (tenant_id, unit_id, check_code, required_for_status)
    values ('c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000a', 'TENTATIVA_CLIENTE', 'laudo_engenharia');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6a): tenant_role=cliente conseguiu inserir em unit_checks -- Portal do Cliente deveria ser so leitura';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.construction_photos (tenant_id, project_id, file_url)
    values ('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'https://example.com/tentativa.jpg');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6b): tenant_role=cliente conseguiu inserir em construction_photos -- Portal do Cliente deveria ser so leitura';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.client_messages (tenant_id, client_id, direction, message)
    values ('c2000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000a', 'from_client', 'Tentativa cliente');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6c): tenant_role=cliente conseguiu inserir em client_messages -- Portal do Cliente deveria ser so leitura (sem mensageria bidirecional real nesta rodada)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: cliente1 NAO consegue ATUALIZAR a propria linha em nenhuma das 3
-- tabelas -- sem policy de UPDATE para tenant_role=cliente, 0 linhas
-- afetadas, sem erro.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000004","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.unit_checks set status = 'concluido' where id = 'c7000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7a): tenant_role=cliente conseguiu atualizar unit_checks (afetou % linha(s)) -- deveria ser somente leitura', v_linhas;
  end if;

  update public.construction_photos set caption = 'tentativa cliente' where id = 'c8000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7b): tenant_role=cliente conseguiu atualizar construction_photos (afetou % linha(s)) -- deveria ser somente leitura', v_linhas;
  end if;

  update public.client_messages set read_at = now() where id = 'c9000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (7c): tenant_role=cliente conseguiu atualizar client_messages (afetou % linha(s), ex: marcar read_at) -- deveria ser somente leitura nesta rodada', v_linhas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 8: 'admin' do tenant A CONSEGUE inserir e atualizar nas 3 tabelas
-- (prova positiva). WITH CHECK bloqueia INSERT cross-tenant.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000001","tenant_id":"c2000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_check_id uuid; v_photo_id uuid; v_msg_id uuid;
begin
  insert into public.unit_checks (tenant_id, unit_id, check_code, required_for_status)
    values ('c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000a', 'CHECK_CRIADO_POR_ADMIN', 'em_conformidade')
    returning id into v_check_id;

  insert into public.construction_photos (tenant_id, project_id, file_url)
    values ('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000a', 'https://example.com/criado-por-admin.jpg')
    returning id into v_photo_id;

  insert into public.client_messages (tenant_id, client_id, direction, message)
    values ('c2000000-0000-0000-0000-00000000000a', 'c5000000-0000-0000-0000-00000000000a', 'to_client', 'Mensagem criada por admin')
    returning id into v_msg_id;

  if v_check_id is null or v_photo_id is null or v_msg_id is null then
    raise exception 'FALHOU (8a): admin do tenant certo deveria conseguir inserir nas 3 tabelas';
  end if;

  update public.unit_checks set status = 'concluido' where id = v_check_id;
  update public.construction_photos set caption = 'atualizado por admin' where id = v_photo_id;
  update public.client_messages set read_at = now() where id = v_msg_id;

  if not exists (select 1 from public.unit_checks where id = v_check_id and status = 'concluido')
    or not exists (select 1 from public.construction_photos where id = v_photo_id and caption = 'atualizado por admin')
    or not exists (select 1 from public.client_messages where id = v_msg_id and read_at is not null)
  then
    raise exception 'FALHOU (8b): admin deveria conseguir atualizar as linhas que acabou de criar nas 3 tabelas';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando gravar
-- tenant_id de outro tenant) deve ser bloqueada pelo WITH CHECK.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.unit_checks (tenant_id, unit_id, check_code, required_for_status)
    values ('c2000000-0000-0000-0000-00000000000b', 'c4000000-0000-0000-0000-00000000000c', 'TENTATIVA_CROSS_TENANT', 'laudo_engenharia');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (8c): admin do tenant A conseguiu inserir unit_checks com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.construction_photos (tenant_id, project_id, file_url)
    values ('c2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000c', 'https://example.com/tentativa-cross-tenant.jpg');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (8d): admin do tenant A conseguiu inserir construction_photos com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.client_messages (tenant_id, client_id, direction, message)
    values ('c2000000-0000-0000-0000-00000000000b', 'c5000000-0000-0000-0000-00000000000c', 'to_client', 'Tentativa cross-tenant');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (8e): admin do tenant A conseguiu inserir client_messages com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 9: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 3 tabelas, e nao consegue inserir em
-- nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"c1000000-0000-0000-0000-000000000008","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_checks int; v_photos int; v_msgs int;
begin
  select count(*) into v_checks from public.unit_checks;
  select count(*) into v_photos from public.construction_photos;
  select count(*) into v_msgs from public.client_messages;

  if v_checks <> 0 or v_photos <> 0 or v_msgs <> 0 then
    raise exception 'FALHOU (9a): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (checks=%, photos=%, msgs=%)', v_checks, v_photos, v_msgs;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.unit_checks (tenant_id, unit_id, check_code, required_for_status)
    values ('c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000a', 'TENTATIVA_ORFAO', 'laudo_engenharia');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (9b): usuario sem tenant_id no claim conseguiu inserir em unit_checks -- RLS nao esta bloqueando por ausencia de claim';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0051 - Portal do Cliente)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
