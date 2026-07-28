-- 0065_notifications_isolation.sql
-- Teste de isolamento para supabase/migrations/0065_rls_notifications.sql
-- (RLS de `notifications`, modo mural + modo pessoal) e para
-- supabase/migrations/0066_espelho_vendas_lead_notifications.sql
-- (create_public_lead/create_public_reservation agora inserindo
-- notification).
--
-- COMO RODAR
-- ----------
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0065_notifications_isolation.sql
--
-- Mesmo padrão de supabase/tests/0063_configuracoes_isolation.sql: roda
-- inteiro dentro de UMA transação com ROLLBACK no final (nenhum dado
-- sintético fica no banco), simula requisição autenticada via
-- `set_config('request.jwt.claims', ..., true)` + `set local role
-- authenticated` (ou `anon`, para as 2 RPCs públicas do espelho de vendas).
--
-- NÃO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, só
-- usado dentro de Edge Functions, nunca exposto ao client; nenhuma Edge
-- Function deste módulo existe hoje, mesma ressalva de 0045/0051/0055/
-- 0056/0063).
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- (a) Equipe interna (admin/comercial) vê mural INTERNAL_ONLY+ADMIN_ONLY+
--     ALL, NÃO vê CLIENT_ONLY.
-- (b) cliente vê mural CLIENT_ONLY+ALL, NÃO vê INTERNAL_ONLY/ADMIN_ONLY.
-- (c) investidor NÃO vê nenhuma linha de mural (decisão documentada em
--     0065: papel não existe no original, critério mais restritivo).
-- (d) Notificação pessoal (user_id preenchido) só é visível pro próprio
--     user_id, nenhum outro papel/usuário do mesmo tenant vê.
-- (e) Marcar como lida (UPDATE de status/read_at/read_by_user_id) funciona
--     pra qualquer um que enxergue a linha no mural, e só pro dono no modo
--     pessoal.
-- (f) Apagar (is_deleted=true) só funciona pra admin no modo mural; no modo
--     pessoal o próprio dono apaga, sem exceção de admin.
-- (g) Isolamento entre tenants nos 2 modos (mural e pessoal), inclusive
--     tentativa de UPDATE cross-tenant (0 linhas afetadas, sem erro).
-- (h) create_public_lead/create_public_reservation (0059) continuam
--     funcionando (regressão) e agora também inserem notification
--     (audience=ADMIN_ONLY, type=CRM) visível pra equipe do tenant certo,
--     invisível pro outro tenant.
-- (i) EXTRA -- vetor de escalação documentado em 0065 (mudar audience/
--     user_id no mesmo UPDATE pra "escapar" do gate de exclusão) é
--     bloqueado pelo trigger notifications_prevent_mode_switch.
-- (j) EXTRA -- policies de INSERT: equipe interna insere mural+pessoal
--     pra outro usuário; cliente só insere pessoal pra si mesmo (nunca
--     mural, nunca pra outro user_id); investidor não insere nada;
--     spoofing de tenant_id é bloqueado.

begin;

-- ---------------------------------------------------------------------
-- Setup: 2 tenants. Tenant A: admin, comercial, cliente, investidor.
-- Tenant B: admin, cliente (só pra prova de isolamento).
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('65000000-0000-0000-0000-0000000a0001', 'admin.a@empresa-0065.com'),
  ('65000000-0000-0000-0000-0000000a0002', 'comercial.a@empresa-0065.com'),
  ('65000000-0000-0000-0000-0000000a0003', 'cliente.a@empresa-0065.com'),
  ('65000000-0000-0000-0000-0000000a0004', 'investidor.a@empresa-0065.com'),
  ('65000000-0000-0000-0000-0000000b0001', 'admin.b@empresa-0065.com'),
  ('65000000-0000-0000-0000-0000000b0002', 'cliente.b@empresa-0065.com');

insert into public.tenants (id, name, slug) values
  ('65000000-0000-0000-0000-00000000000a', 'Tenant A - teste 0065', 'tenant-a-teste-0065'),
  ('65000000-0000-0000-0000-00000000000b', 'Tenant B - teste 0065', 'tenant-b-teste-0065');

insert into public.tenant_users (tenant_id, user_id, role, status, joined_at) values
  ('65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000000a0001', 'admin', 'active', now()),
  ('65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000000a0002', 'comercial', 'active', now()),
  ('65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000000a0003', 'cliente', 'active', now()),
  ('65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000000a0004', 'investidor', 'active', now()),
  ('65000000-0000-0000-0000-00000000000b', '65000000-0000-0000-0000-0000000b0001', 'admin', 'active', now()),
  ('65000000-0000-0000-0000-00000000000b', '65000000-0000-0000-0000-0000000b0002', 'cliente', 'active', now());

-- ---------------------------------------------------------------------
-- Dados de mural + pessoal para o tenant A, inseridos pelo admin_a
-- (também exercita a policy de INSERT da equipe interna).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.notifications (id, tenant_id, title, message, type, severity, audience) values
  ('65000000-0000-0000-0000-0000001a0001', '65000000-0000-0000-0000-00000000000a', 'Mural INTERNAL_ONLY', 'msg', 'SISTEMA', 'INFO', 'INTERNAL_ONLY'),
  ('65000000-0000-0000-0000-0000001a0002', '65000000-0000-0000-0000-00000000000a', 'Mural ADMIN_ONLY', 'msg', 'SISTEMA', 'INFO', 'ADMIN_ONLY'),
  ('65000000-0000-0000-0000-0000001a0003', '65000000-0000-0000-0000-00000000000a', 'Mural CLIENT_ONLY', 'msg', 'SISTEMA', 'INFO', 'CLIENT_ONLY'),
  ('65000000-0000-0000-0000-0000001a0004', '65000000-0000-0000-0000-00000000000a', 'Mural ALL', 'msg', 'SISTEMA', 'INFO', 'ALL');

-- Notificação pessoal PRA OUTRO usuário (cliente_a) -- mesmo padrão de
-- MaintenanceDetail.jsx, admin cria pro cliente.
insert into public.notifications (id, tenant_id, title, message, type, user_id) values
  ('65000000-0000-0000-0000-0000001a0005', '65000000-0000-0000-0000-00000000000a', 'Solicitação Atualizada', 'msg', 'MAINTENANCE_STATUS_CHANGED', '65000000-0000-0000-0000-0000000a0003');

reset role;

-- Notificação pessoal PRA SI MESMO, inserida pelo próprio cliente_a --
-- mesmo padrão de ClientMaintenance.jsx (achado de auditoria, ver 0065).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0003","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.notifications (id, tenant_id, title, message, type, user_id) values
  ('65000000-0000-0000-0000-0000001a0006', '65000000-0000-0000-0000-00000000000a', 'Solicitação Criada', 'msg', 'MAINTENANCE_CREATED', '65000000-0000-0000-0000-0000000a0003');

reset role;

-- Dados equivalentes no tenant B, pra provar isolamento.
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000b0001","tenant_id":"65000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.notifications (id, tenant_id, title, message, type, severity, audience) values
  ('65000000-0000-0000-0000-0000001b0001', '65000000-0000-0000-0000-00000000000b', 'Mural B INTERNAL_ONLY', 'msg', 'SISTEMA', 'INFO', 'INTERNAL_ONLY');

insert into public.notifications (id, tenant_id, title, message, type, user_id) values
  ('65000000-0000-0000-0000-0000001b0002', '65000000-0000-0000-0000-00000000000b', 'Pessoal B', 'msg', 'MAINTENANCE_CREATED', '65000000-0000-0000-0000-0000000b0002');

reset role;

-- =======================================================================
-- TESTE (a): equipe interna (admin/comercial) vê mural INTERNAL_ONLY+
-- ADMIN_ONLY+ALL (3 linhas do tenant A), NÃO vê CLIENT_ONLY nem as
-- pessoais (que não são delas).
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0002","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
  v_ve_client_only int;
begin
  select count(*) into v_count from public.notifications where tenant_id = '65000000-0000-0000-0000-00000000000a';
  if v_count <> 3 then
    raise exception 'FALHOU (a1): comercial_a deveria ver exatamente 3 notificações de mural (INTERNAL_ONLY+ADMIN_ONLY+ALL), viu %', v_count;
  end if;

  select count(*) into v_ve_client_only from public.notifications where id = '65000000-0000-0000-0000-0000001a0003';
  if v_ve_client_only <> 0 then
    raise exception 'FALHOU (a2): comercial_a NAO deveria ver a notificacao CLIENT_ONLY, viu %', v_ve_client_only;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (b): cliente vê CLIENT_ONLY+ALL (2 linhas de mural) + as 2
-- pessoais dele (destinatário direto e auto-criada) = 4 linhas. NÃO vê
-- INTERNAL_ONLY/ADMIN_ONLY.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0003","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_count int;
  v_ve_internal int;
  v_ve_admin_only int;
begin
  select count(*) into v_count from public.notifications where tenant_id = '65000000-0000-0000-0000-00000000000a';
  if v_count <> 4 then
    raise exception 'FALHOU (b1): cliente_a deveria ver exatamente 4 notificacoes (2 mural CLIENT_ONLY/ALL + 2 pessoais proprias), viu %', v_count;
  end if;

  select count(*) into v_ve_internal from public.notifications where id = '65000000-0000-0000-0000-0000001a0001';
  select count(*) into v_ve_admin_only from public.notifications where id = '65000000-0000-0000-0000-0000001a0002';
  if v_ve_internal <> 0 or v_ve_admin_only <> 0 then
    raise exception 'FALHOU (b2): cliente_a NAO deveria ver INTERNAL_ONLY/ADMIN_ONLY, viu %/%', v_ve_internal, v_ve_admin_only;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (c): investidor NAO ve NENHUMA linha de mural (nem as proprias
-- pessoais, ja que nao tem nenhuma) -- criterio mais restritivo, papel sem
-- equivalente no original.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0004","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notifications where tenant_id = '65000000-0000-0000-0000-00000000000a';
  if v_count <> 0 then
    raise exception 'FALHOU (c1): investidor_a deveria ver ZERO notificacoes (sem policy de mural, sem pessoal propria), viu %', v_count;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (d): notificacao pessoal so visivel pro user_id dono -- admin_a
-- (quem criou a notificacao PRA cliente_a) nao ve ela na propria consulta
-- (nao e mural, audience e null).
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_ve_pessoal int;
begin
  select count(*) into v_ve_pessoal from public.notifications where id in ('65000000-0000-0000-0000-0000001a0005', '65000000-0000-0000-0000-0000001a0006');
  if v_ve_pessoal <> 0 then
    raise exception 'FALHOU (d1): admin_a (quem criou, nao o destinatario) NAO deveria ver as notificacoes pessoais de cliente_a, viu %', v_ve_pessoal;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (e) + (f): mark-as-read e soft-delete.
-- =======================================================================

-- (e1) comercial_a marca ADMIN_ONLY como lida -- linha COMPARTILHADA,
-- qualquer um da equipe interna que enxerga pode marcar.
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0002","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.notifications
    set status = 'LIDA', read_at = now(), read_by_user_id = '65000000-0000-0000-0000-0000000a0002'
    where id = '65000000-0000-0000-0000-0000001a0002';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU (e1): comercial_a deveria conseguir marcar ADMIN_ONLY como lida (1 linha), afetou %', v_linhas;
  end if;
end $$;

-- (f1) comercial_a tenta APAGAR (is_deleted=true) a mesma linha -- so
-- admin pode, deve falhar com violacao de RLS (WITH CHECK).
do $$
declare v_erro_ok boolean := false;
begin
  begin
    update public.notifications set is_deleted = true, deleted_at = now()
      where id = '65000000-0000-0000-0000-0000001a0002';
    v_erro_ok := false;
  exception when others then
    v_erro_ok := true;
  end;
  if not v_erro_ok then
    raise exception 'FALHOU (f1): comercial_a (nao-admin) conseguiu apagar notificacao de mural -- gate "so admin apaga" nao esta funcionando';
  end if;
end $$;

reset role;

-- Confirma que a linha continua NAO deletada (a tentativa nao teve efeito
-- colateral nenhum -- toda a instrucao aborta quando WITH CHECK falha).
do $$
declare v_is_deleted boolean;
begin
  select is_deleted into v_is_deleted from public.notifications where id = '65000000-0000-0000-0000-0000001a0002';
  if v_is_deleted <> false then
    raise exception 'FALHOU (f2): notificacao ADMIN_ONLY nao deveria estar apagada apos tentativa de comercial_a, is_deleted=%', v_is_deleted;
  end if;
end $$;

-- (f3) admin_a (dono de verdade do papel) apaga a mesma linha -- deve
-- funcionar.
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.notifications set is_deleted = true, deleted_at = now(), deleted_by_user_id = '65000000-0000-0000-0000-0000000a0001'
    where id = '65000000-0000-0000-0000-0000001a0002';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU (f3): admin_a deveria conseguir apagar a notificacao ADMIN_ONLY (1 linha), afetou %', v_linhas;
  end if;
end $$;

reset role;

-- (e2)+(f4) modo pessoal: cliente_a marca a propria notificacao como lida
-- E apaga -- sem excecao de admin aqui (caixa pessoal).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0003","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.notifications set status = 'LIDA', read_at = now(), read_by_user_id = '65000000-0000-0000-0000-0000000a0003'
    where id = '65000000-0000-0000-0000-0000001a0005';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU (e2): cliente_a (dono) deveria conseguir marcar a propria notificacao pessoal como lida, afetou %', v_linhas;
  end if;

  update public.notifications set is_deleted = true, deleted_at = now(), deleted_by_user_id = '65000000-0000-0000-0000-0000000a0003'
    where id = '65000000-0000-0000-0000-0000001a0005';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'FALHOU (f4): cliente_a (dono, nao-admin) deveria conseguir apagar a propria notificacao pessoal, afetou %', v_linhas;
  end if;
end $$;

reset role;

-- (e3): admin_a (NAO o dono) tenta marcar/apagar a notificacao pessoal
-- restante de cliente_a (a0006) -- 0 linhas afetadas, sem erro (USING nao
-- seleciona a linha, nem e mural nem e dono).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_linhas int;
begin
  update public.notifications set status = 'LIDA' where id = '65000000-0000-0000-0000-0000001a0006';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (e3): admin_a (nao dono) NAO deveria conseguir tocar a notificacao pessoal de cliente_a, afetou %', v_linhas;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (g): isolamento entre tenants -- admin_b nao ve/atualiza nada do
-- tenant A, nos 2 modos.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000b0001","tenant_id":"65000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_ve_mural_a int;
  v_ve_pessoal_a int;
  v_linhas int;
begin
  select count(*) into v_ve_mural_a from public.notifications where id = '65000000-0000-0000-0000-0000001a0001';
  select count(*) into v_ve_pessoal_a from public.notifications where id = '65000000-0000-0000-0000-0000001a0006';
  if v_ve_mural_a <> 0 or v_ve_pessoal_a <> 0 then
    raise exception 'FALHOU (g1): admin_b NAO deveria ver NENHUMA notificacao do tenant A, viu mural=%/pessoal=%', v_ve_mural_a, v_ve_pessoal_a;
  end if;

  -- Tenta marcar como lida uma notificacao de mural do tenant A -- 0
  -- linhas, sem erro (RLS filtra por tenant_id antes de mais nada).
  update public.notifications set status = 'LIDA' where id = '65000000-0000-0000-0000-0000001a0001';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (g2): admin_b conseguiu atualizar notificacao de mural do tenant A -- isolamento por tenant quebrado, afetou %', v_linhas;
  end if;

  -- So ve as proprias 2 linhas do tenant B.
  perform 1 from public.notifications where tenant_id = '65000000-0000-0000-0000-00000000000b';
end $$;

do $$
declare v_count int;
begin
  -- Do proprio tenant B (2 linhas no total: 1 mural INTERNAL_ONLY + 1
  -- pessoal de cliente_b), admin_b so ve a de MURAL -- a pessoal pertence
  -- a outro usuario (cliente_b), nao a ele. Prova isolamento por
  -- USUARIO dentro do mesmo tenant, alem do isolamento entre tenants.
  select count(*) into v_count from public.notifications where tenant_id = '65000000-0000-0000-0000-00000000000b';
  if v_count <> 1 then
    raise exception 'FALHOU (g3): admin_b deveria ver exatamente 1 notificacao do proprio tenant B (a de mural INTERNAL_ONLY -- a pessoal e de cliente_b, nao dele), viu %', v_count;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (i) EXTRA: vetor de escalacao -- comercial_a tenta mudar
-- audience/user_id no mesmo UPDATE pra escapar do gate "so admin apaga".
-- Trigger notifications_prevent_mode_switch deve bloquear.
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0002","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_erro_ok boolean := false;
begin
  begin
    -- Tenta "converter" a notificacao INTERNAL_ONLY (mural) em pessoal
    -- propria (user_id=self) na MESMA instrucao que apaga -- se isto
    -- funcionasse, seria um jeito de contornar "so admin apaga mural".
    update public.notifications
      set is_deleted = true, user_id = '65000000-0000-0000-0000-0000000a0002'
      where id = '65000000-0000-0000-0000-0000001a0001';
    v_erro_ok := false;
  exception when others then
    v_erro_ok := (sqlerrm like '%user_id não pode ser alterado%' or sqlerrm like '%row-level security%');
    if not v_erro_ok then
      raise exception 'FALHOU (i1): erro inesperado tentando o vetor de escalacao: %', sqlerrm;
    end if;
  end;
  if not v_erro_ok then
    raise exception 'FALHOU (i1): comercial_a conseguiu escalar privilegio mudando user_id/is_deleted no mesmo UPDATE -- vetor de escalacao NAO esta bloqueado';
  end if;
end $$;

reset role;

do $$
declare v_is_deleted boolean; v_user_id uuid;
begin
  select is_deleted, user_id into v_is_deleted, v_user_id from public.notifications where id = '65000000-0000-0000-0000-0000001a0001';
  if v_is_deleted <> false or v_user_id is not null then
    raise exception 'FALHOU (i2): notificacao INTERNAL_ONLY nao deveria ter sido alterada pela tentativa de escalacao (is_deleted=%, user_id=%)', v_is_deleted, v_user_id;
  end if;
end $$;

-- =======================================================================
-- TESTE (j) EXTRA: policies de INSERT.
-- =======================================================================

-- (j1) cliente_a tenta inserir notificacao de MURAL (audience preenchido)
-- -- deve falhar (policy de cliente so aceita audience is null).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0003","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.notifications (tenant_id, title, message, type, audience)
      values ('65000000-0000-0000-0000-00000000000a', 'Tentativa', 'msg', 'CRM', 'CLIENT_ONLY');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (j1): cliente_a conseguiu inserir notificacao de MURAL -- policy de insert nao esta restrita a modo pessoal';
  end if;
end $$;

-- (j2) cliente_a tenta inserir notificacao pessoal PRA OUTRO usuario --
-- deve falhar (policy exige user_id = auth.uid()).
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.notifications (tenant_id, title, message, type, user_id)
      values ('65000000-0000-0000-0000-00000000000a', 'Tentativa', 'msg', 'X', '65000000-0000-0000-0000-0000000a0001');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (j2): cliente_a conseguiu inserir notificacao pessoal PRA OUTRO usuario -- policy nao esta exigindo user_id = auth.uid()';
  end if;
end $$;

reset role;

-- (j3) investidor_a nao consegue inserir NADA.
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0004","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.notifications (tenant_id, title, message, type, user_id)
      values ('65000000-0000-0000-0000-00000000000a', 'Tentativa', 'msg', 'X', '65000000-0000-0000-0000-0000000a0004');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (j3): investidor_a conseguiu inserir notificacao -- nenhuma policy de insert deveria cobrir esse papel';
  end if;
end $$;

reset role;

-- (j4) comercial_a (equipe interna) insere pessoal PRA OUTRO usuario
-- (cliente_a) -- deve funcionar (mesmo padrao de MaintenanceDetail.jsx).
--
-- ACHADO OPERACIONAL (reportado ao frontend-builder, não é falha de RLS):
-- Postgres aplica as policies de SELECT também sobre o `RETURNING` de um
-- INSERT (para devolver a linha, ele precisa poder "lê-la" de volta) -- um
-- INSERT com `RETURNING`/`.select()` FALHA se quem insere não tiver
-- nenhuma policy de SELECT que enxergue a linha recém-criada. Aqui,
-- comercial_a cria uma notificação PRA cliente_a (não é mural, não é
-- pessoal dele) -- ele consegue INSERIR (WITH CHECK passa), mas NÃO
-- conseguiria um `RETURNING id`/`.select()` no mesmo INSERT (SELECT não
-- alcança essa linha pra ele). Confirmado testando os dois casos
-- manualmente contra o banco remoto antes deste teste. Por isso o INSERT
-- abaixo usa `id` explícito (sem RETURNING) -- mesmo padrão que o
-- frontend-builder DEVE seguir ao portar MaintenanceDetail.jsx: chamar
-- `supabase.from('notifications').insert(payload)` SEM encadear
-- `.select()` -- mesmo comportamento do original (`Notification.create()`
-- nunca usa o valor de retorno em nenhum dos 6 pontos do original,
-- confirmado por grep).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0002","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table t_j4 (id uuid) on commit drop;

do $$
begin
  insert into public.notifications (id, tenant_id, title, message, type, user_id)
    values ('65000000-0000-0000-0000-0000004a0001', '65000000-0000-0000-0000-00000000000a', 'Agendamento Definido', 'msg', 'MAINTENANCE_SCHEDULED', '65000000-0000-0000-0000-0000000a0003');
  insert into t_j4 (id) values ('65000000-0000-0000-0000-0000004a0001');
end $$;

-- (j5) comercial_a tenta INSERIR com tenant_id spoofado pro tenant B --
-- WITH CHECK deve bloquear.
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.notifications (tenant_id, title, message, type, audience)
      values ('65000000-0000-0000-0000-00000000000b', 'Tentativa spoof', 'msg', 'CRM', 'INTERNAL_ONLY');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  if v_ok then
    raise exception 'FALHOU (j5): comercial_a conseguiu inserir notificacao com tenant_id de outro tenant -- WITH CHECK nao esta validando tenant_id = claim';
  end if;
end $$;

reset role;

-- cliente_a agora ve a notificacao que comercial_a criou pra ela (j4).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0003","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notifications n join t_j4 r on n.id = r.id;
  if v_count <> 1 then
    raise exception 'FALHOU (j6): cliente_a deveria ver a notificacao pessoal criada por comercial_a pra ela, viu %', v_count;
  end if;
end $$;

reset role;

-- =======================================================================
-- TESTE (h): regressao de create_public_lead/create_public_reservation
-- (0059) + notificacao ADMIN_ONLY inserida (0066).
-- =======================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.projects (id, tenant_id, code, name, slug, is_public, reserva_horas)
values (
  '65000000-0000-0000-0000-0000002a0001', '65000000-0000-0000-0000-00000000000a',
  'PRJ-A-0065', 'Residencial Teste 0065', 'residencial-teste-0065', true, 24
);

insert into public.units (id, tenant_id, project_id, sku, tipologia, list_price, status) values
  ('65000000-0000-0000-0000-0000003a0001', '65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000002a0001', 'UN-A-01-0065', '2Q', 180000, 'disponivel'),
  ('65000000-0000-0000-0000-0000003a0002', '65000000-0000-0000-0000-00000000000a', '65000000-0000-0000-0000-0000002a0001', 'UN-A-02-0065', '3Q', 210000, 'disponivel');

reset role;

set local role anon;

-- (h1) intent=interesse -- regressao + notificacao.
create temporary table t_h_interesse (id uuid) on commit drop;
do $$
declare v_result jsonb;
begin
  v_result := public.create_public_lead(
    '65000000-0000-0000-0000-0000002a0001', 'interesse', 'Fulano Interesse', '(85) 99999-1001',
    '65000000-0000-0000-0000-0000003a0001'
  );
  if v_result ->> 'intent' <> 'interesse' then
    raise exception 'FALHOU (h1): create_public_lead(interesse) nao retornou intent esperado: %', v_result;
  end if;
  insert into t_h_interesse (id) values ((v_result ->> 'id')::uuid);
end $$;

-- (h2) intent=lista_espera -- regressao + notificacao.
create temporary table t_h_espera (id uuid) on commit drop;
do $$
declare v_result jsonb;
begin
  v_result := public.create_public_lead(
    '65000000-0000-0000-0000-0000002a0001', 'lista_espera', 'Fulano Espera', '(85) 99999-1002',
    '65000000-0000-0000-0000-0000003a0001'
  );
  insert into t_h_espera (id) values ((v_result ->> 'id')::uuid);
end $$;

-- (h3) reserva -- regressao completa (client/deal/unit/status_transition/
-- lead) + notificacao.
create temporary table t_h_reserva (id uuid) on commit drop;
do $$
declare v_result jsonb;
begin
  v_result := public.create_public_reservation(
    '65000000-0000-0000-0000-0000002a0001', '65000000-0000-0000-0000-0000003a0002',
    'Fulano Reserva', '(85) 99999-1003', '123.456.789-09'
  );
  if v_result ->> 'deal_id' is null or v_result ->> 'client_id' is null then
    raise exception 'FALHOU (h3): create_public_reservation nao retornou deal_id/client_id: %', v_result;
  end if;
  insert into t_h_reserva (id) values ((v_result ->> 'lead_id')::uuid);
end $$;

reset role;

-- Verificacao (dono, bypassando RLS): 3 notificacoes ADMIN_ONLY criadas,
-- tenant_id certo, severity/type/event_key batendo com LeadForm.jsx.
do $$
declare
  v_count int;
  v_severity_interesse public.notification_severity;
  v_severity_espera public.notification_severity;
  v_severity_reserva public.notification_severity;
  v_event_key_interesse text;
begin
  select count(*) into v_count from public.notifications
    where tenant_id = '65000000-0000-0000-0000-00000000000a'
      and entity_type = 'PublicLead'
      and audience = 'ADMIN_ONLY'
      and type = 'CRM';
  if v_count <> 3 then
    raise exception 'FALHOU (h4): deveriam existir exatamente 3 notificacoes ADMIN_ONLY/CRM/PublicLead (interesse+lista_espera+reserva), veio %', v_count;
  end if;

  select severity, event_key into v_severity_interesse, v_event_key_interesse
    from public.notifications n join t_h_interesse r on n.entity_id = r.id
    where n.audience = 'ADMIN_ONLY';
  if v_severity_interesse <> 'INFO' or v_event_key_interesse <> 'public_lead_interest_' || (select id from t_h_interesse) then
    raise exception 'FALHOU (h5): notificacao de interesse com severity/event_key incorretos (severity=%, event_key=%)', v_severity_interesse, v_event_key_interesse;
  end if;

  select severity into v_severity_espera
    from public.notifications n join t_h_espera r on n.entity_id = r.id;
  if v_severity_espera <> 'INFO' then
    raise exception 'FALHOU (h6): notificacao de lista_espera deveria ter severity INFO, veio %', v_severity_espera;
  end if;

  select severity into v_severity_reserva
    from public.notifications n join t_h_reserva r on n.entity_id = r.id;
  if v_severity_reserva <> 'ALERTA' then
    raise exception 'FALHOU (h7): notificacao de reserva deveria ter severity ALERTA, veio %', v_severity_reserva;
  end if;
end $$;

-- (h8) admin_a (equipe interna do tenant CERTO) ve as 3 notificacoes novas
-- via SELECT normal (RLS).
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000a0001","tenant_id":"65000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notifications
    where tenant_id = '65000000-0000-0000-0000-00000000000a' and entity_type = 'PublicLead';
  if v_count <> 3 then
    raise exception 'FALHOU (h8): admin_a deveria ver as 3 notificacoes de PublicLead via RLS normal, viu %', v_count;
  end if;
end $$;

reset role;

-- (h9) admin_b (OUTRO tenant) NAO ve nenhuma delas.
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-0000-0000-0000000b0001","tenant_id":"65000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notifications
    where tenant_id = '65000000-0000-0000-0000-00000000000a' and entity_type = 'PublicLead';
  if v_count <> 0 then
    raise exception 'FALHOU (h9): admin_b (outro tenant) NAO deveria ver nenhuma notificacao de PublicLead do tenant A, viu %', v_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE NOTIFICACOES (0065/0066) PASSARAM' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
