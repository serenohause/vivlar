-- 0027_rls_comissoes.sql
-- RLS de Comissões: `commissions`, `commission_adjustments`,
-- `commission_payments`. Fecha a lacuna deixada de proposito em 0024-0026
-- (RLS PENDENTE), seguindo exatamente o padrao ja estabelecido em
-- 0002/0010/0017/0023 (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`,
-- nunca tenant_id vindo do client/body da requisicao).
--
-- REGRA DE AUTORIZACAO (mesma leva do Financeiro, 0023): so a equipe
-- interna do tenant mexe em comissoes. `tenant_role in ('admin',
-- 'comercial', 'administrativo')` do tenant certo (via claim) tem
-- select/insert nas 3 tabelas, e update onde fizer sentido (ver por tabela
-- abaixo). `cliente`/`investidor` NAO tem nenhuma policy aqui -- RLS nega
-- tudo por padrao pra eles, de proposito (portal do corretor ver a propria
-- comissao e feature futura, nao esta em escopo nesta leva).
--
-- SEM POLICY DE DELETE em `commissions`/`commission_payments`: exclusao e
-- sempre soft delete (`is_deleted = true` via UPDATE, ja coberto pela
-- policy de UPDATE dessas 2 tabelas).
--
-- `commission_adjustments`: write-once, sem soft-delete/updated_at
-- (confirmado pelo schema-architect em 0025 -- so ha
-- `CommissionAdjustment.create`, nunca `.update`/`.delete` no original).
-- SEM policy de UPDATE nem DELETE -- mesmo criterio ja usado para
-- `status_transitions` (0016/0017) e `finance_events` (0021/0023): log
-- write-once so aceita select/insert.
--
-- GRANTS: auditados contra as 3 migrations anteriores.
--   * commissions (0024): `select, insert, update` a `authenticated` --
--     bate exatamente com as 3 policies abaixo (select/insert/update).
--   * commission_adjustments (0025): `select, insert` a `authenticated` --
--     bate exatamente com as 2 policies abaixo (select/insert, sem
--     update). Nenhuma correcao necessaria aqui.
--   * commission_payments (0026): `select, insert, update` a
--     `authenticated` -- bate exatamente com as 3 policies abaixo
--     (select/insert/update).
-- Nada concedido a `anon` em nenhuma das 3 -- confirmado via grep nas
-- migrations 0024/0025/0026 (nenhum `grant ... to anon`) e reconfirmado
-- por auditoria pos-push em information_schema.role_table_grants (ver
-- commit). Diferente do caso de 0016/status_transitions, nenhum grant
-- sobrando/faltando foi encontrado nesta leva -- os grants de 0024-0026 ja
-- saem corretos, nenhum REVOKE necessario.

-- =======================================================================
-- 1. commissions
-- =======================================================================

alter table public.commissions enable row level security;

create policy "commissions_select_tenant_team"
  on public.commissions
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "commissions_insert_tenant_team"
  on public.commissions
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "commissions_update_tenant_team"
  on public.commissions
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "commissions_select_tenant_team" on public.commissions is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a comissoes nesta leva (portal '
  'do corretor ver a propria comissao e feature futura).';

-- =======================================================================
-- 2. commission_adjustments
-- =======================================================================

alter table public.commission_adjustments enable row level security;

create policy "commission_adjustments_select_tenant_team"
  on public.commission_adjustments
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "commission_adjustments_insert_tenant_team"
  on public.commission_adjustments
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE nem DELETE de proposito: log write-once (ver
-- comentario no topo do arquivo e em 0025_commission_adjustments.sql).
-- Grant de update tambem nao foi concedido em 0025 -- nada a revogar aqui.

comment on policy "commission_adjustments_select_tenant_team" on public.commission_adjustments is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito. Sem policy de UPDATE: log write-once, mesmo '
  'criterio de status_transitions (0016/0017) e finance_events (0021/0023) '
  '-- so ha CommissionAdjustment.create no fluxo original.';

-- =======================================================================
-- 3. commission_payments
-- =======================================================================

alter table public.commission_payments enable row level security;

create policy "commission_payments_select_tenant_team"
  on public.commission_payments
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "commission_payments_insert_tenant_team"
  on public.commission_payments
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "commission_payments_update_tenant_team"
  on public.commission_payments
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

comment on policy "commission_payments_select_tenant_team" on public.commission_payments is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso a comissoes nesta leva.';

-- =======================================================================
-- Grants: nenhuma correcao necessaria -- reafirmacao auditavel.
-- =======================================================================

-- commissions/commission_payments ja tem exatamente `select, insert,
-- update` concedido a `authenticated` desde 0024/0026 (grant e
-- cumulativo/idempotente -- reconceder aqui so adicionaria ruido).
-- commission_adjustments ja tem exatamente `select, insert` desde 0025 --
-- coerente com a ausencia de policy de UPDATE acima. Nada concedido a
-- `anon` em nenhuma das 3. Confirmado via auditoria pos-push em
-- information_schema.role_table_grants (ver commit) que:
--   * commissions/commission_payments: authenticated tem exatamente
--     select/insert/update; anon, nenhum privilegio.
--   * commission_adjustments: authenticated tem exatamente select/insert;
--     anon, nenhum privilegio.
