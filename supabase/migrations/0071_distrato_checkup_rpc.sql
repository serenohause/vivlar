-- 0071_distrato_checkup_rpc.sql
-- RPC de checkup/saneamento de distratos -- porta `runReconciliation`
-- (`original-project/src/pages/DistratoCheckup.jsx`) para uma única função
-- `plpgsql`, no mesmo espírito de `run_finance_checkup` (0068): detecta (e,
-- se solicitado, corrige) inconsistências, com o mesmo contrato de retorno
-- `dry_run`/`corrections_applied`/`executed_at`/`summary`/`details`.
--
-- ACHADO NO ORIGINAL, CONFIRMADO POR LEITURA LINHA A LINHA DE
-- `DistratoCheckup.jsx`: a tela mostra um card "Inconsistências Detectadas"
-- (`potentialIssues`, calculado no topo do componente -- unidades com
-- `TERMO_DISTRATO` aprovado E (`status` em VENDIDA/RESERVADA OU existe deal
-- ativo em RESERVADO/PROPOSTA/VENDIDO)), e o texto "O que esta ação faz"
-- descreve essa reconciliação como se o botão a resolvesse -- mas
-- `runReconciliation` de verdade só chama `resetUnitMcmvFlow` (reset de
-- fluxo MCMV, para unidades em `admin_status="DISTRATO"` com negócio ativo
-- não-distratado/perdido). O array `reconciled` NUNCA recebe `.push` em
-- lugar nenhum do arquivo (grep confirmado) -- é código morto, sempre fica
-- em 0. Ou seja: o original tem um bug real -- mostra um problema (unidade
-- vendida/reservada com distrato aprovado) e o botão resolve outro
-- (reabertura de MCMV), sem nenhuma relação direta entre os dois.
--
-- DECISÃO DO USUÁRIO (via AskUserQuestion, já aprovada antes desta
-- migration ser escrita -- não uma invenção livre do agente): CORRIGIR o
-- bug, não replicá-lo. `run_distrato_checkup` faz as DUAS coisas de
-- verdade:
--   1. Reconciliação REAL -- mesmo critério de `potentialIssues` do
--      original (documento aprovado + status/deal inconsistente) -- mas
--      aplicando de fato o distrato via `public.apply_unit_distrato`, em
--      vez de só relatar o problema sem corrigi-lo.
--   2. Reset de MCMV em lote -- mesmo critério de
--      `check_and_reset_unit_mcmv_flow` (0070), aplicado a TODAS as
--      unidades candidatas do tenant de uma vez, via
--      `public.check_and_reset_unit_mcmv_flow` (que já era reativo,
--      unidade por unidade, ao abrir UnitDetailPage -- aqui vira um
--      "passe" em lote sobre todo o tenant).
--
-- SECURITY DEFINER + `tenant_role = 'admin'` EXATO (não o conjunto mais
-- amplo `admin/comercial/administrativo` de `apply_unit_distrato`/
-- `check_and_reset_unit_mcmv_flow`): fiel ao original, que checa
-- `user.role !== "admin"` e bloqueia com `alert(...)` antes mesmo de montar
-- a tela (`DistratoCheckup.jsx` não tem esse guard explícito no código
-- mostrado, mas é o mesmo padrão de acesso adotado por toda ferramenta de
-- checkup/saneamento deste projeto -- `run_finance_checkup`, 0068, com a
-- mesma justificativa: saneamento em lote é operação de administrador,
-- não do mesmo conjunto de papéis que já opera as tabelas no dia a dia).
-- Mesmo padrão de erro/errcode de `run_finance_checkup`: `28000` sem
-- sessão/tenant_id, `42501` fora de `admin`.
--
-- `set search_path = ''` -- mesma prática de 0005/0051/.../0068/0070: todo
-- objeto referenciado no corpo é schema-qualificado (`public.units` etc.).
--
-- tenant_id NUNCA vem de parâmetro -- sempre
-- `(auth.jwt() ->> 'tenant_id')::uuid`, mesma fonte de toda RLS/RPC deste
-- projeto.
--
-- SEM TABELAS TEMPORÁRIAS (DIFERENTE de `run_finance_checkup`, 0068):
-- lá, o merge de carteiras/dedupe de parcelas precisava de uma tabela
-- temporária para materializar QUEM é primário/duplicata uma única vez,
-- porque o mesmo cálculo de desempate (row_number/first_value sobre
-- múltiplas linhas concorrendo pela mesma chave) precisava ser idêntico
-- entre o relatório e a correção -- calculá-lo 2 vezes arriscava divergir.
-- Aqui as 2 categorias de candidato são cada uma uma query direta e
-- determinística sem desempate nenhum (não há "vencedor" a escolher entre
-- várias linhas concorrentes -- cada unidade candidata é candidata sozinha,
-- independente de qualquer outra) -- por isso um único `for ... in select`
-- por categoria, iterado diretamente sobre a MESMA query usada para compor
-- o relatório, é suficiente e mais simples: quando `p_dry_run = true`, o
-- corpo do loop só registra o candidato no relatório; quando
-- `p_dry_run = false`, o mesmo corpo do loop também aplica a correção
-- chamando a RPC correspondente. Nenhuma tabela sobrevive além do escopo
-- da função (nem precisaria, já que não há reaproveitamento de plano de
-- desempate entre categorias).
--
-- TRATAMENTO DE ERRO POR UNIDADE: cada iteração de cada um dos 2 loops
-- chama a RPC correspondente (`apply_unit_distrato`/
-- `check_and_reset_unit_mcmv_flow`) dentro de um bloco
-- `begin ... exception when others then ... end` -- em PL/pgSQL, todo
-- bloco com cláusula EXCEPTION cria implicitamente um SAVEPOINT antes de
-- executar seu corpo (não precisa de `savepoint`/`release savepoint`
-- explícitos, o interpretador faz isso sozinho): se a chamada aninhada
-- levantar exceção, só o efeito dessa iteração é desfeito (rollback até o
-- savepoint implícito), e a execução do restante da função continua
-- normalmente -- uma unidade com dado inconsistente que faça
-- `apply_unit_distrato`/`check_and_reset_unit_mcmv_flow` falhar (ex: uma
-- corrida rara em que o documento aprovado foi removido entre o SELECT de
-- candidatos e a chamada) não derruba a transação inteira nem impede as
-- demais unidades de serem processadas -- mesmo espírito do `try/catch`
-- por unidade do `runReconciliation` original (que também não abortava o
-- loop inteiro por causa de 1 erro), só que agora com efeito real por trás.
-- Ambas as RPCs chamadas são SECURITY DEFINER -- chamar uma função
-- SECURITY DEFINER de dentro de outra função PL/pgSQL (mesmo também
-- SECURITY DEFINER) é suportado normalmente pelo Postgres, sem
-- necessidade de nenhum tratamento especial além do bloco de exceção acima
-- (o "dono" de ambas é o mesmo, e nenhuma delas depende de
-- `SET ROLE`/`current_user` para autorizar -- a checagem de tenant_role é
-- sempre via claim do JWT da sessão original, que continua acessível
-- dentro de chamadas aninhadas).
--
-- EXTENSÃO DE `apply_unit_distrato` (0070): terceiro valor de `p_source`,
-- `'checkup_reconciliation'`, adicionado ao allowlist (antes só
-- `'manual'`/`'auto_document_approval'`) e ao `case` de
-- título/mensagem/nota de transição -- reaproveita a MESMA função/mesma
-- transação atômica/mesmos efeitos (deal distratado+inativo, unidade
-- liberada, status_transitions, notification) já usados pelos 2 outros
-- pontos de chamada, só variando o texto para refletir que esta chamada
-- veio do checkup em lote, não de uma ação manual nem do gatilho automático
-- de aprovação de documento:
--   'checkup_reconciliation': título "Distrato Reconciliado via Checkup",
--   mensagem "Unidade {sku} reconciliada automaticamente pelo checkup de
--   distratos" -- fiel ao espírito do card "Inconsistências Detectadas" do
--   original (que descrevia exatamente esta situação, mesmo sem o botão
--   realmente corrigi-la). `create or replace function` abaixo repete o
--   corpo inteiro de 0070 (exigência do Postgres para CREATE OR REPLACE --
--   não dá para "patchar" só um trecho do corpo de uma function), mas as
--   ÚNICAS mudanças de conteúdo em relação a 0070 são essas 2 (allowlist +
--   3 ramos de `case` em vez de 2) -- todo o resto é idêntico.
--
-- RESULTADO/RELATÓRIO: não replica os campos mortos `reconciled`/`skipped`
-- do original literalmente -- o objetivo aqui é um relatório fiel ao que a
-- RPC realmente faz (que agora é mais correto que o original, não uma cópia
-- de um relatório que descrevia uma ação que nunca acontecia).
-- `summary`/`details` cobrem: total de unidades ativas do tenant,
-- candidatos de cada categoria, quantos foram de fato reconciliados/
-- resetados, e quantos erros -- mesma forma em dry_run e execução real
-- (só o campo `result` de cada item de `details` muda entre
-- `'pending_dry_run'` e `'reconciled'`/`'reset'`/`'error'`).

-- =======================================================================
-- 1. apply_unit_distrato -- CREATE OR REPLACE só para estender o
--    allowlist/case de p_source (ver comentário acima). Corpo idêntico ao
--    de 0070 fora dessas 2 mudanças.
-- =======================================================================

create or replace function public.apply_unit_distrato(
  p_unit_id uuid,
  p_reason text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_tenant_role text;

  v_unit public.units;
  v_prev_admin_status public.unit_admin_status;

  v_deal public.deals;
  v_deal_id uuid;
  v_client_name text;
  v_project_name text;

  v_trimmed_reason text;
  v_notification_title text;
  v_notification_message text;
  v_transition_note text;
begin
  -- =====================================================================
  -- 0. Autenticação/autorização -- verificada AQUI DENTRO, nunca presumida
  --    de quem chamou (mesmo raciocínio de run_finance_checkup, 0068).
  -- =====================================================================
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'apply_unit_distrato requer um usuário autenticado.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  if v_tenant_id is null then
    raise exception 'apply_unit_distrato requer um tenant_id válido no token.'
      using errcode = '28000';
  end if;

  if v_tenant_role not in ('admin', 'comercial', 'administrativo') then
    raise exception 'Seu papel não tem permissão para aplicar distrato nesta unidade.'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  if p_source not in ('manual', 'auto_document_approval', 'checkup_reconciliation') then
    raise exception 'p_source inválido: use ''manual'', ''auto_document_approval'' ou ''checkup_reconciliation''.'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- =====================================================================
  -- 1. Precondição, sempre checada -- fiel a handleDistrato/onSuccess do
  --    original (ver comentário no topo de 0070).
  -- =====================================================================
  if not exists (
    select 1
    from public.documents d
    where d.unit_id = p_unit_id
      and d.tenant_id = v_tenant_id
      and d.doc_type = 'termo_distrato'
      and d.status = 'aprovado'
      and d.is_deleted = false
  ) then
    raise exception 'É necessário ter o Termo de Distrato aprovado para realizar o distrato.';
  end if;

  -- =====================================================================
  -- 1b. Unidade -- confirma existência no tenant certo e captura o
  --     admin_status ANTERIOR antes de sobrescrever (necessário para
  --     status_transitions.from_status no passo 5).
  -- =====================================================================
  select * into v_unit
  from public.units
  where id = p_unit_id
    and tenant_id = v_tenant_id
    and is_deleted = false;

  if not found then
    raise exception 'Unidade não encontrada ou sem permissão.';
  end if;

  v_prev_admin_status := v_unit.admin_status;

  -- =====================================================================
  -- 2. Negócio ativo da unidade.
  -- =====================================================================
  select * into v_deal
  from public.deals
  where unit_id = p_unit_id
    and tenant_id = v_tenant_id
    and is_active = true
    and is_deleted = false;

  if found then
    v_deal_id := v_deal.id;
    v_trimmed_reason := coalesce(nullif(btrim(p_reason), ''), 'Distrato aplicado');

    -- =====================================================================
    -- 3. deal -> distratado/inativo.
    -- =====================================================================
    update public.deals
    set
      sales_stage = 'distratado',
      is_active = false,
      distrato_at = now(),
      distrato_reason = v_trimmed_reason,
      distrato_by_user_id = v_user_id,
      updated_by_user_id = v_user_id
    where id = v_deal.id
      and tenant_id = v_tenant_id;

    -- Nome do cliente, só para compor a mensagem da notificação (passo 6)
    -- -- fiel a `client ? \` - Cliente: ${client.name}\` : ''` do original.
    select c.name into v_client_name
    from public.clients c
    where c.id = v_deal.client_id
      and c.tenant_id = v_tenant_id;
  else
    v_deal_id := null;
    v_client_name := null;
  end if;

  -- =====================================================================
  -- 4. unit -> disponivel/distrato/sem active_deal_id.
  -- =====================================================================
  update public.units
  set
    status = 'disponivel',
    admin_status = 'distrato',
    active_deal_id = null,
    updated_by_user_id = v_user_id
  where id = p_unit_id
    and tenant_id = v_tenant_id;

  -- =====================================================================
  -- 5. Log de transição -- from_status = admin_status capturado no passo
  --    1b, deal_id = do negócio achado no passo 2 (null se não havia).
  -- =====================================================================
  v_transition_note := case
    when p_source = 'auto_document_approval'
      then 'Distrato aplicado automaticamente ao aprovar documento'
    when p_source = 'checkup_reconciliation'
      then 'Distrato reconciliado automaticamente via checkup de saneamento'
    else 'Distrato realizado - Deal e Unidade sincronizados automaticamente'
  end;

  insert into public.status_transitions (
    tenant_id, unit_id, deal_id, from_status, to_status, transition_type, note, created_by_user_id
  ) values (
    v_tenant_id,
    p_unit_id,
    v_deal_id,
    v_prev_admin_status::text,
    'distrato',
    'admin',
    v_transition_note,
    v_user_id
  );

  -- =====================================================================
  -- 6. Notificação (mural interno) -- título/mensagem variam por p_source,
  --    fiéis aos 2 pontos do original (ver comentário no topo de 0070) mais
  --    o terceiro caso (checkup, ver comentário no topo desta migration).
  -- =====================================================================
  select p.name into v_project_name
  from public.projects p
  where p.id = v_unit.project_id
    and p.tenant_id = v_tenant_id;

  v_notification_title := case
    when p_source = 'auto_document_approval' then 'Distrato Aplicado Automaticamente'
    when p_source = 'checkup_reconciliation' then 'Distrato Reconciliado via Checkup'
    else 'Distrato Registrado'
  end;

  v_notification_message := 'Unidade ' || v_unit.sku ||
    case
      when p_source = 'auto_document_approval' then ' liberada após aprovação do Termo de Distrato'
      when p_source = 'checkup_reconciliation' then ' reconciliada automaticamente pelo checkup de distratos'
      else ' foi distratada'
    end ||
    case when v_client_name is not null then ' - Cliente: ' || v_client_name else '' end;

  insert into public.notifications (
    tenant_id, title, message, type, severity, audience, event_key, link_route,
    entity_type, entity_id, meta, created_by_user_id
  ) values (
    v_tenant_id,
    v_notification_title,
    v_notification_message,
    'CRM',
    'ALERTA',
    'INTERNAL_ONLY',
    (case
      when p_source = 'auto_document_approval' then 'auto_distrato_'
      when p_source = 'checkup_reconciliation' then 'checkup_distrato_'
      else 'distrato_'
    end)
      || p_unit_id::text || '_' || extract(epoch from clock_timestamp())::bigint::text,
    'UnitDetail?id=' || p_unit_id::text,
    'Unit',
    p_unit_id,
    jsonb_build_object(
      'project_name', v_project_name,
      'unit_sku', v_unit.sku,
      'client_name', v_client_name,
      'deal_id', v_deal_id,
      'trigger', p_source
    ),
    v_user_id
  );

  return jsonb_build_object(
    'unit_id', p_unit_id,
    'deal_id', v_deal_id,
    'previous_admin_status', v_prev_admin_status,
    'source', p_source,
    'applied_at', now()
  );
end;
$$;

comment on function public.apply_unit_distrato(uuid, text, text) is
  'Aplica distrato numa unidade: exige Termo de Distrato aprovado (precondição '
  'sempre checada), marca o negócio ativo (se houver) como distratado/inativo, '
  'libera a unidade (status=disponivel, admin_status=distrato, '
  'active_deal_id=null), grava status_transitions e uma notification -- tudo '
  'numa única transação atômica. SECURITY DEFINER: bypassa a RLS de '
  'documents/deals/units/status_transitions/notifications -- a autorização '
  'real é a checagem interna de tenant_role in (admin,comercial,'
  'administrativo), mesmo critério de quem já atualiza documents/units '
  '(0032/0010). tenant_id sempre de (auth.jwt() ->> ''tenant_id'')::uuid, nunca '
  'de parâmetro. p_source (''manual''|''auto_document_approval''|'
  '''checkup_reconciliation'') controla só o texto da notificação/log, fiel '
  'aos 2 pontos de chamada do original (handleDistrato / gatilho automático '
  'ao aprovar TERMO_DISTRATO) mais o terceiro caso introduzido em 0071 '
  '(run_distrato_checkup, correção do bug de reconciliação nunca aplicada '
  'do original).';

-- =======================================================================
-- 2. run_distrato_checkup
-- =======================================================================
--
-- Ver comentário completo no topo deste arquivo. Duas categorias de
-- candidato, cada uma com sua própria query (reaproveitada tal e qual
-- entre relatório e correção, iterada com `for ... in select` direto, sem
-- tabela temporária -- ver justificativa no topo do arquivo):
--
--   1. RECONCILIAÇÃO (mesmo critério de `potentialIssues` do original):
--      unidade do tenant, não deletada, com pelo menos 1 `documents`
--      `doc_type='termo_distrato'`/`status='aprovado'`/`is_deleted=false`, E
--      (`units.status in ('vendida','reservada')` OU existe `deals` ativo
--      (`is_active=true`, `is_deleted=false`) com
--      `sales_stage in ('reservado','proposta','vendido')`). Se
--      `p_dry_run=false`: chama `public.apply_unit_distrato(unit_id, null,
--      'checkup_reconciliation')` por unidade, dentro de bloco
--      exception -- 1 erro não impede as demais.
--
--   2. RESET MCMV EM LOTE (mesmo critério de
--      `check_and_reset_unit_mcmv_flow`, 0070): unidade do tenant, não
--      deletada, `admin_status='distrato'`, `active_deal_id` não nulo
--      apontando para um `deals` existente (`is_deleted=false`) com
--      `sales_stage not in ('distratado','perdido')`. Se
--      `p_dry_run=false`: chama
--      `public.check_and_reset_unit_mcmv_flow(unit_id)` por unidade, mesmo
--      tratamento de erro por unidade.
--
-- As 2 categorias não se sobrepõem em efeito: uma unidade reconciliada na
-- categoria 1 tem `active_deal_id` zerado por `apply_unit_distrato` (passo
-- 4), o que a torna automaticamente inelegível para a categoria 2 (que
-- exige `active_deal_id` não nulo) -- sem necessidade de excluí-la
-- manualmente da segunda query.

create or replace function public.run_distrato_checkup(
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_tenant_role text;

  v_total_units int;

  v_reconciliation_candidate record;
  v_reconciliation_details jsonb := '[]'::jsonb;
  v_reconciliation_candidate_count int := 0;
  v_reconciliation_applied_count int := 0;
  v_reconciliation_error_count int := 0;

  v_mcmv_candidate record;
  v_mcmv_details jsonb := '[]'::jsonb;
  v_mcmv_candidate_count int := 0;
  v_mcmv_applied_count int := 0;
  v_mcmv_error_count int := 0;

  v_apply_result jsonb;
  v_error_message text;
begin
  -- =====================================================================
  -- 0. Autenticação/autorização -- mesmo padrão de run_finance_checkup
  --    (0068): tenant_role deve ser EXATAMENTE 'admin' (fiel a
  --    `user.role !== "admin"` do original), não o conjunto mais amplo de
  --    apply_unit_distrato/check_and_reset_unit_mcmv_flow.
  -- =====================================================================
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'run_distrato_checkup requer um usuário autenticado.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  if v_tenant_id is null then
    raise exception 'run_distrato_checkup requer um tenant_id válido no token.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  if v_tenant_role is distinct from 'admin' then
    raise exception 'Apenas administradores do tenant podem executar o checkup de distratos.'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- =====================================================================
  -- 1. Total de unidades ativas do tenant (denominador do relatório).
  -- =====================================================================
  select count(*) into v_total_units
  from public.units
  where tenant_id = v_tenant_id
    and is_deleted = false;

  -- =====================================================================
  -- 2. Categoria 1: reconciliação real -- mesmo critério de
  --    potentialIssues do original (ver comentário no topo do arquivo).
  -- =====================================================================
  for v_reconciliation_candidate in
    select u.id as unit_id, u.sku, u.status as unit_status
    from public.units u
    where u.tenant_id = v_tenant_id
      and u.is_deleted = false
      and exists (
        select 1
        from public.documents d
        where d.unit_id = u.id
          and d.tenant_id = v_tenant_id
          and d.doc_type = 'termo_distrato'
          and d.status = 'aprovado'
          and d.is_deleted = false
      )
      and (
        u.status in ('vendida', 'reservada')
        or exists (
          select 1
          from public.deals de
          where de.unit_id = u.id
            and de.tenant_id = v_tenant_id
            and de.is_deleted = false
            and de.is_active = true
            and de.sales_stage in ('reservado', 'proposta', 'vendido')
        )
      )
    order by u.sku
  loop
    v_reconciliation_candidate_count := v_reconciliation_candidate_count + 1;

    if p_dry_run then
      v_reconciliation_details := v_reconciliation_details || jsonb_build_object(
        'unit_id', v_reconciliation_candidate.unit_id,
        'sku', v_reconciliation_candidate.sku,
        'unit_status', v_reconciliation_candidate.unit_status,
        'result', 'pending_dry_run'
      );
    else
      begin
        select public.apply_unit_distrato(
          v_reconciliation_candidate.unit_id,
          null,
          'checkup_reconciliation'
        ) into v_apply_result;

        v_reconciliation_applied_count := v_reconciliation_applied_count + 1;
        v_reconciliation_details := v_reconciliation_details || jsonb_build_object(
          'unit_id', v_reconciliation_candidate.unit_id,
          'sku', v_reconciliation_candidate.sku,
          'unit_status', v_reconciliation_candidate.unit_status,
          'result', 'reconciled',
          'apply_unit_distrato', v_apply_result
        );
      exception when others then
        v_error_message := sqlerrm;
        v_reconciliation_error_count := v_reconciliation_error_count + 1;
        v_reconciliation_details := v_reconciliation_details || jsonb_build_object(
          'unit_id', v_reconciliation_candidate.unit_id,
          'sku', v_reconciliation_candidate.sku,
          'unit_status', v_reconciliation_candidate.unit_status,
          'result', 'error',
          'error', v_error_message
        );
      end;
    end if;
  end loop;

  -- =====================================================================
  -- 3. Categoria 2: reset MCMV em lote -- mesmo critério de
  --    check_and_reset_unit_mcmv_flow (0070), aplicado a todo o tenant.
  -- =====================================================================
  for v_mcmv_candidate in
    select u.id as unit_id, u.sku, u.active_deal_id, de.sales_stage as deal_sales_stage
    from public.units u
    join public.deals de
      on de.id = u.active_deal_id
     and de.tenant_id = v_tenant_id
     and de.is_deleted = false
    where u.tenant_id = v_tenant_id
      and u.is_deleted = false
      and u.admin_status = 'distrato'
      and u.active_deal_id is not null
      and de.sales_stage not in ('distratado', 'perdido')
    order by u.sku
  loop
    v_mcmv_candidate_count := v_mcmv_candidate_count + 1;

    if p_dry_run then
      v_mcmv_details := v_mcmv_details || jsonb_build_object(
        'unit_id', v_mcmv_candidate.unit_id,
        'sku', v_mcmv_candidate.sku,
        'deal_id', v_mcmv_candidate.active_deal_id,
        'deal_sales_stage', v_mcmv_candidate.deal_sales_stage,
        'result', 'pending_dry_run'
      );
    else
      begin
        select public.check_and_reset_unit_mcmv_flow(
          v_mcmv_candidate.unit_id
        ) into v_apply_result;

        v_mcmv_applied_count := v_mcmv_applied_count + 1;
        v_mcmv_details := v_mcmv_details || jsonb_build_object(
          'unit_id', v_mcmv_candidate.unit_id,
          'sku', v_mcmv_candidate.sku,
          'deal_id', v_mcmv_candidate.active_deal_id,
          'result', 'reset',
          'check_and_reset_unit_mcmv_flow', v_apply_result
        );
      exception when others then
        v_error_message := sqlerrm;
        v_mcmv_error_count := v_mcmv_error_count + 1;
        v_mcmv_details := v_mcmv_details || jsonb_build_object(
          'unit_id', v_mcmv_candidate.unit_id,
          'sku', v_mcmv_candidate.sku,
          'deal_id', v_mcmv_candidate.active_deal_id,
          'result', 'error',
          'error', v_error_message
        );
      end;
    end if;
  end loop;

  -- =====================================================================
  -- 4. Relatório final -- mesma forma em dry_run e execução real (só o
  --    `result` de cada item de `details` e as contagens de aplicados/
  --    erros mudam -- ver contrato completo no comentário de topo).
  -- =====================================================================

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'corrections_applied', not p_dry_run,
    'executed_at', now(),
    'summary', jsonb_build_object(
      'total_units', v_total_units,
      'reconciliation_candidates', v_reconciliation_candidate_count,
      'mcmv_reset_candidates', v_mcmv_candidate_count,
      'reconciled', v_reconciliation_applied_count,
      'mcmv_reset', v_mcmv_applied_count,
      'errors', v_reconciliation_error_count + v_mcmv_error_count
    ),
    'details', jsonb_build_object(
      'reconciliation', v_reconciliation_details,
      'mcmv_reset', v_mcmv_details
    )
  );
end;
$$;

comment on function public.run_distrato_checkup(boolean) is
  'Checkup/saneamento de distratos -- corrige o bug do original '
  '(DistratoCheckup.jsx: mostrava "Inconsistências Detectadas" mas o botão '
  'só fazia reset de MCMV, nunca reconciliava de verdade -- decisão '
  'explícita do usuário via AskUserQuestion de corrigir, não replicar o '
  'bug). Categoria 1 (reconciliação real): unidades com Termo de Distrato '
  'aprovado e status/deal inconsistente (mesmo critério de '
  'potentialIssues do original) -- aplica public.apply_unit_distrato '
  '(p_source=checkup_reconciliation) por unidade. Categoria 2 (reset MCMV '
  'em lote): unidades em admin_status=distrato com active_deal_id apontando '
  'para negócio ativo não-distratado/perdido (mesmo critério de '
  'check_and_reset_unit_mcmv_flow, 0070) -- aplica '
  'public.check_and_reset_unit_mcmv_flow por unidade. Cada chamada '
  'individual roda dentro de bloco exception -- 1 erro numa unidade não '
  'aborta a transação nem impede o processamento das demais. '
  'p_dry_run=true (default): só detecta, não aplica nenhuma correção. '
  'SECURITY DEFINER: bypassa a RLS de documents/deals/units/'
  'status_transitions/activities/notifications -- a autorização real é a '
  'checagem interna de tenant_role = admin (exato, fiel a '
  '`user.role !== "admin"` do original -- mais restrito que o '
  'admin/comercial/administrativo de apply_unit_distrato/'
  'check_and_reset_unit_mcmv_flow). tenant_id sempre de '
  '(auth.jwt() ->> ''tenant_id'')::uuid, nunca de parâmetro. Retorna jsonb '
  '{dry_run, corrections_applied, executed_at, summary: {total_units, '
  'reconciliation_candidates, mcmv_reset_candidates, reconciled, '
  'mcmv_reset, errors}, details: {reconciliation, mcmv_reset}} -- mesma '
  'forma em dry run e execução real.';

-- =======================================================================
-- Grants: EXECUTE só para `authenticated` -- a checagem de tenant_role é
-- DENTRO da função (mesmo padrão de run_finance_checkup/
-- apply_unit_distrato/check_and_reset_unit_mcmv_flow, 0068/0070), não no
-- grant. `anon` nunca -- revoke de PUBLIC remove o grant implícito herdado
-- por qualquer role, incluindo anon. Grants de apply_unit_distrato/
-- check_and_reset_unit_mcmv_flow já concedidos em 0070 e preservados pelo
-- CREATE OR REPLACE (mesmo OID de função) -- não repetidos aqui.
-- =======================================================================

grant execute
  on function public.run_distrato_checkup(boolean)
  to authenticated;

revoke execute
  on function public.run_distrato_checkup(boolean)
  from public, anon;

-- ---------------------------------------------------------------------
-- Bypass de service_role: NENHUMA das funções desta migration depende de
-- service_role -- todas SECURITY DEFINER chamadas via PostgREST por
-- `authenticated` normal, com checagem de tenant_role feita dentro do
-- corpo. Nenhuma Edge Function existe para este módulo (mesma ressalva já
-- registrada em 0045/0051/0055/0056/0063/0065/0068/0070).
--
-- RLS: esta migration não cria tabela nova, só 1 function nova
-- (run_distrato_checkup) e 1 alteração de função existente
-- (apply_unit_distrato, extensão de allowlist), ambas operando sobre
-- documents/deals/units/status_transitions/activities/notifications -- a
-- RLS dessas tabelas (0010/0017/0032/0065) continua sendo a única linha
-- de autorização para todo acesso DIRETO via PostgREST fora destas
-- funções. Ver supabase/tests/0071_distrato_checkup_rpc.sql para o teste
-- de comportamento completo.
-- ---------------------------------------------------------------------
