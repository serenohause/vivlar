-- 0028_update_deal_stage_commission.sql
-- Estende `public.update_deal_stage` (0018) para criar a `commission`
-- automatica e preencher `deals.commission_rate`/`commission_value` quando
-- um negocio vira VENDIDO -- debito tecnico documentado em
-- docs/ARCHITECTURE.md (modulo CRM): o original
-- (`original-project/src/pages/CRM.jsx`, `updateStageMutation`, linhas
-- ~300-355) faz isso via 2 escritas sequenciais fora de transacao; aqui
-- entra na mesma function atomica ja usada por deals/units/status_transitions/
-- activities.
--
-- CORRECAO AO ESCOPO PEDIDO: o pedido original desta migration presumia que
-- `commission_rate`/`commission_value` deveriam ser preenchidos "sempre que
-- o negocio tem broker_id, nao so ao vender". Lendo `updateStageMutation`
-- por completo (nao so o trecho de `Commission.create` ja citado), o
-- original faz o oposto -- so calcula e grava esses 2 campos quando
-- `stage === "VENDIDO"` (e a unidade tem `list_price`), nunca em outra
-- transicao de estagio, e o calculo NEM depende de `broker_id` estar
-- preenchido (`broker?.commission_rate || 0.05` -- sem broker, usa 0.05
-- mesmo assim). So a CRIACAO da `Commission` (bloco seguinte no original) e
-- que exige `deal.broker_id` preenchido. Replicado fielmente aqui: ver
-- passo 3b (calculo, gatilho = so 'vendido') e passo 8 (insert, gatilho =
-- 'vendido' + broker_id).
--
-- Unica divergencia deliberada do calculo em si: o fallback de taxa usa
-- `coalesce(broker.commission_rate, 0.05)` (so cai pra 0.05 quando NULL),
-- nao a checagem "falsy" do JS original (`broker?.commission_rate || 0.05`,
-- que trataria uma taxa explicita de 0 como ausente e cairia pra 0.05
-- tambem) -- taxa 0 explicita e um valor de negocio valido, nao um caso de
-- "sem broker".
--
-- `commission_rate`/`commission_value` sao mantidos com o valor anterior
-- (nao apagados/zerados) em qualquer transicao que nao seja para 'vendido'
-- ou onde a unidade nao tenha `list_price` -- mesma logica do `updateData`
-- parcial do original (so inclui essas chaves no payload quando a condicao
-- bate; caso contrario, o campo simplesmente nao muda).
--
-- Indice unico parcial `commissions_tenant_id_deal_id_uidx` (0024): um deal
-- que sai de 'vendido' e volta (ou reenvia a mesma transicao) tentaria
-- inserir uma segunda linha ativa para o mesmo (tenant_id, deal_id).
-- Tratado com `on conflict (tenant_id, deal_id) where not is_deleted do
-- nothing` -- mesmo efeito pratico do `if (existingCommissions.length ===
-- 0)` do original (`Commission.filter({ deal_id: id })` antes do create),
-- so que atomico dentro da mesma transacao em vez de 2 chamadas
-- sequenciais.
--
-- SEM SECURITY DEFINER: mesmo padrao de 0018 -- o INSERT em `commissions`
-- roda com o privilegio de quem chamou, sujeito a
-- `commissions_insert_tenant_team` (0027_rls_comissoes.sql, papeis
-- admin/comercial/administrativo -- identicos aos ja exigidos por
-- `deals_update_tenant_team`/`units_update_tenant_team`, sem risco de a
-- funcao falhar no meio por um papel ter acesso a uma tabela e nao a
-- outra).
--
-- RLS: esta migration NAO cria tabela nova, so estende a function -- a RLS
-- de `commissions` ja existe (0027_rls_comissoes.sql). Nada pendente aqui.

create or replace function public.update_deal_stage(
  p_deal_id uuid,
  p_to_stage deal_sales_stage,
  p_note text default null
)
returns public.deals
language plpgsql
as $$
declare
  v_deal public.deals;
  v_updated_deal public.deals;
  v_from_stage deal_sales_stage;
  v_unit_id uuid;
  v_client_id uuid;
  v_is_exit boolean;
  v_tenant_id uuid;
  v_trimmed_note text;
  v_unit_status unit_status;
  v_unit_list_price numeric(14, 2);
  v_broker_commission_rate numeric(6, 4);
  v_commission_rate numeric(6, 4);
  v_commission_value numeric(14, 2);
begin
  -- 1. Busca o deal atual -- SELECT sujeito a `deals_select_tenant_team`
  --    (0017): 0 linhas tanto se o id nao existe quanto se a RLS bloqueou
  --    por tenant/papel errado -- mesma mensagem para os dois casos, de
  --    proposito (nao vaza se o id existe em outro tenant).
  select * into v_deal from public.deals where id = p_deal_id;

  if not found then
    raise exception 'Negócio não encontrado ou sem permissão.';
  end if;

  -- 2. Estado corrente, usado no log de transicao e no reflexo de unit.
  v_from_stage := v_deal.sales_stage;
  v_unit_id := v_deal.unit_id;
  v_client_id := v_deal.client_id;

  -- 3. Estagios "de saida" do funil.
  v_is_exit := p_to_stage in ('perdido', 'distratado');

  v_trimmed_note := nullif(btrim(p_note), '');
  v_tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;

  -- 3b. Preco de lista da unidade e taxa de comissao -- so calculado ao
  --     vender (gatilho identico ao `updateStageMutation` do original: ver
  --     nota no topo do arquivo). Usado tanto para preencher
  --     deals.commission_rate/commission_value (abaixo) quanto para criar a
  --     commission (passo 8). SELECT de units sujeito a
  --     `units_select_tenant_team` (0010); SELECT de brokers sujeito a
  --     `brokers_select_tenant_team` (0017) -- se a RLS ocultar o broker
  --     (nao deveria, mesmo tenant), v_broker_commission_rate fica NULL e o
  --     coalesce cai pra 0.05, igual ao original sem broker encontrado.
  if p_to_stage = 'vendido' and v_unit_id is not null then
    select list_price into v_unit_list_price
      from public.units
      where id = v_unit_id;
  end if;

  if v_unit_list_price is not null then
    select commission_rate into v_broker_commission_rate
      from public.brokers
      where id = v_deal.broker_id;

    v_commission_rate := coalesce(v_broker_commission_rate, 0.05);
    v_commission_value := v_unit_list_price * v_commission_rate;
  end if;

  -- 4. Atualiza o deal -- UPDATE sujeito a `deals_update_tenant_team`
  --    (0017). Campos condicionais mantêm o valor atual quando o novo
  --    estagio nao se aplica a eles (ex: sold_at so muda indo para
  --    'vendido'). commission_rate/commission_value seguem o mesmo padrao:
  --    so mudam quando v_commission_rate/v_commission_value foram
  --    calculados no passo 3b (vendido + unidade com list_price).
  update public.deals
  set
    sales_stage = p_to_stage,
    is_active = not v_is_exit,
    updated_by_user_id = auth.uid(),
    sold_at = case when p_to_stage = 'vendido' then now() else sold_at end,
    lost_reason = case when p_to_stage = 'perdido' then v_trimmed_note else lost_reason end,
    distrato_at = case when p_to_stage = 'distratado' then now() else distrato_at end,
    distrato_by_user_id = case when p_to_stage = 'distratado' then auth.uid() else distrato_by_user_id end,
    distrato_reason = case when p_to_stage = 'distratado' then v_trimmed_note else distrato_reason end,
    commission_rate = coalesce(v_commission_rate, commission_rate),
    commission_value = coalesce(v_commission_value, commission_value)
  where id = p_deal_id
  returning * into v_updated_deal;

  -- 5. Reflexo em units.status -- UPDATE sujeito a `units_update_tenant_
  --    team` (0010). Mapa identico a UNIT_STATUS_BY_SALES_STAGE
  --    (src/features/deals/constants.ts).
  if v_unit_id is not null then
    v_unit_status := case p_to_stage
      when 'lead' then 'disponivel'
      when 'qualificado' then 'disponivel'
      when 'reservado' then 'reservada'
      when 'proposta' then 'reservada'
      when 'vendido' then 'vendida'
      when 'perdido' then 'disponivel'
      when 'distratado' then 'disponivel'
    end;

    update public.units
    set
      status = v_unit_status,
      updated_by_user_id = auth.uid()
    where id = v_unit_id;
  end if;

  -- 6. Log de transicao -- INSERT sujeito a
  --    `status_transitions_insert_tenant_team` (0017).
  insert into public.status_transitions (
    tenant_id, unit_id, deal_id, from_status, to_status, transition_type, note, created_by_user_id
  ) values (
    v_tenant_id, v_unit_id, p_deal_id, v_from_stage, p_to_stage, 'comercial', v_trimmed_note, auth.uid()
  );

  -- 7. Activity so ao marcar como vendido -- INSERT sujeito a
  --    `activities_insert_tenant_team` (0017).
  if p_to_stage = 'vendido' then
    insert into public.activities (
      tenant_id, title, type, status, description, deal_id, client_id, unit_id, created_by_user_id
    ) values (
      v_tenant_id, 'Negócio marcado como vendido', 'outro', 'concluida', v_trimmed_note, p_deal_id, v_client_id, v_unit_id, auth.uid()
    );
  end if;

  -- 8. Comissao automatica ao vender -- INSERT sujeito a
  --    `commissions_insert_tenant_team` (0027). So quando ha broker_id no
  --    deal e a unidade tem list_price (mesmo gate do bloco
  --    `Commission.create` do original). `on conflict ... do nothing`
  --    evita erro/duplicata se o deal ja tem uma commission ativa para o
  --    mesmo (tenant_id, deal_id) -- ver nota no topo do arquivo.
  if p_to_stage = 'vendido' and v_deal.broker_id is not null and v_unit_list_price is not null then
    insert into public.commissions (
      tenant_id, broker_id, deal_id, unit_id, project_id,
      base_value, gross_value, rate, status, due_date, created_by_user_id
    ) values (
      v_tenant_id, v_deal.broker_id, p_deal_id, v_unit_id, v_deal.project_id,
      v_commission_value, v_commission_value, v_commission_rate, 'a_pagar',
      (current_date + interval '7 days')::date, auth.uid()
    )
    on conflict (tenant_id, deal_id) where not is_deleted do nothing;
  end if;

  return v_updated_deal;
end;
$$;

comment on function public.update_deal_stage(uuid, deal_sales_stage, text) is
  'Muda o estagio comercial de um deal e reflete units.status, '
  'status_transitions, (quando vendido) activities e (quando vendido + '
  'broker_id + unit.list_price) commissions numa unica transacao atomica -- '
  'corrige achado de auditoria pre-deploy sobre escritas sequenciais sem '
  'atomicidade em useUpdateDealStage/CRM.jsx updateStageMutation. SECURITY '
  'INVOKER (padrao, sem security definer): cada statement interno continua '
  'sujeito as RLS policies de deals/units/status_transitions/activities/'
  'commissions (0010, 0017, 0027) com os privilegios de quem chamou. '
  'tenant_id dos INSERTs vem de (auth.jwt() ->> ''tenant_id'')::uuid, nunca '
  'de parametro. deals.commission_rate/commission_value so mudam ao vender '
  '(coalesce(broker.commission_rate, 0.05) * unit.list_price), preservados '
  'em qualquer outra transicao -- ver 0028_update_deal_stage_commission.sql '
  'para a correcao de escopo em relacao ao pedido original.';

-- Grants ja concedidos em 0018 (create or replace function preserva grants
-- existentes na mesma assinatura -- nao precisa reconceder).

-- ---------------------------------------------------------------------
-- RLS: nao aplicavel a esta migration -- nenhuma tabela nova foi criada,
-- so a function foi estendida. RLS de commissions ja existe desde
-- 0027_rls_comissoes.sql. Nada pendente aqui.
-- ---------------------------------------------------------------------
