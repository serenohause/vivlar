-- 0018_update_deal_stage_rpc.sql
-- RPC transacional para mudanca de estagio comercial de um `deal` --
-- corrige achado de auditoria de seguranca pre-deploy do modulo CRM:
-- `useUpdateDealStage` (src/features/deals/hooks.ts, linhas ~127-207)
-- fazia 3-4 escritas sequenciais via client Supabase (update deals, update
-- units.status, insert status_transitions, insert activities quando
-- vendido) sem nenhuma garantia de atomicidade entre elas -- uma falha no
-- meio (rede, RLS, constraint) podia deixar o negocio marcado como
-- "vendido" com a unidade ainda "reservada", por exemplo. Esta migration
-- move a mesma sequencia de escritas para dentro de uma unica function
-- `plpgsql`, que e atomica por padrao no Postgres (sem precisar de
-- `begin`/`commit` explicito) -- se qualquer statement no meio levantar
-- excecao, a funcao inteira e desfeita, sem deixar `deals` e `units`/
-- `status_transitions`/`activities` inconsistentes entre si.
--
-- SEM SECURITY DEFINER (deliberado, diferente de `create_tenant_with_admin`
-- em 0005): la havia o problema do "ovo e a galinha" de criar o primeiro
-- tenant sem nenhuma policy de INSERT liberada ainda. Aqui nao existe esse
-- problema -- quem chama ja tem uma sessao autenticada com
-- `tenant_id`/`tenant_role` no JWT (0002/0006), entao cada UPDATE/INSERT
-- dentro desta funcao continua sujeito as RLS policies ja existentes
-- (`units_update_tenant_team` em 0010_rls_catalog.sql;
-- `deals_update_tenant_team`, `status_transitions_insert_tenant_team`,
-- `activities_insert_tenant_team` em 0017_rls_crm.sql), rodando com os
-- privilegios de quem chamou -- `security invoker`, o padrao do Postgres
-- quando `security definer` nao e declarado (nada precisa ser escrito
-- explicitamente para isso). Consequencia pratica: um usuario cujo
-- `tenant_role` nao tem policy de UPDATE/INSERT em alguma dessas tabelas
-- (ex: `cliente`/`investidor`, sem nenhuma policy em 0017) continua sem
-- conseguir usar esta funcao para nada -- a RLS interna e que barra, nao
-- uma checagem de papel feita aqui dentro.
--
-- tenant_id NUNCA vem de parametro nenhum -- para os INSERTs em
-- `status_transitions`/`activities` (tenant_id not null), esta funcao le
-- `(auth.jwt() ->> 'tenant_id')::uuid`, exatamente a mesma fonte ja usada
-- por toda policy de RLS deste projeto (0002/0010/0017) -- nao uma fonte
-- inventada aqui. Os UPDATEs em `deals`/`units` nao precisam disso: o
-- isolamento deles vem da clausula USING/WITH CHECK das proprias policies
-- de UPDATE, que ja compara `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
-- internamente.
--
-- Mapa de reflexo em `units.status`: copia 1:1 de
-- `UNIT_STATUS_BY_SALES_STAGE` em `src/features/deals/constants.ts`
-- (lead/qualificado -> disponivel, reservado/proposta -> reservada,
-- vendido -> vendida, perdido/distratado -> disponivel), como um `case`
-- dentro do SQL.
--
-- `lost_reason`/`distrato_reason` usam a nota ja normalizada (trim +
-- string vazia vira NULL), fiel ao `trimmedNote = note?.trim() || null` do
-- hook original -- nao o `p_note` cru.
--
-- RLS: esta migration NAO cria tabela nova, so uma function que opera
-- sobre `deals`/`units`/`status_transitions`/`activities` -- a RLS dessas
-- 4 tabelas ja existe (0010_rls_catalog.sql, 0017_rls_crm.sql) e continua
-- sendo a unica linha de autorizacao, ja que a funcao roda como quem
-- chamou (sem privilegio elevado). Nada a configurar aqui.

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

  -- 4. Atualiza o deal -- UPDATE sujeito a `deals_update_tenant_team`
  --    (0017). Campos condicionais mantêm o valor atual quando o novo
  --    estagio nao se aplica a eles (ex: sold_at so muda indo para
  --    'vendido').
  update public.deals
  set
    sales_stage = p_to_stage,
    is_active = not v_is_exit,
    updated_by_user_id = auth.uid(),
    sold_at = case when p_to_stage = 'vendido' then now() else sold_at end,
    lost_reason = case when p_to_stage = 'perdido' then v_trimmed_note else lost_reason end,
    distrato_at = case when p_to_stage = 'distratado' then now() else distrato_at end,
    distrato_by_user_id = case when p_to_stage = 'distratado' then auth.uid() else distrato_by_user_id end,
    distrato_reason = case when p_to_stage = 'distratado' then v_trimmed_note else distrato_reason end
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

  return v_updated_deal;
end;
$$;

comment on function public.update_deal_stage(uuid, deal_sales_stage, text) is
  'Muda o estagio comercial de um deal e reflete units.status, '
  'status_transitions e (quando vendido) activities numa unica transacao '
  'atomica -- corrige achado de auditoria pre-deploy sobre escritas '
  'sequenciais sem atomicidade em useUpdateDealStage. SECURITY INVOKER '
  '(padrao, sem security definer): cada statement interno continua sujeito '
  'as RLS policies de deals/units/status_transitions/activities '
  '(0010_rls_catalog.sql, 0017_rls_crm.sql) com os privilegios de quem '
  'chamou. tenant_id dos INSERTs vem de (auth.jwt() ->> ''tenant_id'')::uuid, '
  'nunca de parametro.';

-- Grants explicitos, nada implicito (mesmo padrao de seguranca ja usado em
-- create_tenant_with_admin, 0005): funcoes nascem com EXECUTE liberado
-- para PUBLIC por padrao no Postgres -- revogamos isso e concedemos so
-- para `authenticated`. `anon` nunca deve poder chamar isto (nao ha fluxo
-- de CRM sem login) e fica coberto pelo revoke de PUBLIC (remove o grant
-- implicito herdado por qualquer role, incluindo anon).
grant execute
  on function public.update_deal_stage(uuid, deal_sales_stage, text)
  to authenticated;

revoke execute
  on function public.update_deal_stage(uuid, deal_sales_stage, text)
  from public, anon;

-- ---------------------------------------------------------------------
-- RLS: nao aplicavel a esta migration -- nenhuma tabela nova foi criada,
-- so uma function operando sobre RLS ja existente. Nada pendente aqui.
-- ---------------------------------------------------------------------
