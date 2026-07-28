-- 0065_rls_notifications.sql
-- RLS de `notifications` (0064) — mural interno (por audience x papel) +
-- notificação pessoal (por user_id). Ver comentário de topo de 0064 para o
-- desenho dos 2 modos; aqui só a autorização.
--
-- REGRA DE VISIBILIDADE DO MURAL (audience preenchido), confirmada por
-- leitura direta de `original-project/src/pages/Notifications.jsx`:
--   - Equipe interna (admin/comercial/administrativo, `hasAccess` no
--     original) vê INTERNAL_ONLY + ALL + ADMIN_ONLY.
--   - `cliente` vê CLIENT_ONLY + ALL.
--   - `investidor`: SEM policy nesta migration, de propósito — o original
--     não tem esse papel (é exclusivo desta plataforma), então não existe
--     comportamento a portar. Critério mais restritivo escolhido (sem
--     acesso ao mural), documentado aqui e reportado ao orquestrador —
--     produto pode decidir depois incluir investidor em ADMIN_ONLY/ALL,
--     mas isso é uma decisão de escopo, não algo assumido por conta
--     própria.
--
-- UPDATE do mural É UMA SÓ POLICY (não duas), de propósito: marcar como
-- lida (status/read_at/read_by_user_id) é liberado para quem enxerga a
-- linha (mesmo critério do SELECT), mas apagar (is_deleted=true) só para
-- `admin` — confirmado em Notifications.jsx (`isAdmin = appProfile ===
-- "ADMINISTRADOR"`, único papel com o botão de lixeira). O gate de
-- is_deleted fica DENTRO do WITH CHECK desta única policy (não numa
-- segunda policy separada) porque múltiplas policies permissivas de UPDATE
-- na mesma tabela têm seus WITH CHECK combinados por OR entre si — se a
-- restrição "só admin apaga" estivesse isolada numa policy separada, um
-- WITH CHECK mais permissivo de outra policy poderia validar a mesma
-- escrita e a restrição vazaria. Uma única policy com a condição embutida
-- evita esse problema por construção.
--
-- TRIGGER notifications_prevent_mode_switch: motivo de existir explicado
-- no comentário da função abaixo — fecha um vetor de escalação que a
-- combinação de policies de UPDATE (mural + pessoal) abriria sozinha.

alter table public.notifications enable row level security;

-- =======================================================================
-- 1. SELECT
-- =======================================================================

create policy "notifications_select_mural_internal_team"
  on public.notifications
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and audience is not null
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
    and audience in ('INTERNAL_ONLY', 'ALL', 'ADMIN_ONLY')
  );

create policy "notifications_select_mural_cliente"
  on public.notifications
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and audience is not null
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and audience in ('CLIENT_ONLY', 'ALL')
  );

create policy "notifications_select_personal_own"
  on public.notifications
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and user_id = auth.uid()
  );

comment on policy "notifications_select_mural_internal_team" on public.notifications is
  'Mural interno: admin/comercial/administrativo veem INTERNAL_ONLY+ALL+'
  'ADMIN_ONLY (confirmado em Notifications.jsx, hasAccess). is_deleted NÃO '
  'é filtrado aqui de propósito -- mesmo padrão de documents (0032) e '
  'maintenance_requests (0039): soft-delete é responsabilidade do app '
  'filtrar na query, RLS não decide por status de exclusão.';

comment on policy "notifications_select_mural_cliente" on public.notifications is
  'Mural interno para o papel cliente: só CLIENT_ONLY+ALL (confirmado em '
  'Notifications.jsx, ramo else do appProfile). investidor não tem policy '
  'equivalente aqui -- decisão documentada no topo desta migration.';

comment on policy "notifications_select_personal_own" on public.notifications is
  'Notificação pessoal (user_id preenchido): só o próprio destinatário vê, '
  'qualquer papel -- MaintenanceDetail.jsx/ClientMaintenance.jsx nunca são '
  'lidas por ninguém além do dono.';

-- =======================================================================
-- 2. INSERT
-- =======================================================================
--
-- Quem cria notificação no original é sempre a própria aplicação (mutations
-- de CRM/Financeiro/Comissões/Manutenção/Unidade), nunca uma tela dedicada
-- de "criar notificação" -- confirmado por grep dos 6 pontos de
-- `Notification.create()` (ver 0064). 2 formas de escrita confirmadas:
--
--   a) Equipe interna (admin/comercial/administrativo) cria tanto mural
--      (audience preenchido, qualquer valor) quanto pessoal PRA OUTRO
--      usuário (MaintenanceDetail.jsx: user_id = client.user_id, o alvo
--      nunca é quem chama) -- por isso NÃO exigimos user_id = auth.uid()
--      nem audience específico aqui, só tenant_id do claim. created_by_
--      user_id também não é validado (o original nunca preenche esse
--      campo em nenhum dos 6 pontos, confirmado por grep).
--
--   b) `cliente` cria uma notificação PESSOAL PRA SI MESMO -- achado de
--      auditoria confirmado em ClientMaintenance.jsx (linha "Criar
--      notificação para o cliente": `user_id: currentUser.id`, o próprio
--      usuário logado, ao abrir a própria solicitação de manutenção). Isto
--      NÃO estava no escopo original desta tarefa (que só menciona INSERT
--      para admin/comercial/administrativo), mas é comportamento real do
--      original, então uma policy restrita (só o próprio user_id, só modo
--      pessoal, nunca audience) foi adicionada para não deixar essa
--      capacidade faltando quando o módulo de Manutenção do cliente for
--      portado -- reportado como achado ao orquestrador. `investidor` não
--      tem policy de insert: nenhum ponto do original cria notificação
--      nesse papel.

create policy "notifications_insert_tenant_team"
  on public.notifications
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "notifications_insert_cliente_self"
  on public.notifications
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and user_id = auth.uid()
    and audience is null
  );

comment on policy "notifications_insert_tenant_team" on public.notifications is
  'Equipe interna cria mural (qualquer audience) e notificação pessoal PRA '
  'OUTRO usuário (MaintenanceDetail.jsx) -- sem exigir user_id = auth.uid() '
  '(o alvo nunca é quem chama) nem created_by_user_id (nunca validado no '
  'original).';

comment on policy "notifications_insert_cliente_self" on public.notifications is
  'ACHADO DE AUDITORIA, fora do pedido original desta tarefa: cliente cria '
  'notificação pessoal PRA SI MESMO em ClientMaintenance.jsx '
  '(user_id: currentUser.id). Policy restrita ao próprio user_id e a modo '
  'pessoal puro (audience is null) -- least privilege.';

-- =======================================================================
-- 3. UPDATE
-- =======================================================================

create policy "notifications_update_mural_shared"
  on public.notifications
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and audience is not null
    and (
      (
        (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
        and audience in ('INTERNAL_ONLY', 'ALL', 'ADMIN_ONLY')
      )
      or
      (
        (auth.jwt() ->> 'tenant_role') = 'cliente'
        and audience in ('CLIENT_ONLY', 'ALL')
      )
    )
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and audience is not null
    and (
      (
        (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
        and audience in ('INTERNAL_ONLY', 'ALL', 'ADMIN_ONLY')
      )
      or
      (
        (auth.jwt() ->> 'tenant_role') = 'cliente'
        and audience in ('CLIENT_ONLY', 'ALL')
      )
    )
    and (
      is_deleted = false
      or (auth.jwt() ->> 'tenant_role') = 'admin'
    )
  );

create policy "notifications_update_personal_own"
  on public.notifications
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and user_id = auth.uid()
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and user_id = auth.uid()
  );

comment on policy "notifications_update_mural_shared" on public.notifications is
  'Marcar como lida (status/read_at/read_by_user_id) liberado para quem '
  'enxerga a linha (mesmo critério do SELECT de mural) -- linha '
  'COMPARTILHADA por tenant, não por usuário (confirmado em '
  'Notifications.jsx: markAsReadMutation chamável por qualquer um com '
  'hasAccess). Apagar (is_deleted=true) só para admin (mesmo gate do botão '
  'de lixeira, isAdmin) -- condição embutida no WITH CHECK desta ÚNICA '
  'policy, não separada em outra (ver nota no topo da migration sobre OR '
  'entre WITH CHECK de múltiplas policies).';

comment on policy "notifications_update_personal_own" on public.notifications is
  'Notificação pessoal: só o próprio destinatário marca como lida ou '
  'apaga (is_deleted) -- sem exceção para admin aqui, é a caixa pessoal de '
  'alguém (confirmado: MaintenanceDetail.jsx/ClientMaintenance.jsx não têm '
  'nenhuma tela de gestão de notificação pessoal por terceiros).';

-- Sem policy de DELETE: 0064 não concedeu `grant delete` a `authenticated'
-- (exclusão é sempre soft-delete via UPDATE, is_deleted) -- nada a revogar,
-- privilégio nunca existiu.

-- =======================================================================
-- 4. Trigger: impede que audience/user_id/tenant_id mudem de valor num
--    UPDATE (imutabilidade do "modo" da linha e do tenant dono).
-- =======================================================================
--
-- POR QUE ISTO É NECESSÁRIO (não é defesa em profundidade gratuita): sem
-- este trigger, existe um vetor de escalação real usando as 2 policies de
-- UPDATE acima juntas. No Postgres, quando várias policies permissivas de
-- UPDATE se aplicam à mesma tabela, o WITH CHECK de TODAS elas é combinado
-- por OR sobre a linha NOVA -- não fica amarrado à policy cujo USING
-- aceitou a linha ANTIGA. Then: um `comercial` (equipe interna, NUNCA
-- deveria apagar mural) poderia rodar
--   UPDATE notifications SET is_deleted = true, user_id = auth.uid()
--   WHERE id = <linha de mural INTERNAL_ONLY>;
-- A linha ANTIGA passa no USING de "notifications_update_mural_shared"
-- (comercial enxerga INTERNAL_ONLY). A linha NOVA falha no WITH CHECK
-- dessa mesma policy (is_deleted=true e não é admin) -- mas passaria no
-- WITH CHECK de "notifications_update_personal_own", porque o UPDATE
-- também setou user_id = auth.uid() na mesma instrução, "convertendo" a
-- notificação de mural em pessoal-própria dentro do mesmo statement. Como
-- os WITH CHECK são combinados por OR entre as 2 policies, o UPDATE
-- passaria mesmo sem ser admin -- bypass do gate "só admin apaga mural".
--
-- O trigger fecha isso rejeitando qualquer UPDATE que tente mudar
-- audience/user_id/tenant_id, independente de qual policy autorizou a
-- operação -- essas 3 colunas nunca mudam nos 6 pontos de update do
-- original (só status/read_at/read_by_user_id/is_deleted/deleted_at/
-- deleted_by_user_id mudam).

create or replace function public.notifications_prevent_mode_switch()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'notifications.tenant_id não pode ser alterado em um UPDATE.'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  if new.audience is distinct from old.audience then
    raise exception 'notifications.audience não pode ser alterado em um UPDATE (evita reclassificar mural <-> pessoal para escapar do gate de exclusão).'
      using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'notifications.user_id não pode ser alterado em um UPDATE (evita reatribuir notificação pessoal para outro destinatário).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.notifications_prevent_mode_switch() is
  'Trigger BEFORE UPDATE: bloqueia mudança de tenant_id/audience/user_id em '
  'UPDATE de notifications. Fecha o vetor de escalação explicado no '
  'comentário da seção 4 de 0065_rls_notifications.sql (WITH CHECK de '
  'múltiplas policies de UPDATE permissivas combinado por OR).';

create trigger notifications_prevent_mode_switch_trg
  before update on public.notifications
  for each row
  execute function public.notifications_prevent_mode_switch();

-- ---------------------------------------------------------------------
-- Grants: `notifications` já tem exatamente `select, insert, update`
-- concedido a `authenticated` desde 0064 -- bate com as policies acima
-- (sem policy de delete, sem grant de delete). Nada a corrigir.
--
-- Bypass de `service_role`: nenhuma Edge Function deste módulo existe hoje
-- -- mesma ressalva já registrada em 0045/0051/0055/0056/0063. As 2 RPCs
-- públicas do espelho de vendas (create_public_lead/
-- create_public_reservation) que passam a inserir notificação
-- (0066_espelho_vendas_lead_notifications.sql) são `security definer`
-- chamadas por `anon`/`authenticated` via PostgREST, não dependem de
-- `service_role`.
--
-- Ver supabase/tests/0065_notifications_isolation.sql para o teste de
-- isolamento completo.
-- ---------------------------------------------------------------------
