-- 0040_maintenance_soft_delete_isolation.sql
-- Teste de isolamento para a RLS introduzida em
-- supabase/migrations/0040_restrict_maintenance_soft_delete_to_admin.sql:
-- so `admin` pode gravar `is_deleted = true` em `maintenance_requests`;
-- `comercial`/`administrativo` continuam liberados para updates normais
-- (status, agendamento, notas) mas nao para soft-delete.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0039_maintenance_isolation.sql: rodado
-- via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0040_maintenance_soft_delete_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0040_maintenance_soft_delete_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico fica no banco, mesmo rodando contra o projeto remoto real.
-- Qualquer assercao que falhe faz `raise exception`, abortando a transacao
-- inteira.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. 'comercial' consegue update normal (status) numa linha do proprio
--    tenant.
-- 2. 'comercial' NAO consegue soft-delete (is_deleted = true) -- UPDATE
--    afeta 0 linhas (bloqueado pelo WITH CHECK), sem erro visivel ao
--    client, e o valor de is_deleted continua false depois da tentativa.
-- 3. 'administrativo' -- mesma prova do item 2, para o outro papel interno
--    nao-admin.
-- 4. 'admin' consegue tanto update normal quanto soft-delete na mesma
--    linha.
-- 5. Depois do soft-delete feito pelo admin, 'comercial'/'administrativo'
--    NAO conseguem mais fazer update normal numa linha ja excluida (ex:
--    editar nota) -- consequencia esperada da WITH CHECK checar o valor
--    NOVO de is_deleted em toda a linha, nao so a transicao (documentado na
--    migration 0040). Excecao documentada: setar is_deleted DE VOLTA para
--    false (reverter/"undelete") continua permitido pra esses papeis --
--    a regra pedida foi "so admin MARCA is_deleted = true", nao "so admin
--    toca em is_deleted".

begin;

-- ---------------------------------------------------------------------
-- Setup: um tenant, um usuario 'comercial', um 'administrativo' e um
-- 'admin'. IDs fixos, prefixo f8 pra nao colidir com 0039_maintenance_
-- isolation.sql se algum dia rodarem na mesma sessao (nao devem, cada teste
-- roda na sua propria transacao com rollback, mas por seguranca).
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('f8000000-0000-0000-0000-000000000001'), -- user_comercial
  ('f8000000-0000-0000-0000-000000000002'), -- user_administrativo
  ('f8000000-0000-0000-0000-000000000003'); -- user_admin

insert into public.tenants (id, name, slug) values
  ('f9000000-0000-0000-0000-000000000001', 'Tenant - teste soft-delete manutencao 0040', 'tenant-teste-soft-delete-manutencao-0040');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('f9000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'comercial', 'active'),
  ('f9000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000002', 'administrativo', 'active'),
  ('f9000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000003', 'admin', 'active');

insert into public.projects (id, tenant_id, code, name) values
  ('fa000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'PROJ-0040', 'Projeto teste 0040');

insert into public.units (id, tenant_id, project_id, sku, list_price) values
  ('fb000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'UN-0040', 100000);

insert into public.clients (id, tenant_id, name) values
  ('fc000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'Cliente teste 0040');

insert into public.maintenance_requests (id, tenant_id, project_id, unit_id, client_id, title, description) values
  ('fd000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'Chamado teste soft-delete', 'desc');

-- ---------------------------------------------------------------------
-- TESTE 1 e 2: 'comercial' consegue update normal, mas NAO consegue
-- soft-delete.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000001","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.maintenance_requests set status = 'em_andamento', operator_notes = 'comercial atualizou'
    where id = 'fd000000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (1a): comercial deveria conseguir atualizar (status/notas) a propria linha do tenant, afetou % linha(s)', v_linhas;
  end if;

  if not exists (select 1 from public.maintenance_requests where id = 'fd000000-0000-0000-0000-000000000001' and status = 'em_andamento' and operator_notes = 'comercial atualizou') then
    raise exception 'FALHOU (1b): update normal de comercial nao foi persistido como esperado';
  end if;
end $$;

-- Uma linha que passa no USING (visivel/atualizavel pelo tenant/papel) mas
-- cujo valor NOVO falha no WITH CHECK levanta erro 42501 ("new row violates
-- row-level security policy") -- nao afeta 0 linhas silenciosamente (isso
-- so acontece quando a linha nem passa no USING, ex: cross-tenant). Por
-- isso o teste captura a excecao, no mesmo padrao ja usado pros INSERTs
-- bloqueados em 0039_maintenance_isolation.sql.
do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.maintenance_requests set is_deleted = true, deleted_at = now(), deleted_by_user_id = 'f8000000-0000-0000-0000-000000000001'
      where id = 'fd000000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (2a): comercial conseguiu fazer soft-delete (is_deleted = true) -- WITH CHECK nao esta restringindo a admin';
  end if;

  if exists (select 1 from public.maintenance_requests where id = 'fd000000-0000-0000-0000-000000000001' and is_deleted = true) then
    raise exception 'FALHOU (2b): linha ficou marcada como is_deleted = true apos tentativa de soft-delete por comercial';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: 'administrativo' -- mesma prova do teste 2, para o outro papel
-- interno nao-admin.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000002","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.maintenance_requests set status = 'agendado', scheduled_date = current_date + 7
    where id = 'fd000000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (3a): administrativo deveria conseguir atualizar (status/agendamento) a propria linha do tenant, afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.maintenance_requests set is_deleted = true, deleted_at = now(), deleted_by_user_id = 'f8000000-0000-0000-0000-000000000002'
      where id = 'fd000000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (3b): administrativo conseguiu fazer soft-delete (is_deleted = true) -- WITH CHECK nao esta restringindo a admin';
  end if;

  if exists (select 1 from public.maintenance_requests where id = 'fd000000-0000-0000-0000-000000000001' and is_deleted = true) then
    raise exception 'FALHOU (3c): linha ficou marcada como is_deleted = true apos tentativa de soft-delete por administrativo';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: 'admin' consegue tanto update normal quanto soft-delete.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000003","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.maintenance_requests set operator_notes = 'admin atualizou'
    where id = 'fd000000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (4a): admin deveria conseguir fazer update normal, afetou % linha(s)', v_linhas;
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.maintenance_requests set is_deleted = true, deleted_at = now(), deleted_by_user_id = 'f8000000-0000-0000-0000-000000000003'
    where id = 'fd000000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (4b): admin deveria conseguir fazer soft-delete (is_deleted = true), afetou % linha(s)', v_linhas;
  end if;

  if not exists (select 1 from public.maintenance_requests where id = 'fd000000-0000-0000-0000-000000000001' and is_deleted = true) then
    raise exception 'FALHOU (4c): linha nao ficou marcada como is_deleted = true apos soft-delete feito por admin';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: apos o soft-delete (feito pelo admin acima), nem 'comercial' nem
-- 'administrativo' conseguem mais tocar na linha -- nem update normal, nem
-- reverter is_deleted. Consequencia documentada da migration 0040 (WITH
-- CHECK trava pelo valor NOVO de is_deleted, nao so pela transicao):
-- so admin mexe em chamados ja excluidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000001","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

-- Note: is_deleted continua true no NEW row mesmo sem o SET tocar nela
-- (WITH CHECK avalia a linha inteira, nao so as colunas alteradas) -- por
-- isso qualquer UPDATE numa linha ja excluida falha no WITH CHECK pra quem
-- nao e admin, mesma excecao 42501.
do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.maintenance_requests set operator_notes = 'comercial tentando mexer em linha excluida'
      where id = 'fd000000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5a): comercial conseguiu atualizar uma linha ja excluida (is_deleted = true)';
  end if;
end $$;

-- Tentativa de reverter is_deleted (undelete): passa no USING (linha e
-- visivel/atualizavel), mas o NEW row tem is_deleted = false -- essa
-- ESPECIFICAMENTE passaria no WITH CHECK (is_deleted = false satisfaz a
-- condicao). Ou seja, comercial CONSEGUE reverter o soft-delete. Isso e
-- consequencia aceita e documentada da regra escolhida (WITH CHECK trava
-- pelo valor NOVO, nao pela transicao completa) -- "so admin MARCA
-- is_deleted = true" e exatamente o que foi pedido; desfazer nao foi
-- pedido para ser bloqueado. Documentado aqui, nao tratado como falha.
do $$
declare v_linhas int;
begin
  update public.maintenance_requests set is_deleted = false
    where id = 'fd000000-0000-0000-0000-000000000001';
  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception 'FALHOU (5b): comportamento inesperado -- comercial deveria conseguir setar is_deleted de volta para false (regra so restringe true), afetou % linha(s)', v_linhas;
  end if;
end $$;

reset role;

-- Volta pro admin so pra re-marcar is_deleted = true (comercial NAO pode
-- fazer isso -- e exatamente o que a policy restringe -- por isso o
-- re-setup e feito aqui, como admin, nao dentro do bloco acima).
select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000003","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  update public.maintenance_requests set is_deleted = true, deleted_at = now(), deleted_by_user_id = 'f8000000-0000-0000-0000-000000000003'
    where id = 'fd000000-0000-0000-0000-000000000001';

  if not exists (select 1 from public.maintenance_requests where id = 'fd000000-0000-0000-0000-000000000001' and is_deleted = true) then
    raise exception 'FALHOU (setup 5x): admin deveria conseguir re-marcar is_deleted = true para preparar o proximo bloco';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-0000-0000-000000000002","tenant_id":"f9000000-0000-0000-0000-000000000001","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_update_ok boolean := false;
begin
  begin
    update public.maintenance_requests set operator_notes = 'administrativo tentando mexer em linha excluida'
      where id = 'fd000000-0000-0000-0000-000000000001';
    v_update_ok := true;
  exception when others then v_update_ok := false;
  end;
  if v_update_ok then
    raise exception 'FALHOU (5c): administrativo conseguiu atualizar uma linha ja excluida (is_deleted = true)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE SOFT-DELETE RESTRITO A ADMIN PASSARAM (0040 - Manutencao)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
