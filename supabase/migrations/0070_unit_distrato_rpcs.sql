-- 0070_unit_distrato_rpcs.sql
-- Automação de Distrato — fecha o débito técnico de
-- `original-project/src/pages/UnitDetail.jsx` (gatilho automático ao
-- aprovar `TERMO_DISTRATO`, linhas ~200-270; botão manual "Registrar
-- Distrato", linhas ~375-445) e
-- `original-project/src/components/unit/unitStatusHelpers.jsx`
-- (`resetUnitMcmvFlow`/`shouldResetUnitMcmvFlow`). Sem tabela nova — todo o
-- schema necessário já existia antes de 0069 (deals.distrato_*,
-- deal_sales_stage.distratado/perdido, documents.doc_type=termo_distrato,
-- document_status.aprovado, unit_admin_status.distrato,
-- status_transitions.transition_type=admin) — 0069 só fechou o único gap
-- real (activity_type.status_change).
--
-- 2 FUNCTIONS, AMBAS SECURITY DEFINER (deliberado, DIFERENTE de
-- `update_deal_stage`/`create_commission_adjustment` etc., que rodam
-- SECURITY INVOKER porque bastava a RLS já existente de cada tabela
-- envolvida): aqui a autorização não é "qualquer role com policy de UPDATE
-- nas tabelas X/Y/Z", é uma regra de produto explícita — "mesma equipe
-- interna que já mexe em documents/units" — verificada UMA VEZ, dentro da
-- função, contra `tenant_role`, em vez de depender de 5 policies
-- (documents/deals/units/status_transitions/notifications) permanecerem
-- alinhadas entre si para sempre autorizarem exatamente o mesmo conjunto de
-- papéis. Mesma motivação de `run_finance_checkup` (0068): a checagem
-- interna é a autorização real, não uma camada redundante sobre a RLS (que
-- aqui é bypassada pelas 2 functions, exatamente como acontece com
-- run_finance_checkup sobre finance_accounts/payment_installments/
-- finance_events).
--
-- tenant_id NUNCA vem de parâmetro em nenhuma das 2 funções — sempre
-- `(auth.jwt() ->> 'tenant_id')::uuid`, a mesma fonte usada por toda RLS
-- deste projeto (0002/0010/0017/0032/0065). Toda leitura/escrita dentro das
-- 2 funções é explicitamente filtrada por esse tenant_id — é essa
-- filtragem manual, não a RLS (bypassada por SECURITY DEFINER), que isola
-- um tenant do outro aqui dentro.
--
-- `set search_path = ''` -- mesma prática de 0005/0051/0055/0059/0063/0068:
-- todo objeto referenciado no corpo é schema-qualificado (`public.units`,
-- `public.deals` etc.).
--
-- =======================================================================
-- 1. apply_unit_distrato
-- =======================================================================
--
-- Traduz para uma única transação atômica as 4 escritas que o original faz
-- sequencialmente (sem transação, sem rollback em caso de falha no meio) em
-- 2 pontos diferentes do código com a MESMA sequência de efeitos --
-- `handleDistrato` (botão manual, UnitDetail.jsx ~375-445) e o `onSuccess`
-- de `updateDocMutation` quando `doc_type === "TERMO_DISTRATO" && status ===
-- "APROVADO"` (gatilho automático, UnitDetail.jsx ~200-270). Uma função só
-- para os dois casos, distinguidos por `p_source` (ver comentário da seção
-- de notificação abaixo) -- não duas funções quase idênticas.
--
-- PRECONDIÇÃO, SEMPRE CHECADA (fiel aos dois pontos do original, que
-- checam a MESMA coisa antes de agir -- `handleDistrato` via `alert(...)`
-- e `return`; o gatilho automático só dispara porque o documento que
-- acabou de ser aprovado JÁ É o próprio TERMO_DISTRATO, mas a função não
-- assume isso -- reconfirma direto na tabela, cobrindo o caso de uma
-- corrida em que o documento tenha sido reprovado/apagado entre a UI
-- disparar a chamada e a função executar): existe pelo menos 1 `documents`
-- com `doc_type = 'termo_distrato'`, `status = 'aprovado'`, `unit_id =
-- p_unit_id`, `tenant_id` do claim, `is_deleted = false`? Checado via
-- SELECT direto (SECURITY DEFINER bypassa a RLS de `documents`, 0032 --
-- por isso o filtro de tenant_id aqui é manual, não herdado de policy).
--
-- `p_source`: parâmetro novo, não pedido explicitamente na tarefa mas
-- necessário para replicar fielmente 2 textos de notificação diferentes do
-- original a partir de UMA função (em vez de inventar um texto genérico
-- que não corresponde a nenhum dos dois, ou duplicar a função inteira só
-- para variar 2 strings) -- decisão registrada aqui, reportada ao
-- orquestrador:
--   'manual' (default): título "Distrato Registrado", mensagem "Unidade
--   {sku} foi distratada" -- fiel a handleDistrato.
--   'auto_document_approval': título "Distrato Aplicado Automaticamente",
--   mensagem "Unidade {sku} liberada após aprovação do Termo de Distrato"
--   -- fiel ao onSuccess de updateDocMutation. Quem chama (frontend) decide
--   qual dos dois contextos está vivendo -- a função não infere isso
--   sozinha.
-- Validado contra um allowlist de 2 valores dentro da função (não é um
-- enum de banco -- parâmetro de apresentação, não dado persistido em
-- nenhuma coluna).
--
-- `p_reason`: usado como `deals.distrato_reason` quando há negócio ativo,
-- com fallback para 'Distrato aplicado' (fiel ao `coalesce` pedido na
-- tarefa) -- nem `handleDistrato` nem o gatilho automático do original
-- pedem uma razão ao usuário (ambos gravam uma string fixa,
-- "Distrato manual via UnitDetail" / "Termo de Distrato aprovado
-- automaticamente"), mas o parâmetro existe para o frontend poder
-- oferecer um campo de observação livre no botão manual sem precisar de
-- outra migration depois -- trimmed (nullif(btrim(...), '')) igual ao
-- padrão já usado em update_deal_stage (0018).
--
-- IDEMPOTÊNCIA: NÃO é garantida contra chamadas repetidas na mesma unidade
-- (decisão consciente, não descuido) -- se chamada de novo numa unidade já
-- em admin_status='distrato' sem negócio ativo, a função roda de novo sem
-- erro (sem negócio para atualizar, unit já nos mesmos valores, mais um
-- status_transitions/notifications registrados). O original também não
-- guarda contra isso (o botão manual fica sempre visível na tela, sem
-- desabilitar após o primeiro clique) -- fiel ao comportamento original,
-- não uma lacuna nova introduzida aqui. Se o produto quiser bloquear
-- chamadas repetidas, é uma trava de UI (desabilitar o botão quando
-- admin_status já é 'distrato'), não uma responsabilidade desta RPC.
--
-- QUEM PODE CHAMAR: `tenant_role in ('admin', 'comercial', 'administrativo')`
-- do tenant do claim -- mesmo critério de quem já pode fazer UPDATE em
-- `documents`/`units` (0032_rls_documents.sql, 0010_rls_catalog.sql).
-- `cliente`/`investidor` nunca -- sem exceção, sem policy equivalente em
-- nenhuma das 2 migrations citadas.

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

  if p_source not in ('manual', 'auto_document_approval') then
    raise exception 'p_source inválido: use ''manual'' ou ''auto_document_approval''.'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- =====================================================================
  -- 1. Precondição, sempre checada -- fiel a handleDistrato/onSuccess do
  --    original (ver comentário no topo do arquivo).
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
  --    fiéis aos 2 pontos do original (ver comentário no topo do arquivo).
  -- =====================================================================
  select p.name into v_project_name
  from public.projects p
  where p.id = v_unit.project_id
    and p.tenant_id = v_tenant_id;

  v_notification_title := case
    when p_source = 'auto_document_approval' then 'Distrato Aplicado Automaticamente'
    else 'Distrato Registrado'
  end;

  v_notification_message := 'Unidade ' || v_unit.sku ||
    case
      when p_source = 'auto_document_approval' then ' liberada após aprovação do Termo de Distrato'
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
    (case when p_source = 'auto_document_approval' then 'auto_distrato_' else 'distrato_' end)
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
  'de parâmetro. p_source (''manual''|''auto_document_approval'') controla só o '
  'texto da notificação/log, fiel aos 2 pontos de chamada do original '
  '(handleDistrato / gatilho automático ao aprovar TERMO_DISTRATO).';

-- =======================================================================
-- 2. check_and_reset_unit_mcmv_flow
-- =======================================================================
--
-- Réplica de `resetUnitMcmvFlow`/`shouldResetUnitMcmvFlow`
-- (unitStatusHelpers.jsx) -- chamada de forma REATIVA pelo frontend ao
-- abrir a tela de detalhe da unidade (fiel ao `useEffect` do original), NÃO
-- é um gatilho de banco (trigger). Unifica as 2 funções JS num único RPC
-- que decide e, se aplicável, já aplica a correção -- não há necessidade de
-- portar "shouldReset" e "reset" como 2 chamadas separadas: o original só
-- chama `resetUnitMcmvFlow` depois de confirmar `shouldResetUnitMcmvFlow`
-- na mesma tela, com a MESMA leitura -- juntar as 2 numa função evita ler o
-- estado 2 vezes e uma janela de corrida entre a leitura e a escrita.
--
-- LÓGICA, 1:1 com o original:
--   1. unit.admin_status != 'distrato' -> {reset: false} (nada a fazer).
--   2. unit.active_deal_id is null -> {reset: false}.
--   3. Busca esse negócio; se não existir mais (deletado/inacessível) ->
--      {reset: false} (achado: o original nem cobre esse caso -- ele NÃO
--      teria uma proteção explícita para "active_deal_id aponta pra um
--      Deal que sumiu" -- `shouldResetUnitMcmvFlow` simplesmente retorna
--      false se `deals.length === 0`; replicado aqui com o mesmo efeito).
--   4. deal.sales_stage in ('distratado', 'perdido') -> {reset: false}
--      (negócio antigo, não é reabertura de verdade).
--   5. Senão: unit.admin_status -> 'laudo_engenharia'; activities (type=
--      'status_change', fiel ao valor adicionado em 0069); notifications
--      (mural, type='VENDA', severity='INFO'); {reset: true}.
--
-- QUEM PODE CHAMAR: qualquer `authenticated` do tenant que já tenha acesso
-- de LEITURA à unidade -- na prática, mesmo critério de
-- `units_select_tenant_team` (0010): `tenant_role in ('admin', 'comercial',
-- 'administrativo')`. Checagem reativa de leitura+correção, não uma ação
-- destrutiva (só reabre um ciclo que já deveria ter sido reaberto), mas
-- ainda assim SECURITY DEFINER com tenant escopado pelo claim (nunca por
-- parâmetro) -- consistente com apply_unit_distrato acima, e porque
-- SECURITY DEFINER bypassa a RLS de units/deals/activities/notifications,
-- então a mesma restrição de papel de 0010 precisa ser replicada aqui
-- manualmente para não abrir leitura/escrita para cliente/investidor.

create or replace function public.check_and_reset_unit_mcmv_flow(
  p_unit_id uuid
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
  v_deal public.deals;
begin
  -- =====================================================================
  -- 0. Autenticação/autorização -- mesmo padrão de apply_unit_distrato.
  -- =====================================================================
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'check_and_reset_unit_mcmv_flow requer um usuário autenticado.'
      using errcode = '28000';
  end if;

  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  if v_tenant_id is null then
    raise exception 'check_and_reset_unit_mcmv_flow requer um tenant_id válido no token.'
      using errcode = '28000';
  end if;

  if v_tenant_role not in ('admin', 'comercial', 'administrativo') then
    raise exception 'Seu papel não tem acesso de leitura a esta unidade.'
      using errcode = '42501';
  end if;

  -- =====================================================================
  -- 1. Unidade -- tenant escopado pelo claim, nunca por parâmetro.
  -- =====================================================================
  select * into v_unit
  from public.units
  where id = p_unit_id
    and tenant_id = v_tenant_id
    and is_deleted = false;

  if not found then
    raise exception 'Unidade não encontrada ou sem permissão.';
  end if;

  if v_unit.admin_status is distinct from 'distrato' then
    return jsonb_build_object('reset', false, 'reason', 'not_in_distrato');
  end if;

  -- =====================================================================
  -- 2. Sem negócio ativo referenciado -- nada a reabrir.
  -- =====================================================================
  if v_unit.active_deal_id is null then
    return jsonb_build_object('reset', false, 'reason', 'no_active_deal');
  end if;

  -- =====================================================================
  -- 3. Busca o negócio -- ausência (deletado/inacessível) tratada como
  --    "nada a fazer", fiel ao original (ver comentário no topo).
  -- =====================================================================
  select * into v_deal
  from public.deals
  where id = v_unit.active_deal_id
    and tenant_id = v_tenant_id
    and is_deleted = false;

  if not found then
    return jsonb_build_object('reset', false, 'reason', 'active_deal_not_found');
  end if;

  -- =====================================================================
  -- 4. Negócio antigo (já distratado/perdido) -- não é reabertura de
  --    verdade.
  -- =====================================================================
  if v_deal.sales_stage in ('distratado', 'perdido') then
    return jsonb_build_object('reset', false, 'reason', 'active_deal_is_stale');
  end if;

  -- =====================================================================
  -- 5. Reabertura de verdade -- unit volta para o início do fluxo MCMV,
  --    log de activity + notification.
  -- =====================================================================
  update public.units
  set
    admin_status = 'laudo_engenharia',
    updated_by_user_id = v_user_id
  where id = p_unit_id
    and tenant_id = v_tenant_id;

  insert into public.activities (
    tenant_id, unit_id, deal_id, type, title, description, created_by_user_id
  ) values (
    v_tenant_id,
    p_unit_id,
    v_deal.id,
    'status_change',
    'Reabertura de ciclo MCMV (pós-distrato)',
    'Unidade retornou ao fluxo MCMV por nova negociação. Status resetado para: Laudo Engenharia.',
    v_user_id
  );

  insert into public.notifications (
    tenant_id, title, message, type, severity, audience, event_key, link_route,
    entity_type, entity_id, meta, created_by_user_id
  ) values (
    v_tenant_id,
    'Unidade reaberta para nova venda',
    'A unidade ' || v_unit.sku || ' foi reaberta no fluxo MCMV após distrato anterior.',
    'VENDA',
    'INFO',
    'INTERNAL_ONLY',
    'unit_mcmv_reset_' || p_unit_id::text || '_' || extract(epoch from clock_timestamp())::bigint::text,
    'UnitDetail?id=' || p_unit_id::text,
    'Unit',
    p_unit_id,
    jsonb_build_object('unit_id', p_unit_id, 'unit_sku', v_unit.sku, 'deal_id', v_deal.id),
    v_user_id
  );

  return jsonb_build_object('reset', true, 'deal_id', v_deal.id);
end;
$$;

comment on function public.check_and_reset_unit_mcmv_flow(uuid) is
  'Réplica de resetUnitMcmvFlow/shouldResetUnitMcmvFlow (unitStatusHelpers.jsx) '
  'numa única função: se a unidade está em admin_status=distrato E tem um '
  'active_deal_id apontando para um negócio de verdade ativo (sales_stage não '
  'é distratado/perdido), reabre o ciclo MCMV (admin_status=laudo_engenharia) '
  'e grava activities (type=status_change)/notifications. Chamada REATIVA '
  'pelo frontend ao abrir UnitDetailPage, não é trigger de banco. SECURITY '
  'DEFINER: bypassa a RLS de units/deals/activities/notifications -- a '
  'autorização real é a checagem interna de tenant_role in (admin,comercial,'
  'administrativo), mesmo critério de units_select_tenant_team (0010). '
  'tenant_id sempre de (auth.jwt() ->> ''tenant_id'')::uuid, nunca de parâmetro.';

-- =======================================================================
-- Grants: EXECUTE só para `authenticated` -- a checagem de papel é DENTRO
-- de cada função (mesmo padrão de get_tenant_members/run_finance_checkup,
-- 0063/0068), não no grant. `anon` nunca -- não há fluxo de distrato/reset
-- de MCMV sem login, coberto pelo revoke de PUBLIC (remove o grant
-- implícito herdado por qualquer role, incluindo anon).
-- =======================================================================

grant execute
  on function public.apply_unit_distrato(uuid, text, text)
  to authenticated;

grant execute
  on function public.check_and_reset_unit_mcmv_flow(uuid)
  to authenticated;

revoke execute
  on function public.apply_unit_distrato(uuid, text, text)
  from public, anon;

revoke execute
  on function public.check_and_reset_unit_mcmv_flow(uuid)
  from public, anon;

-- ---------------------------------------------------------------------
-- Bypass de service_role: NENHUMA das 2 funções depende de service_role --
-- ambas são SECURITY DEFINER chamadas via PostgREST por `authenticated`
-- normal, com a checagem de tenant_role feita dentro do corpo. Nenhuma Edge
-- Function existe para este módulo (mesma ressalva já registrada em
-- 0045/0051/0055/0056/0063/0065) -- não há bypass de RLS via service_role
-- exposto ao client em nenhum ponto deste fluxo.
--
-- RLS: esta migration não cria tabela nova, só 2 functions security
-- definer operando sobre documents/deals/units/status_transitions/
-- activities/notifications -- a RLS dessas 6 tabelas (0032/0017/0010/0065)
-- continua sendo a única linha de autorização para todo acesso DIRETO via
-- PostgREST fora destas 2 funções. Ver
-- supabase/tests/0070_unit_distrato_rpcs.sql para o teste de isolamento
-- completo.
-- ---------------------------------------------------------------------
