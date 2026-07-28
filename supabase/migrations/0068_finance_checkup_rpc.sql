-- 0068_finance_checkup_rpc.sql
-- RPC de saneamento de dados do Financeiro -- porta `executeFinanceCheckup`
-- (`src/pages/FinanceCheckup.jsx` + `src/components/finance/
-- financeCheckup.jsx` do original) para uma única função `plpgsql`
-- transacional, em vez do loop sequencial `await` sem transação do
-- original (arriscado para escrita financeira -- uma falha no meio podia
-- deixar `finance_accounts`/`payment_installments`/`finance_events`
-- inconsistentes entre si). Mesmo padrão já usado em `update_deal_stage`
-- (0018) e nas RPCs de comissão (0029): tudo dentro de uma função
-- `plpgsql`, atômica por padrão -- se qualquer statement no meio levantar
-- exceção, a função inteira é desfeita.
--
-- SECURITY DEFINER (deliberado, diferente de 0018/0029): a RLS de
-- `finance_accounts`/`payment_installments`/`finance_events`
-- (0023_rls_financeiro.sql) libera SELECT/INSERT/UPDATE para
-- admin/comercial/administrativo -- mas o checkup é uma ferramenta de
-- saneamento (merge de carteiras, exclusão de parcelas duplicadas,
-- reescrita de campos financeiros) que só faz sentido para `admin`, igual
-- ao original (`user.role !== "admin"` bloqueia em `FinanceCheckup.jsx`).
-- Se esta função rodasse `security invoker` (RLS de quem chamou), um
-- usuário `comercial`/`administrativo` -- que TEM policy de UPDATE nas 3
-- tabelas -- conseguiria executá-la normalmente, o que não é o
-- comportamento desejado. Por isso a função roda como dono (`postgres`),
-- e a checagem de `tenant_role = 'admin'` é feita EXPLICITAMENTE dentro do
-- corpo da função (não confia em quem chama já ser admin) -- é essa
-- checagem interna, não a RLS, que autoriza ou barra a chamada.
--
-- `set search_path = ''` -- mesma prática de 0005/0051/0055/0059/0063:
-- todo objeto referenciado no corpo é schema-qualificado (`public.
-- finance_accounts`, etc.) -- blindagem contra search_path hijacking.
-- Nenhum tipo enum é referenciado pelo NOME dentro do corpo (só literais de
-- texto atribuídos a colunas/variáveis de tipo já conhecido, que o Postgres
-- coage automaticamente sem precisar resolver o nome do tipo) -- não há
-- necessidade de `::public.<enum>` em lugar nenhum aqui.
--
-- tenant_id NUNCA vem de parâmetro -- toda leitura/escrita é escopada por
-- `(auth.jwt() ->> 'tenant_id')::uuid`, a mesma fonte usada por toda RLS
-- deste projeto (0002/0010/0017/0023) -- garante que o checkup de um
-- tenant nunca lê nem corrige dado de outro.
--
-- ORDEM DAS CORREÇÕES (mesma ordem do original, deliberada -- ver
-- comentário de cada seção abaixo): 1) merge de carteiras duplicadas, 2)
-- dedupe de parcelas duplicadas, 3) campos inconsistentes, 4) marcação de
-- parcelas vencidas -- nessa ordem porque o merge de carteiras pode mudar
-- quais parcelas existem sob qual finance_account_id antes do dedupe rodar.
--
-- DRY RUN: com `p_dry_run = true` (default), a função só DETECTA -- monta
-- o mesmo relatório (contagens + itens por categoria) sem escrever nada.
-- Com `p_dry_run = false`, detecta E corrige, dentro da mesma transação --
-- o relatório retornado tem exatamente a mesma forma nos dois casos
-- (`dry_run`/`corrections_applied` no topo dizem qual foi o modo), para o
-- frontend reaproveitar a mesma tela.
--
-- TABELAS TEMPORÁRIAS: usadas para materializar o "plano" de merge/dedupe
-- (quem é primário, quem é duplicata) uma única vez, reaproveitado tanto
-- para montar o relatório quanto para aplicar a correção -- evita calcular
-- a mesma lógica de desempate duas vezes ou divergir entre relatório e
-- correção. `drop table if exists` antes de cada `create temporary table`
-- (não só `on commit drop`): a função pode ser chamada mais de uma vez
-- dentro da MESMA transação (ex: um client chamando dry_run=true e depois
-- dry_run=false na mesma sessão/transação, como o teste de isolamento
-- desta migration faz) -- sem o drop prévio, a segunda chamada estouraria
-- "relation already exists".
--
-- STATUS "vencida não marcada" (categoria 4 do original): o original supõe
-- `status in ('previsto', 'pendente')`, mas `installment_status`
-- (0020_payment_installments.sql) NÃO TEM valor `pendente` -- confirmado
-- por leitura direta do enum (`previsto | parcial | pago | em_atraso |
-- cancelado`). `PENDENTE` no original era um "status computado"
-- (apresentação, derivado de vencimento + status persistido -- ver
-- comentário de 0020), nunca um valor gravável. A leitura mais fiel do
-- valor gravável equivalente aqui é `status in ('previsto', 'parcial')`
-- (as duas situações em que a parcela ainda está em aberto, nem paga nem
-- cancelada) -- decisão registrada aqui porque o enum realmente diverge do
-- original, não presumida.
--
-- RLS: esta migration não cria tabela nova, só uma function `security
-- definer` que opera sobre `finance_accounts`/`payment_installments`/
-- `finance_events` -- a RLS dessas 3 tabelas (0023_rls_financeiro.sql)
-- continua ativa e correta para todo acesso direto via PostgREST; esta
-- função é o único caminho que a contorna, e só para quem passar na
-- checagem interna de `tenant_role = 'admin'`.

create or replace function public.run_finance_checkup(
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

  v_wallet_report jsonb;
  v_wallet_count int;

  v_installment_dedupe_report jsonb;
  v_installment_dedupe_count int;

  v_missing_payment_date_report jsonb;
  v_missing_payment_date_count int;

  v_zero_valor_pago_report jsonb;
  v_zero_valor_pago_count int;

  v_nonzero_valor_pago_report jsonb;
  v_nonzero_valor_pago_count int;

  v_overdue_report jsonb;
  v_overdue_count int;
begin
  -- =====================================================================
  -- 0. Autenticação/autorização -- verificada AQUI DENTRO, nunca
  --    presumida de quem chamou (mesmo raciocínio de get_tenant_members,
  --    0063). Sem sessão real, sem tenant_id no claim, ou tenant_role
  --    diferente de 'admin': exceção clara, nada é lido nem escrito.
  -- =====================================================================
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'run_finance_checkup requer um usuário autenticado.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  if v_tenant_id is null then
    raise exception 'run_finance_checkup requer um tenant_id válido no token.'
      using errcode = '28000'; -- invalid_authorization_specification
  end if;

  if v_tenant_role is distinct from 'admin' then
    raise exception 'Apenas administradores do tenant podem executar o checkup financeiro.'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- =====================================================================
  -- 1. Carteiras duplicadas -- finance_accounts com o mesmo unit_id, não
  --    deletadas. Primária = mais parcelas (não deletadas); empate = mais
  --    antiga por created_at; empate residual = id (determinismo).
  -- =====================================================================

  drop table if exists tmp_wallet_merge_plan;
  create temporary table tmp_wallet_merge_plan (
    duplicate_id uuid primary key,
    primary_id uuid not null,
    unit_id uuid not null,
    installments_to_move int not null
  ) on commit drop;

  insert into tmp_wallet_merge_plan (duplicate_id, primary_id, unit_id, installments_to_move)
  with counts as (
    select
      fa.id,
      fa.unit_id,
      fa.created_at,
      (
        select count(*)
        from public.payment_installments pi
        where pi.finance_account_id = fa.id
          and pi.tenant_id = v_tenant_id
          and pi.is_deleted = false
      ) as installment_count
    from public.finance_accounts fa
    where fa.tenant_id = v_tenant_id
      and fa.is_deleted = false
  ),
  dup_units as (
    select unit_id from counts group by unit_id having count(*) > 1
  ),
  ranked as (
    select
      c.id,
      c.unit_id,
      c.installment_count,
      row_number() over (
        partition by c.unit_id
        order by c.installment_count desc, c.created_at asc, c.id asc
      ) as rn
    from counts c
    join dup_units du on du.unit_id = c.unit_id
  )
  select
    r.id as duplicate_id,
    p.id as primary_id,
    r.unit_id,
    r.installment_count
  from ranked r
  join ranked p on p.unit_id = r.unit_id and p.rn = 1
  where r.rn > 1;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'unit_id', unit_id,
      'duplicate_account_id', duplicate_id,
      'primary_account_id', primary_id,
      'installments_moved', installments_to_move
    ) order by unit_id, duplicate_id), '[]'::jsonb),
    count(*)
  into v_wallet_report, v_wallet_count
  from tmp_wallet_merge_plan;

  if not p_dry_run and v_wallet_count > 0 then
    -- Transfere parcelas e eventos das duplicatas para a primária --
    -- sujeito ao mesmo escopo de tenant_id em todo statement (defesa em
    -- profundidade -- security definer já bypassa RLS, então a checagem
    -- de tenant_id aqui é a única linha de isolamento entre tenants
    -- dentro desta função).
    update public.payment_installments pi
    set finance_account_id = m.primary_id,
        updated_by_user_id = v_user_id
    from tmp_wallet_merge_plan m
    where pi.finance_account_id = m.duplicate_id
      and pi.tenant_id = v_tenant_id;

    update public.finance_events fe
    set finance_account_id = m.primary_id
    from tmp_wallet_merge_plan m
    where fe.finance_account_id = m.duplicate_id
      and fe.tenant_id = v_tenant_id;

    update public.finance_accounts fa
    set is_deleted = true,
        deleted_at = now(),
        deleted_by_user_id = v_user_id,
        updated_by_user_id = v_user_id
    from tmp_wallet_merge_plan m
    where fa.id = m.duplicate_id
      and fa.tenant_id = v_tenant_id;

    insert into public.finance_events (
      tenant_id, finance_account_id, tipo_evento, descricao, created_by_user_id
    )
    select
      v_tenant_id,
      m.primary_id,
      'observacao',
      format(
        'Checkup financeiro: carteira duplicada %s (unidade %s) mesclada nesta carteira -- %s parcela(s) migrada(s).',
        m.duplicate_id, m.unit_id, m.installments_to_move
      ),
      v_user_id
    from tmp_wallet_merge_plan m;
  end if;

  -- =====================================================================
  -- 2. Parcelas duplicadas -- mesma chave unit_id+tipo+vencimento+
  --    valor_previsto+descricao, não deletadas, não canceladas. Primária =
  --    status PAGO tem prioridade; empate = mais antiga por created_at;
  --    empate residual = id.
  -- =====================================================================

  drop table if exists tmp_installment_dedupe_plan;
  create temporary table tmp_installment_dedupe_plan (
    duplicate_id uuid primary key,
    primary_id uuid not null,
    unit_id uuid not null,
    tipo text not null,
    vencimento date not null,
    valor_previsto numeric(14, 2) not null,
    descricao text
  ) on commit drop;

  insert into tmp_installment_dedupe_plan (
    duplicate_id, primary_id, unit_id, tipo, vencimento, valor_previsto, descricao
  )
  with candidates as (
    select
      pi.id,
      pi.unit_id,
      pi.tipo::text as tipo,
      pi.vencimento,
      pi.valor_previsto,
      pi.descricao,
      row_number() over (
        partition by pi.unit_id, pi.tipo, pi.vencimento, pi.valor_previsto, pi.descricao
        order by (pi.status = 'pago') desc, pi.created_at asc, pi.id asc
      ) as rn,
      first_value(pi.id) over (
        partition by pi.unit_id, pi.tipo, pi.vencimento, pi.valor_previsto, pi.descricao
        order by (pi.status = 'pago') desc, pi.created_at asc, pi.id asc
      ) as primary_id
    from public.payment_installments pi
    where pi.tenant_id = v_tenant_id
      and pi.is_deleted = false
      and pi.status <> 'cancelado'
  )
  select id, primary_id, unit_id, tipo, vencimento, valor_previsto, descricao
  from candidates
  where rn > 1;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'unit_id', unit_id,
      'duplicate_installment_id', duplicate_id,
      'primary_installment_id', primary_id,
      'tipo', tipo,
      'vencimento', vencimento,
      'valor_previsto', valor_previsto,
      'descricao', descricao
    ) order by unit_id, duplicate_id), '[]'::jsonb),
    count(*)
  into v_installment_dedupe_report, v_installment_dedupe_count
  from tmp_installment_dedupe_plan;

  if not p_dry_run and v_installment_dedupe_count > 0 then
    update public.payment_installments pi
    set is_deleted = true,
        deleted_at = now(),
        deleted_by_user_id = v_user_id,
        updated_by_user_id = v_user_id
    from tmp_installment_dedupe_plan m
    where pi.id = m.duplicate_id
      and pi.tenant_id = v_tenant_id;

    -- Evento gravado na carteira da parcela PRIMÁRIA (a que sobreviveu) --
    -- installment_id aponta pra ela também, já que a duplicata deixou de
    -- existir como parcela ativa (soft-deleted acima).
    insert into public.finance_events (
      tenant_id, finance_account_id, installment_id, tipo_evento, descricao, created_by_user_id
    )
    select
      v_tenant_id,
      pi_primary.finance_account_id,
      m.primary_id,
      'observacao',
      format(
        'Checkup financeiro: parcela duplicada %s removida (mantida %s) -- unidade %s, tipo %s, vencimento %s.',
        m.duplicate_id, m.primary_id, m.unit_id, m.tipo, m.vencimento
      ),
      v_user_id
    from tmp_installment_dedupe_plan m
    join public.payment_installments pi_primary
      on pi_primary.id = m.primary_id
     and pi_primary.tenant_id = v_tenant_id;
  end if;

  -- =====================================================================
  -- 3. Campos inconsistentes -- 3 checagens independentes, cada uma
  --    detectada e (se não dry run) corrigida com o MESMO predicado, para
  --    o relatório e a correção nunca divergirem.
  -- =====================================================================

  -- 3a. status=pago sem data_pagamento -> preenche com a data de
  --     atualização (ou hoje, se updated_at também faltar).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'unit_id', unit_id, 'vencimento', vencimento, 'status', status
    ) order by id), '[]'::jsonb),
    count(*)
  into v_missing_payment_date_report, v_missing_payment_date_count
  from public.payment_installments
  where tenant_id = v_tenant_id
    and is_deleted = false
    and status = 'pago'
    and data_pagamento is null;

  if not p_dry_run and v_missing_payment_date_count > 0 then
    update public.payment_installments
    set data_pagamento = coalesce(updated_at::date, current_date),
        updated_by_user_id = v_user_id
    where tenant_id = v_tenant_id
      and is_deleted = false
      and status = 'pago'
      and data_pagamento is null;
  end if;

  -- 3b. status=pago com valor_pago zerado/nulo e valor_previsto>0 ->
  --     copia valor_previsto pra valor_pago.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'unit_id', unit_id, 'vencimento', vencimento, 'valor_previsto', valor_previsto
    ) order by id), '[]'::jsonb),
    count(*)
  into v_zero_valor_pago_report, v_zero_valor_pago_count
  from public.payment_installments
  where tenant_id = v_tenant_id
    and is_deleted = false
    and status = 'pago'
    and (valor_pago is null or valor_pago = 0)
    and valor_previsto > 0;

  if not p_dry_run and v_zero_valor_pago_count > 0 then
    update public.payment_installments
    set valor_pago = valor_previsto,
        updated_by_user_id = v_user_id
    where tenant_id = v_tenant_id
      and is_deleted = false
      and status = 'pago'
      and (valor_pago is null or valor_pago = 0)
      and valor_previsto > 0;
  end if;

  -- 3c. status!=pago com valor_pago>0 -> zera valor_pago.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'unit_id', unit_id, 'vencimento', vencimento, 'status', status, 'valor_pago', valor_pago
    ) order by id), '[]'::jsonb),
    count(*)
  into v_nonzero_valor_pago_report, v_nonzero_valor_pago_count
  from public.payment_installments
  where tenant_id = v_tenant_id
    and is_deleted = false
    and status <> 'pago'
    and valor_pago > 0;

  if not p_dry_run and v_nonzero_valor_pago_count > 0 then
    update public.payment_installments
    set valor_pago = 0,
        updated_by_user_id = v_user_id
    where tenant_id = v_tenant_id
      and is_deleted = false
      and status <> 'pago'
      and valor_pago > 0;
  end if;

  -- =====================================================================
  -- 4. Parcelas vencidas não marcadas -- status ainda em aberto (previsto
  --    ou parcial -- ver nota sobre o enum no comentário de topo) com
  --    vencimento no passado -> muda status para em_atraso.
  -- =====================================================================

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'unit_id', unit_id, 'vencimento', vencimento, 'status', status
    ) order by id), '[]'::jsonb),
    count(*)
  into v_overdue_report, v_overdue_count
  from public.payment_installments
  where tenant_id = v_tenant_id
    and is_deleted = false
    and status in ('previsto', 'parcial')
    and vencimento < current_date;

  if not p_dry_run and v_overdue_count > 0 then
    update public.payment_installments
    set status = 'em_atraso',
        updated_by_user_id = v_user_id
    where tenant_id = v_tenant_id
      and is_deleted = false
      and status in ('previsto', 'parcial')
      and vencimento < current_date;
  end if;

  -- =====================================================================
  -- 5. Relatório final -- mesma forma em dry_run e em execução real, só
  --    muda o valor de `dry_run`/`corrections_applied` -- ver contrato
  --    completo no comentário de topo desta migration.
  -- =====================================================================

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'corrections_applied', not p_dry_run,
    'executed_at', now(),
    'summary', jsonb_build_object(
      'duplicate_wallets', v_wallet_count,
      'duplicate_installments', v_installment_dedupe_count,
      'missing_payment_date', v_missing_payment_date_count,
      'zero_valor_pago_on_paid', v_zero_valor_pago_count,
      'nonzero_valor_pago_on_unpaid', v_nonzero_valor_pago_count,
      'overdue_not_marked', v_overdue_count
    ),
    'details', jsonb_build_object(
      'duplicate_wallets', v_wallet_report,
      'duplicate_installments', v_installment_dedupe_report,
      'missing_payment_date', v_missing_payment_date_report,
      'zero_valor_pago_on_paid', v_zero_valor_pago_report,
      'nonzero_valor_pago_on_unpaid', v_nonzero_valor_pago_report,
      'overdue_not_marked', v_overdue_report
    )
  );
end;
$$;

comment on function public.run_finance_checkup(boolean) is
  'Detecta (e, se p_dry_run=false, corrige) 4 classes de inconsistência em '
  'finance_accounts/payment_installments: carteiras duplicadas por unidade, '
  'parcelas duplicadas por chave (unidade+tipo+vencimento+valor+descrição), '
  'campos inconsistentes (pago sem data_pagamento, pago com valor_pago '
  'zerado, não-pago com valor_pago>0) e parcelas vencidas ainda marcadas '
  'como previsto/parcial. SECURITY DEFINER: roda como dono (postgres), '
  'bypassando a RLS de admin/comercial/administrativo de '
  '0023_rls_financeiro.sql -- a autorização real é a checagem interna de '
  'tenant_role = admin (não confia em quem chamou já ser admin). Tudo numa '
  'única transação atômica -- qualquer falha no meio desfaz TODAS as '
  'correções já aplicadas nesta chamada. tenant_id sempre de '
  '(auth.jwt() ->> ''tenant_id'')::uuid, nunca de parâmetro. Retorna jsonb '
  '{dry_run, corrections_applied, executed_at, summary: {6 contagens}, '
  'details: {6 listas de itens}} -- mesma forma em dry run e execução real.';

-- =======================================================================
-- Grants: EXECUTE só para `authenticated` -- a checagem de admin é DENTRO
-- da função (mesmo padrão já usado em get_tenant_members/
-- accept_pending_invite, 0063), não no grant. Qualquer usuário autenticado
-- pode CHAMAR a função; só quem for tenant_role='admin' do próprio tenant
-- efetivamente consegue usá-la (todo mundo mais recebe exceção 42501,
-- nada é lido nem escrito). `anon` nunca -- não há fluxo de checkup
-- financeiro sem login, coberto pelo revoke de PUBLIC.
-- =======================================================================

grant execute
  on function public.run_finance_checkup(boolean)
  to authenticated;

revoke execute
  on function public.run_finance_checkup(boolean)
  from public, anon;

-- ---------------------------------------------------------------------
-- RLS: não aplicável -- nenhuma tabela nova, só uma function security
-- definer operando sobre finance_accounts/payment_installments/
-- finance_events, cuja RLS (0023_rls_financeiro.sql) continua sendo a
-- única linha de autorização para todo acesso FORA desta função. Nada
-- pendente aqui.
-- ---------------------------------------------------------------------
