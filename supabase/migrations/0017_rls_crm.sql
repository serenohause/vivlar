-- 0017_rls_crm.sql
-- RLS do CRM: `clients`, `real_estate_agencies`, `brokers`, `deals`,
-- `activities`, `status_transitions`. Fecha a lacuna deixada de proposito em
-- 0011-0016 (RLS PENDENTE), seguindo exatamente o padrao ja estabelecido em
-- 0002/0010 (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, nunca
-- tenant_id vindo do client/body da requisicao).
--
-- REGRA DE AUTORIZACAO (mesma leva do catalogo, 0010): so a equipe interna
-- do tenant mexe no CRM. `tenant_role in ('admin', 'comercial',
-- 'administrativo')` do tenant certo (via claim) tem select/insert nas 6
-- tabelas, e update onde fizer sentido (ver por tabela abaixo).
-- `cliente`/`investidor` NAO tem nenhuma policy aqui -- RLS nega tudo por
-- padrao pra eles, de proposito (portal do cliente/investidor tera sua
-- propria visao, bem mais restrita, quando existir -- nao e o caso agora).
--
-- SEM POLICY DE DELETE em `clients`/`real_estate_agencies`/`brokers`/
-- `deals`: exclusao e sempre soft delete (`is_deleted = true` via UPDATE, ja
-- coberto pela policy de UPDATE dessas 4 tabelas). `activities`/
-- `status_transitions` sao logs, sem coluna is_deleted -- tambem sem policy
-- de delete (nem faz sentido cogitar exclusao fisica de log).
--
-- UPDATE em activities/status_transitions -- decisao caso a caso, confirmada
-- lendo o codigo original (nao assumida):
--   * activities: TEM update policy. `src/pages/DealDetail.jsx` linha ~145
--     chama `Activity.update(id, data)` (mutationFn ligada ao botao que
--     marca atividade como concluida, documentado tambem no comentario de
--     0015). Log editavel de fato, nao write-once.
--   * status_transitions: SEM update policy. Confirmado via grep no
--     original -- so ha `StatusTransition.create` (DealDetail.jsx,
--     UnitDetail.jsx, LeadForm.jsx) e `StatusTransition.filter`/`.list`
--     (leitura). Nenhum `.update(` em nenhum arquivo. E genuinamente
--     write-once -- log de transicao de estagio nao se "corrige depois".
--
-- GRANTS: 0011/0012/0013/0014 ja concederam `select, insert, update` a
-- `authenticated` (correto para essas 4 -- todas tem update policy). 0015
-- idem para `activities` (correto -- tem update policy). 0016 tambem
-- concedeu `update` para `status_transitions`, mas isso esta ERRADO -- sem
-- policy de update, o grant fica orfao (nunca autoriza nada de verdade
-- porque RLS bloqueia, mas e privilegio desnecessario concedido, contra o
-- principio de minimo privilegio). Corrigido abaixo com um REVOKE explicito.
-- Nada concedido a `anon` em nenhuma das 6 -- confirmado por auditoria pos-
-- push em information_schema.role_table_grants (ver commit).

-- =======================================================================
-- 1. clients
-- =======================================================================

alter table public.clients enable row level security;

create policy "clients_select_tenant_team"
  on public.clients
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "clients_insert_tenant_team"
  on public.clients
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "clients_update_tenant_team"
  on public.clients
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

comment on policy "clients_select_tenant_team" on public.clients is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva.';

-- =======================================================================
-- 2. real_estate_agencies
-- =======================================================================

alter table public.real_estate_agencies enable row level security;

create policy "real_estate_agencies_select_tenant_team"
  on public.real_estate_agencies
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "real_estate_agencies_insert_tenant_team"
  on public.real_estate_agencies
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "real_estate_agencies_update_tenant_team"
  on public.real_estate_agencies
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

comment on policy "real_estate_agencies_select_tenant_team" on public.real_estate_agencies is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva.';

-- =======================================================================
-- 3. brokers
-- =======================================================================

alter table public.brokers enable row level security;

create policy "brokers_select_tenant_team"
  on public.brokers
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "brokers_insert_tenant_team"
  on public.brokers
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "brokers_update_tenant_team"
  on public.brokers
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

comment on policy "brokers_select_tenant_team" on public.brokers is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva.';

-- =======================================================================
-- 4. deals
-- =======================================================================

alter table public.deals enable row level security;

create policy "deals_select_tenant_team"
  on public.deals
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "deals_insert_tenant_team"
  on public.deals
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "deals_update_tenant_team"
  on public.deals
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

comment on policy "deals_select_tenant_team" on public.deals is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva. O indice unico '
  'parcial deals_tenant_id_unit_id_active_uidx (1 deal ativo por unidade) '
  'continua sendo aplicado pelo Postgres antes/independente da RLS -- RLS '
  'so filtra visibilidade/autorizacao de linhas, nao interfere em '
  'constraints de unicidade.';

-- =======================================================================
-- 5. activities
-- =======================================================================

alter table public.activities enable row level security;

create policy "activities_select_tenant_team"
  on public.activities
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "activities_insert_tenant_team"
  on public.activities
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- UPDATE necessario de fato: src/pages/DealDetail.jsx chama
-- `Activity.update(id, { status: "CONCLUIDA" })` -- ver comentario no topo
-- do arquivo e em 0015_activities.sql.
create policy "activities_update_tenant_team"
  on public.activities
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

comment on policy "activities_select_tenant_team" on public.activities is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva.';

-- =======================================================================
-- 6. status_transitions
-- =======================================================================

alter table public.status_transitions enable row level security;

create policy "status_transitions_select_tenant_team"
  on public.status_transitions
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "status_transitions_insert_tenant_team"
  on public.status_transitions
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de UPDATE de proposito: confirmado via grep no original que
-- nao existe nenhum `StatusTransition.update(` -- so `.create`/`.filter`/
-- `.list`. E um log write-once (mudanca de estagio registrada, nao
-- corrigida depois). Ver comentario no topo do arquivo.

comment on policy "status_transitions_select_tenant_team" on public.status_transitions is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). cliente/investidor nao tem '
  'policy aqui de proposito -- sem acesso ao CRM nesta leva. Sem policy de '
  'UPDATE: log write-once, confirmado que o original nunca chama '
  'StatusTransition.update.';

-- =======================================================================
-- Grants explicitos -- correcao do grant orfao de status_transitions e
-- reafirmacao auditavel dos demais.
-- =======================================================================

-- 0016 concedeu `update` em status_transitions a `authenticated`, mas nao ha
-- (nem deve haver) policy de UPDATE para essa tabela -- privilegio orfao,
-- contra minimo privilegio. Revogado explicitamente aqui.
revoke update on public.status_transitions from authenticated;

-- clients/real_estate_agencies/brokers/deals/activities ja tem exatamente
-- `select, insert, update` concedido a `authenticated` desde 0011-0015
-- (grant e cumulativo/idempotente -- reconceder aqui so adicionaria ruido).
-- Nada concedido a `anon` em nenhuma das 6 tabelas. Confirmado via
-- auditoria pos-push em information_schema.role_table_grants (ver commit)
-- que:
--   * clients/real_estate_agencies/brokers/deals/activities: authenticated
--     tem exatamente select/insert/update; anon, nenhum privilegio.
--   * status_transitions: authenticated tem exatamente select/insert (apos
--     o revoke acima); anon, nenhum privilegio.
