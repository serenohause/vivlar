-- 0029_commission_transactional_rpcs.sql
-- RPCs transacionais para o modulo de Comissoes -- corrige achado de
-- auditoria de seguranca pre-deploy (ALTO): `src/features/commissions/
-- hooks.ts` (4 mutations -- `useCreateAdjustment`, `useCreatePayment`,
-- `useUpdatePayment`, `useSoftDeletePayment`) recalcula `commissions.saldo`/
-- `total_pago`/`gross_value`/`status` em 2 escritas sequenciais sem
-- transacao (a linha de detalhe em `commission_adjustments`/
-- `commission_payments` + o UPDATE em `commissions`). Diferente do caso ja
-- aceito em `finance_accounts`/`payment_installments` (onde a segunda
-- escrita era so um log de auditoria), aqui a segunda escrita e o valor
-- financeiro real pago ao corretor -- uma falha entre as 2 chamadas pode
-- deixar a comissao com saldo/total_pago desatualizado (pagamento a maior
-- ou a menor). Mesmo padrao ja usado em `update_deal_stage`
-- (0018_update_deal_stage_rpc.sql, estendido em
-- 0028_update_deal_stage_commission.sql): move a sequencia de escritas para
-- dentro de uma unica function `plpgsql`, atomica por padrao no Postgres --
-- se qualquer statement no meio levantar excecao, a funcao inteira e
-- desfeita.
--
-- SEM SECURITY DEFINER (deliberado, mesmo raciocinio de 0018): quem chama
-- ja tem sessao autenticada com `tenant_id`/`tenant_role` no JWT
-- (0002/0006), entao cada SELECT/INSERT/UPDATE dentro destas 4 funcoes
-- continua sujeito as RLS policies ja existentes
-- (`commissions_select_tenant_team`/`commissions_update_tenant_team`,
-- `commission_adjustments_insert_tenant_team`,
-- `commission_payments_insert_tenant_team`/
-- `commission_payments_update_tenant_team`, todas em
-- 0027_rls_comissoes.sql), rodando com os privilegios de quem chamou --
-- `security invoker`, o padrao do Postgres quando `security definer` nao e
-- declarado. Consequencia pratica: um usuario cujo `tenant_role` nao tem
-- policy nessas tabelas (`cliente`/`investidor`, sem nenhuma policy em
-- 0027) continua sem conseguir usar nenhuma destas 4 funcoes -- a RLS
-- interna e que barra, nao uma checagem de papel feita aqui dentro.
--
-- tenant_id NUNCA vem de parametro -- para os INSERTs em
-- `commission_adjustments`/`commission_payments` (tenant_id not null), as
-- funcoes leem `(auth.jwt() ->> 'tenant_id')::uuid`, exatamente a mesma
-- fonte ja usada por toda policy de RLS deste projeto (0002/0010/0017/
-- 0027) -- nao uma fonte inventada aqui. Os UPDATEs em `commissions`/
-- `commission_payments` nao precisam disso: o isolamento deles vem da
-- clausula USING/WITH CHECK das proprias policies de UPDATE, que ja
-- comparam `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid` internamente.
--
-- Logica de calculo replicada 1:1 de `src/features/commissions/hooks.ts`
-- (linhas ~145-361, ver comentario de cada function abaixo) e do sinal de
-- `COMMISSION_ADJUSTMENT_CONFIG` em `src/features/commissions/constants.ts`
-- (desconto = -1, acrescimo/bonus = +1) -- nada foi inventado aqui, so
-- portado de JS/TS para plpgsql.
--
-- `formatCurrency` (`src/features/commissions/constants.ts`) NAO e
-- replicada em SQL -- as mensagens de erro de saldo excedido levam o numero
-- cru (`numeric`), a formatacao "R$ 0,00" fica a cargo do frontend ao
-- tratar o erro (fora de escopo desta migration, tarefa separada de trocar
-- as chamadas do hook para `supabase.rpc(...)`).
--
-- RLS: esta migration NAO cria tabela nova, so functions que operam sobre
-- `commissions`/`commission_adjustments`/`commission_payments` -- a RLS
-- dessas 3 tabelas ja existe (0027_rls_comissoes.sql) e continua sendo a
-- unica linha de autorizacao, ja que as funcoes rodam como quem chamou (sem
-- privilegio elevado). Nada a configurar aqui.

-- =======================================================================
-- 1. create_commission_adjustment
--    Traducao de `useCreateAdjustment` (hooks.ts linhas ~145-189): insere
--    o ajuste e recalcula commissions.gross_value/saldo a partir da linha
--    fresca de `commissions` lida dentro da mesma transacao. Bloqueia se
--    `is_finalizada`.
-- =======================================================================

create or replace function public.create_commission_adjustment(
  p_commission_id uuid,
  p_type commission_adjustment_type,
  p_amount numeric,
  p_reason text,
  p_attachment_url text default null,
  p_attachment_name text default null
)
returns public.commission_adjustments
language plpgsql
as $$
declare
  v_commission public.commissions;
  v_adjustment public.commission_adjustments;
  v_tenant_id uuid;
  v_signed_amount numeric(14, 2);
  v_current_total numeric(14, 2);
  v_new_total numeric(14, 2);
  v_new_saldo numeric(14, 2);
begin
  -- 1. Busca a comissao atual -- SELECT sujeito a
  --    `commissions_select_tenant_team` (0027): 0 linhas tanto se o id nao
  --    existe quanto se a RLS bloqueou por tenant/papel errado -- mesma
  --    mensagem para os dois casos, de proposito.
  select * into v_commission from public.commissions where id = p_commission_id;

  if not found then
    raise exception 'Comissão não encontrada ou sem permissão.';
  end if;

  -- 2. Trava: comissao finalizada nao aceita novos ajustes (fiel a
  --    `if (commission.is_finalizada) throw ...` do hook original).
  if v_commission.is_finalizada then
    raise exception 'Esta comissão está finalizada e não aceita novos ajustes.';
  end if;

  v_tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;

  -- 3. Insere o ajuste -- INSERT sujeito a
  --    `commission_adjustments_insert_tenant_team` (0027).
  insert into public.commission_adjustments (
    tenant_id,
    commission_id,
    type,
    amount,
    reason,
    attachment_url,
    attachment_name,
    attachment_uploaded_at,
    attachment_uploaded_by_user_id,
    created_by_user_id
  ) values (
    v_tenant_id,
    p_commission_id,
    p_type,
    p_amount,
    p_reason,
    p_attachment_url,
    p_attachment_name,
    case when p_attachment_url is not null then now() else null end,
    case when p_attachment_url is not null then auth.uid() else null end,
    auth.uid()
  )
  returning * into v_adjustment;

  -- 4. Recalcula gross_value/saldo -- sinal identico a
  --    COMMISSION_ADJUSTMENT_CONFIG (constants.ts): desconto = -1,
  --    acrescimo/bonus = +1.
  v_signed_amount := p_amount * case p_type when 'desconto' then -1 else 1 end;
  v_current_total := coalesce(v_commission.gross_value, v_commission.base_value);
  v_new_total := v_current_total + v_signed_amount;
  v_new_saldo := v_new_total - v_commission.total_pago;

  -- 5. Grava o recalculo -- UPDATE sujeito a `commissions_update_tenant_
  --    team` (0027).
  update public.commissions
  set
    gross_value = v_new_total,
    saldo = v_new_saldo,
    updated_by_user_id = auth.uid()
  where id = p_commission_id;

  return v_adjustment;
end;
$$;

comment on function public.create_commission_adjustment(uuid, commission_adjustment_type, numeric, text, text, text) is
  'Insere um ajuste (desconto/acrescimo/bonus) em commission_adjustments e '
  'recalcula commissions.gross_value/saldo numa unica transacao atomica -- '
  'corrige achado de auditoria pre-deploy sobre escritas sequenciais sem '
  'atomicidade em useCreateAdjustment (src/features/commissions/hooks.ts). '
  'SECURITY INVOKER (padrao, sem security definer): cada statement interno '
  'continua sujeito as RLS policies de commissions/commission_adjustments '
  '(0027_rls_comissoes.sql) com os privilegios de quem chamou. tenant_id do '
  'INSERT vem de (auth.jwt() ->> ''tenant_id'')::uuid, nunca de parametro.';

-- =======================================================================
-- 2. register_commission_payment
--    Traducao de `useCreatePayment` (hooks.ts linhas ~198-250): insere o
--    pagamento e recalcula commissions.total_pago/saldo/status ('pago' se
--    o saldo zerar, mantem o status atual caso contrario). Bloqueia se
--    `is_finalizada` ou se o valor exceder o saldo disponivel (tolerancia
--    de 1 centavo, fiel ao original).
-- =======================================================================

create or replace function public.register_commission_payment(
  p_commission_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_comprovante_url text default null,
  p_observacoes text default null
)
returns public.commission_payments
language plpgsql
as $$
declare
  v_commission public.commissions;
  v_payment public.commission_payments;
  v_tenant_id uuid;
  v_total_comissao numeric(14, 2);
  v_saldo_disponivel numeric(14, 2);
  v_new_total_pago numeric(14, 2);
  v_new_saldo numeric(14, 2);
  v_new_status commission_status;
begin
  -- 1. Busca a comissao atual -- SELECT sujeito a
  --    `commissions_select_tenant_team` (0027).
  select * into v_commission from public.commissions where id = p_commission_id;

  if not found then
    raise exception 'Comissão não encontrada ou sem permissão.';
  end if;

  -- 2. Trava: comissao finalizada nao aceita novos pagamentos.
  if v_commission.is_finalizada then
    raise exception 'Esta comissão está finalizada e não aceita novos pagamentos.';
  end if;

  -- 3. Valida saldo disponivel -- fiel a `if (input.valor_pago >
  --    saldoDisponivel + 0.01) throw ...` do hook original. Mensagem leva
  --    o numero cru; formatCurrency fica a cargo do frontend.
  v_total_comissao := coalesce(v_commission.gross_value, v_commission.base_value);
  v_saldo_disponivel := v_total_comissao - v_commission.total_pago;

  if p_valor_pago > v_saldo_disponivel + 0.01 then
    raise exception 'Valor informado excede o saldo disponível da comissão. Saldo atual: %', v_saldo_disponivel;
  end if;

  v_tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;

  -- 4. Insere o pagamento -- INSERT sujeito a
  --    `commission_payments_insert_tenant_team` (0027).
  insert into public.commission_payments (
    tenant_id,
    commission_id,
    valor_pago,
    data_pagamento,
    payment_method,
    payment_reference,
    comprovante_url,
    observacoes,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_tenant_id,
    p_commission_id,
    p_valor_pago,
    p_data_pagamento,
    p_payment_method,
    p_payment_reference,
    p_comprovante_url,
    p_observacoes,
    auth.uid(),
    auth.uid()
  )
  returning * into v_payment;

  -- 5. Recalcula total_pago/saldo/status -- so forca 'pago' quando o saldo
  --    zera; caso contrario mantem o status corrente (fiel a
  --    `newSaldo <= 0.01 ? 'pago' : commission.status` do original).
  v_new_total_pago := v_commission.total_pago + p_valor_pago;
  v_new_saldo := v_total_comissao - v_new_total_pago;
  v_new_status := case when v_new_saldo <= 0.01 then 'pago'::commission_status else v_commission.status end;

  -- 6. Grava o recalculo -- UPDATE sujeito a `commissions_update_tenant_
  --    team` (0027).
  update public.commissions
  set
    total_pago = v_new_total_pago,
    saldo = v_new_saldo,
    status = v_new_status,
    updated_by_user_id = auth.uid()
  where id = p_commission_id;

  return v_payment;
end;
$$;

comment on function public.register_commission_payment(uuid, numeric, date, text, text, text, text) is
  'Insere um pagamento em commission_payments e recalcula '
  'commissions.total_pago/saldo/status numa unica transacao atomica -- '
  'corrige achado de auditoria pre-deploy sobre escritas sequenciais sem '
  'atomicidade em useCreatePayment (src/features/commissions/hooks.ts). '
  'SECURITY INVOKER (padrao, sem security definer): cada statement interno '
  'continua sujeito as RLS policies de commissions/commission_payments '
  '(0027_rls_comissoes.sql) com os privilegios de quem chamou. tenant_id do '
  'INSERT vem de (auth.jwt() ->> ''tenant_id'')::uuid, nunca de parametro. '
  'Bloqueia se is_finalizada ou se p_valor_pago exceder o saldo disponivel '
  '(tolerancia de 1 centavo, fiel ao original).';

-- =======================================================================
-- 3. update_commission_payment
--    Traducao de `useUpdatePayment` (hooks.ts linhas ~259-309): edita o
--    pagamento e recalcula commissions.total_pago/saldo/status. Diferente
--    de `register_commission_payment`, o novo status sempre recai para
--    'a_pagar' quando o saldo nao zera (fiel a `newSaldo <= 0.01 ? 'pago' :
--    'a_pagar'` do original, nao preserva o status anterior). O saldo
--    disponivel devolve o valor antigo do pagamento antes de validar o
--    novo.
-- =======================================================================

create or replace function public.update_commission_payment(
  p_payment_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_payment_method text default null,
  p_payment_reference text default null,
  p_comprovante_url text default null,
  p_observacoes text default null
)
returns public.commission_payments
language plpgsql
as $$
declare
  v_old_payment public.commission_payments;
  v_commission public.commissions;
  v_payment public.commission_payments;
  v_total_comissao numeric(14, 2);
  v_saldo_disponivel numeric(14, 2);
  v_new_total_pago numeric(14, 2);
  v_new_saldo numeric(14, 2);
  v_new_status commission_status;
begin
  -- 1. Busca o pagamento atual -- SELECT sujeito a
  --    `commission_payments_select_tenant_team` (0027).
  select * into v_old_payment from public.commission_payments where id = p_payment_id;

  if not found then
    raise exception 'Pagamento não encontrado ou sem permissão.';
  end if;

  -- 2. Busca a comissao vinculada -- SELECT sujeito a
  --    `commissions_select_tenant_team` (0027).
  select * into v_commission from public.commissions where id = v_old_payment.commission_id;

  if not found then
    raise exception 'Comissão não encontrada ou sem permissão.';
  end if;

  -- 3. Trava: comissao finalizada nao aceita edicao de pagamentos.
  if v_commission.is_finalizada then
    raise exception 'Esta comissão está finalizada e não aceita edição de pagamentos.';
  end if;

  -- 4. Valida saldo disponivel -- devolve o valor antigo do pagamento
  --    antes de checar o novo (fiel a `saldoDisponivel = totalComissao -
  --    commission.total_pago + oldPayment.valor_pago` do original).
  v_total_comissao := coalesce(v_commission.gross_value, v_commission.base_value);
  v_saldo_disponivel := v_total_comissao - v_commission.total_pago + v_old_payment.valor_pago;

  if p_valor_pago > v_saldo_disponivel + 0.01 then
    raise exception 'Valor informado excede o saldo disponível. Saldo disponível: %', v_saldo_disponivel;
  end if;

  -- 5. Atualiza o pagamento -- UPDATE sujeito a
  --    `commission_payments_update_tenant_team` (0027).
  update public.commission_payments
  set
    valor_pago = p_valor_pago,
    data_pagamento = p_data_pagamento,
    payment_method = p_payment_method,
    payment_reference = p_payment_reference,
    comprovante_url = p_comprovante_url,
    observacoes = p_observacoes,
    updated_by_user_id = auth.uid()
  where id = p_payment_id
  returning * into v_payment;

  -- 6. Recalcula total_pago/saldo/status -- SEMPRE recai para 'a_pagar' se
  --    o saldo nao zerar (fiel a `newSaldo <= 0.01 ? 'pago' : 'a_pagar'` do
  --    original, diferente de register_commission_payment).
  v_new_total_pago := v_commission.total_pago - v_old_payment.valor_pago + p_valor_pago;
  v_new_saldo := v_total_comissao - v_new_total_pago;
  v_new_status := case when v_new_saldo <= 0.01 then 'pago'::commission_status else 'a_pagar'::commission_status end;

  -- 7. Grava o recalculo -- UPDATE sujeito a `commissions_update_tenant_
  --    team` (0027).
  update public.commissions
  set
    total_pago = v_new_total_pago,
    saldo = v_new_saldo,
    status = v_new_status,
    updated_by_user_id = auth.uid()
  where id = v_old_payment.commission_id;

  return v_payment;
end;
$$;

comment on function public.update_commission_payment(uuid, numeric, date, text, text, text, text) is
  'Edita um pagamento em commission_payments e recalcula '
  'commissions.total_pago/saldo/status numa unica transacao atomica -- '
  'corrige achado de auditoria pre-deploy sobre escritas sequenciais sem '
  'atomicidade em useUpdatePayment (src/features/commissions/hooks.ts). '
  'SECURITY INVOKER (padrao, sem security definer): cada statement interno '
  'continua sujeito as RLS policies de commissions/commission_payments '
  '(0027_rls_comissoes.sql) com os privilegios de quem chamou. Novo status '
  'sempre recai para a_pagar quando o saldo nao zera (fiel ao original, '
  'diferente de register_commission_payment que preserva o status atual).';

-- =======================================================================
-- 4. delete_commission_payment
--    Traducao de `useSoftDeletePayment` (hooks.ts linhas ~316-361):
--    soft-deleta o pagamento e recalcula commissions.total_pago/saldo/
--    status ('a_pagar' se o saldo voltar a ficar positivo, 'pago' caso
--    contrario -- fiel ao original).
-- =======================================================================

create or replace function public.delete_commission_payment(
  p_payment_id uuid
)
returns void
language plpgsql
as $$
declare
  v_old_payment public.commission_payments;
  v_commission public.commissions;
  v_total_comissao numeric(14, 2);
  v_new_total_pago numeric(14, 2);
  v_new_saldo numeric(14, 2);
  v_new_status commission_status;
begin
  -- 1. Busca o pagamento a excluir -- SELECT sujeito a
  --    `commission_payments_select_tenant_team` (0027).
  select * into v_old_payment from public.commission_payments where id = p_payment_id;

  if not found then
    raise exception 'Pagamento não encontrado ou sem permissão.';
  end if;

  -- 2. Busca a comissao vinculada -- SELECT sujeito a
  --    `commissions_select_tenant_team` (0027).
  select * into v_commission from public.commissions where id = v_old_payment.commission_id;

  if not found then
    raise exception 'Comissão não encontrada ou sem permissão.';
  end if;

  -- 3. Trava: comissao finalizada nao aceita exclusao de pagamentos.
  if v_commission.is_finalizada then
    raise exception 'Esta comissão está finalizada e não aceita exclusão de pagamentos.';
  end if;

  -- 4. Soft-deleta o pagamento -- UPDATE sujeito a
  --    `commission_payments_update_tenant_team` (0027).
  update public.commission_payments
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by_user_id = auth.uid(),
    updated_by_user_id = auth.uid()
  where id = p_payment_id;

  -- 5. Recalcula total_pago/saldo/status -- fiel a `newSaldo > 0.01 ?
  --    'a_pagar' : 'pago'` do original.
  v_total_comissao := coalesce(v_commission.gross_value, v_commission.base_value);
  v_new_total_pago := v_commission.total_pago - v_old_payment.valor_pago;
  v_new_saldo := v_total_comissao - v_new_total_pago;
  v_new_status := case when v_new_saldo > 0.01 then 'a_pagar'::commission_status else 'pago'::commission_status end;

  -- 6. Grava o recalculo -- UPDATE sujeito a `commissions_update_tenant_
  --    team` (0027).
  update public.commissions
  set
    total_pago = v_new_total_pago,
    saldo = v_new_saldo,
    status = v_new_status,
    updated_by_user_id = auth.uid()
  where id = v_old_payment.commission_id;
end;
$$;

comment on function public.delete_commission_payment(uuid) is
  'Soft-deleta um pagamento em commission_payments e recalcula '
  'commissions.total_pago/saldo/status numa unica transacao atomica -- '
  'corrige achado de auditoria pre-deploy sobre escritas sequenciais sem '
  'atomicidade em useSoftDeletePayment (src/features/commissions/hooks.ts). '
  'SECURITY INVOKER (padrao, sem security definer): cada statement interno '
  'continua sujeito as RLS policies de commissions/commission_payments '
  '(0027_rls_comissoes.sql) com os privilegios de quem chamou.';

-- =======================================================================
-- Grants explicitos, nada implicito (mesmo padrao de
-- create_tenant_with_admin/update_deal_stage, 0005/0018): funcoes nascem
-- com EXECUTE liberado para PUBLIC por padrao no Postgres -- revogamos
-- isso e concedemos so para `authenticated`. `anon` nunca deve poder chamar
-- nenhuma destas 4 (nao ha fluxo de comissoes sem login) e fica coberto
-- pelo revoke de PUBLIC (remove o grant implicito herdado por qualquer
-- role, incluindo anon).
-- =======================================================================

grant execute
  on function public.create_commission_adjustment(uuid, commission_adjustment_type, numeric, text, text, text)
  to authenticated;

grant execute
  on function public.register_commission_payment(uuid, numeric, date, text, text, text, text)
  to authenticated;

grant execute
  on function public.update_commission_payment(uuid, numeric, date, text, text, text, text)
  to authenticated;

grant execute
  on function public.delete_commission_payment(uuid)
  to authenticated;

revoke execute
  on function public.create_commission_adjustment(uuid, commission_adjustment_type, numeric, text, text, text)
  from public, anon;

revoke execute
  on function public.register_commission_payment(uuid, numeric, date, text, text, text, text)
  from public, anon;

revoke execute
  on function public.update_commission_payment(uuid, numeric, date, text, text, text, text)
  from public, anon;

revoke execute
  on function public.delete_commission_payment(uuid)
  from public, anon;

-- ---------------------------------------------------------------------
-- RLS: nao aplicavel a esta migration -- nenhuma tabela nova foi criada,
-- so 4 functions operando sobre RLS ja existente
-- (0027_rls_comissoes.sql). Nada pendente aqui.
-- ---------------------------------------------------------------------
