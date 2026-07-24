-- 0047_project_cost_fields_isolation.sql
-- Teste do trigger introduzido em
-- supabase/migrations/0047_restrict_project_cost_fields_to_admin.sql: so
-- `admin` pode gravar/alterar `total_construction_cost`/
-- `total_indirect_costs` em `projects` (INSERT com valor != 0, ou UPDATE
-- mudando o valor); `comercial`/`administrativo` continuam liberados por
-- RLS para editar `projects` normalmente (nome, status etc.), so essas
-- duas colunas ficam bloqueadas para eles.
--
-- COMO RODAR
-- ----------
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0047_project_cost_fields_isolation.sql
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum
-- dado sintetico fica no banco. Qualquer assercao que falhe faz
-- `raise exception`, abortando a transacao inteira.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. 'comercial' consegue criar um projeto com os campos de custo em 0
--    (default), e consegue editar outros campos (nome) normalmente.
-- 2. 'comercial' NAO consegue criar um projeto com total_construction_cost
--    != 0 (trigger bloqueia no INSERT).
-- 3. 'comercial' NAO consegue alterar total_construction_cost/
--    total_indirect_costs de um projeto existente (trigger bloqueia no
--    UPDATE), mas CONSEGUE alterar outros campos (nome) na mesma tabela.
-- 4. 'administrativo' -- mesma prova do item 3, para o outro papel interno
--    nao-admin.
-- 5. 'admin' consegue criar projeto com custo != 0 E alterar os campos de
--    custo de um projeto existente.

begin;

-- ---------------------------------------------------------------------
-- Setup: um tenant, um usuario 'comercial', um 'administrativo' e um
-- 'admin'. IDs fixos, prefixo fe pra nao colidir com outros testes.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('fe000000-0000-0000-0000-000000000001'), -- user_comercial
  ('fe000000-0000-0000-0000-000000000002'), -- user_administrativo
  ('fe000000-0000-0000-0000-000000000003'); -- user_admin

insert into public.tenants (id, name, slug) values
  ('fe100000-0000-0000-0000-000000000001', 'Tenant - teste custo obra 0047', 'tenant-teste-custo-obra-0047');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('fe100000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'comercial', 'active'),
  ('fe100000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000002', 'administrativo', 'active'),
  ('fe100000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000003', 'admin', 'active');

-- ---------------------------------------------------------------------
-- TESTE 1 e 2: 'comercial' consegue criar projeto com custo em 0, mas NAO
-- consegue criar com total_construction_cost != 0.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"fe000000-0000-0000-0000-000000000001","tenant_id":"fe100000-0000-0000-0000-000000000001","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  insert into public.projects (id, tenant_id, code, name)
    values ('fe200000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'PROJ-0047', 'Projeto teste 0047');
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (1a): comercial deveria conseguir criar projeto com custos em 0 (default), afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.projects (id, tenant_id, code, name, total_construction_cost)
      values ('fe200000-0000-0000-0000-000000000002', 'fe100000-0000-0000-0000-000000000001', 'PROJ-0047-B', 'Projeto teste 0047 B', 500000);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (2a): comercial conseguiu criar projeto com total_construction_cost != 0 -- trigger nao esta restringindo a admin';
  end if;

  if exists (select 1 from public.projects where id = 'fe200000-0000-0000-0000-000000000002') then
    raise exception 'FALHOU (2b): projeto com custo indevido foi persistido apesar da excecao';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- TESTE 3: 'comercial' NAO consegue alterar os campos de custo do projeto
-- criado no teste 1, mas CONSEGUE alterar outros campos (nome).
-- ---------------------------------------------------------------------

do $$
declare v_linhas int;
begin
  update public.projects set name = 'Projeto teste 0047 (renomeado por comercial)'
    where id = 'fe200000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (3a): comercial deveria conseguir renomear o projeto normalmente, afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.projects set total_construction_cost = 100000
      where id = 'fe200000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (3b): comercial conseguiu alterar total_construction_cost -- trigger nao esta restringindo a admin';
  end if;

  if exists (select 1 from public.projects where id = 'fe200000-0000-0000-0000-000000000001' and total_construction_cost <> 0) then
    raise exception 'FALHOU (3c): total_construction_cost foi alterado apesar da excecao';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: 'administrativo' -- mesma prova do teste 3, para o outro papel
-- interno nao-admin.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"fe000000-0000-0000-0000-000000000002","tenant_id":"fe100000-0000-0000-0000-000000000001","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.projects set name = 'Projeto teste 0047 (renomeado por administrativo)'
    where id = 'fe200000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (4a): administrativo deveria conseguir renomear o projeto normalmente, afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.projects set total_indirect_costs = 50000
      where id = 'fe200000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (4b): administrativo conseguiu alterar total_indirect_costs -- trigger nao esta restringindo a admin';
  end if;

  if exists (select 1 from public.projects where id = 'fe200000-0000-0000-0000-000000000001' and total_indirect_costs <> 0) then
    raise exception 'FALHOU (4c): total_indirect_costs foi alterado apesar da excecao';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'admin' consegue criar projeto com custo != 0 E alterar os
-- campos de custo de um projeto existente.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"fe000000-0000-0000-0000-000000000003","tenant_id":"fe100000-0000-0000-0000-000000000001","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  insert into public.projects (id, tenant_id, code, name, total_construction_cost, total_indirect_costs)
    values ('fe200000-0000-0000-0000-000000000003', 'fe100000-0000-0000-0000-000000000001', 'PROJ-0047-C', 'Projeto teste 0047 C', 800000, 120000);
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (5a): admin deveria conseguir criar projeto com custos != 0, afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.projects set total_construction_cost = 150000, total_indirect_costs = 30000
    where id = 'fe200000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (5b): admin deveria conseguir alterar os campos de custo, afetou % linha(s)', v_linhas;
  end if;

  if not exists (select 1 from public.projects where id = 'fe200000-0000-0000-0000-000000000001' and total_construction_cost = 150000 and total_indirect_costs = 30000) then
    raise exception 'FALHOU (5c): campos de custo nao foram persistidos apos update por admin';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE RESTRICAO DE CUSTO DE OBRA A ADMIN PASSARAM (0047 - Projects)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
