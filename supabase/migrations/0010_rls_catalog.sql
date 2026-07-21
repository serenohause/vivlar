-- 0010_rls_catalog.sql
-- RLS do catalogo: `terrains`, `projects`, `units`. Fecha a lacuna deixada
-- de proposito em 0007/0008/0009 (RLS PENDENTE), seguindo exatamente o
-- padrao ja estabelecido em 0002 (`(auth.jwt() ->> 'tenant_id')::uuid =
-- tenant_id`, nunca tenant_id vindo do client/body da requisicao).
--
-- REGRA DE AUTORIZACAO (confirmada com o usuario para esta leva): so a
-- equipe interna do tenant mexe no catalogo. `tenant_role in ('admin',
-- 'comercial', 'administrativo')` do tenant certo (via claim) tem
-- select/insert/update nas 3 tabelas. `cliente`/`investidor` NAO tem
-- nenhuma policy aqui -- RLS nega tudo por padrao pra eles, de proposito
-- (o portal do cliente/investidor vai expor uma visao bem mais restrita
-- quando o modulo de CRM/deals existir e ligar cliente<->unidade; nao e o
-- caso agora).
--
-- SEM POLICY DE DELETE: exclusao e sempre soft delete (`is_deleted =
-- true` via UPDATE, ja coberto pela policy de UPDATE abaixo), igual ao
-- resto do sistema (docs/DOMAIN_MAP.md, convencao "soft-delete padrao").
-- Sem policy de delete para `authenticated`, o Postgres nega DELETE por
-- padrao -- nem precisa de grant de tabela para delete (ver secao de
-- grants abaixo: so select/insert/update sao (re)confirmados).
--
-- GRANTS: 0007/0008/0009 ja concederam `grant select, insert, update on
-- public.<tabela> to authenticated` no momento da criacao de cada tabela
-- (nada para `anon` -- sem fluxo publico/anonimo nestas 3 tabelas ainda;
-- quando o espelho de vendas publico for implementado, sera uma policy
-- dedicada restrita a `is_public = true`, nao um grant geral a `anon`).
-- Este arquivo NAO precisa reconceder isso -- grant e cumulativo e
-- idempotente, mas repetir aqui sem necessidade so adicionaria ruido.
-- Confirmado via auditoria pos-push em information_schema.role_table_
-- grants (ver commit) que anon continua sem nenhum privilegio nas 3
-- tabelas e authenticated tem exatamente select/insert/update -- nada de
-- delete/truncate/references/trigger, aprendendo com o erro corrigido em
-- 0003/0004.

-- ---------------------------------------------------------------------
-- 1. terrains
-- ---------------------------------------------------------------------

alter table public.terrains enable row level security;

create policy "terrains_select_tenant_team"
  on public.terrains
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "terrains_insert_tenant_team"
  on public.terrains
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "terrains_update_tenant_team"
  on public.terrains
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

comment on policy "terrains_select_tenant_team" on public.terrains is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao catalogo nesta leva.';

-- ---------------------------------------------------------------------
-- 2. projects
-- ---------------------------------------------------------------------

alter table public.projects enable row level security;

create policy "projects_select_tenant_team"
  on public.projects
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "projects_insert_tenant_team"
  on public.projects
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "projects_update_tenant_team"
  on public.projects
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

comment on policy "projects_select_tenant_team" on public.projects is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). Nenhuma policy de acesso '
  'anonimo/publico aqui ainda -- is_public + policy dedicada fica para '
  'quando o espelho de vendas publico for implementado.';

-- ---------------------------------------------------------------------
-- 3. units
-- ---------------------------------------------------------------------

alter table public.units enable row level security;

create policy "units_select_tenant_team"
  on public.units
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "units_insert_tenant_team"
  on public.units
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "units_update_tenant_team"
  on public.units
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

comment on policy "units_select_tenant_team" on public.units is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- o portal do cliente/investidor tera visao '
  'propria e mais restrita quando deals (CRM) ligar cliente<->unidade.';
