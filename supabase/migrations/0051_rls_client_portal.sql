-- 0051_rls_client_portal.sql
-- RLS de `unit_checks` (0048), `construction_photos` (0049) e
-- `client_messages` (0050) -- Módulo 11 (Portal do Cliente). Fecha a lacuna
-- deixada de proposito nas 3 migrations anteriores (RLS PENDENTE), seguindo
-- o mesmo padrao ja estabelecido em 0002/.../0045
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao).
--
-- PRIMEIRO CASO REAL DE `tenant_role = 'cliente'` LENDO DADO
-- -------------------------------------------------------------------------
-- Toda RLS ate aqui (0010/0017/0023/0027/0032/0036/0039/0045) tratou so o
-- caso "qualquer membro da equipe interna (admin/comercial/administrativo)
-- ve tudo do tenant" -- cliente/investidor sempre ficaram de fora, de
-- proposito, ate o Portal do Cliente existir. Este modulo introduz o
-- primeiro caso de verdade de um usuario com `tenant_role = 'cliente'`
-- precisando enxergar linhas -- mas so as SUAS, nao todo o tenant. Cada uma
-- das 3 tabelas ganha DUAS policies permissivas de SELECT (nao uma so com
-- OR embutido, mas o efeito e equivalente -- Postgres combina policies
-- permissivas do MESMO comando com OR automaticamente, sem o risco de
-- "vazamento" documentado em 0040 porque aqui as duas sao SELECT-only, sem
-- WITH CHECK nenhuma para compor por engano):
--   1. `..._select_tenant_team` -- equipe interna (admin/comercial/
--      administrativo) do tenant certo, ve tudo do tenant. Mesmo padrao ja
--      estabelecido em toda RLS anterior.
--   2. `..._select_tenant_client_own` -- `tenant_role = 'cliente'` do tenant
--      certo, ve SOMENTE as linhas ligadas a ele: unit_checks da(s) sua(s)
--      unidade(s) vendida(s), fotos de obra do(s) projeto(s) onde estao
--      essas unidades, e suas proprias mensagens.
--
-- POR QUE 3 FUNCOES `SECURITY DEFINER` (E POR QUE ISSO NAO FERE O PADRAO DO
-- CLAUDE.MD DE "TENANT_ID SEMPRE DO CLAIM, NUNCA LOOKUP EM TABELA")
-- -------------------------------------------------------------------------
-- A regra de "cliente ve a propria unidade" e uma cadeia de 3 saltos sem FK
-- direta: unit_checks/construction_photos -> units/projects -> deals
-- (sales_stage = 'vendido') -> clients (user_id = auth.uid()). Isso NAO e o
-- mesmo caso que o CLAUDE.md probe (evitar resolver TENANT_ID via lookup em
-- tabela de relacao a cada policy, o que geraria N+1 dentro da propria
-- RLS) -- tenant_id aqui continua vindo 100% do claim do JWT, em toda
-- policy, como sempre. O que precisa de lookup e a OUTRA dimensao do
-- isolamento (que unidade/cliente e "dele"), que so existe no banco -- nao
-- ha claim de "unit_id do cliente" no JWT, nem faria sentido ter (um
-- cliente pode comprar mais de uma unidade).
--
-- O problema tecnico real: `clients`, `deals` e `units` (0010/0017) NUNCA
-- ganharam policy de SELECT para `tenant_role = 'cliente'` -- de proposito,
-- confirmado nos comentarios de 0010/0017 ("portal do cliente tera visao
-- propria e mais restrita quando... nao e o caso agora"). Isso significa
-- que um EXISTS comum, dentro da policy de unit_checks/construction_photos/
-- client_messages, contra `deals`/`clients`/`units`, executado como o
-- proprio usuario `cliente` autenticado, SEMPRE retornaria 0 linhas -- a
-- RLS dessas 3 tabelas barraria o EXISTS antes mesmo de ele poder confirmar
-- posse, independente do dado ser realmente dele. Expandir a policy de
-- SELECT de `clients`/`deals`/`units` para liberar leitura ampla (mesmo que
-- filtrada) ao papel `cliente` esta fora do escopo desta migration (mudaria
-- o contrato de 0010/0017, tabelas de outro modulo, sem pedido explicito) e
-- seria PIOR pela superficie exposta -- `deals`/`clients` carregam dado
-- comercial sensivel (valor de venda, comissao, notas do CRM) que o cliente
-- nao deveria enxergar nem parcialmente.
--
-- A saida e o MESMO padrao ja usado neste projeto para "bypassar RLS de
-- outra tabela de forma controlada" -- funcao `security definer` (ver
-- 0005_create_tenant_rpc.sql): a funcao roda com o privilegio do seu DONO
-- (`postgres`, dono de `clients`/`deals`/`units`/`projects`, e nao sujeito a
-- FORCE ROW LEVEL SECURITY em nenhuma delas -- confirmado, nenhuma migration
-- deste projeto usa FORCE ROW LEVEL SECURITY), entao o EXISTS interno
-- enxerga a linha de verdade, sem depender de nenhuma policy de SELECT
-- existir para `cliente` nessas 3 tabelas. As 3 funcoes SO retornam um
-- boolean (nunca uma linha de dado) e SO leem `tenant_id`/claim do JWT +
-- `auth.uid()` -- nao reintroduzem lookup de tenant_id, so resolvem posse
-- dentro do MESMO tenant ja confirmado pelo claim.
--
-- `set search_path = ''` (vazio) -- mesma pratica de 0005: todo objeto no
-- corpo da funcao e schema-qualificado explicitamente (`public.deals`,
-- `public.clients`, `public.units`, `auth.uid()`, `auth.jwt()`), blindado
-- contra search_path hijacking. `language sql stable` (nao plpgsql): corpo
-- e uma unica consulta, sem necessidade de controle de fluxo.
--
-- REGRA DE AUTORIZACAO POR TABELA (confirmada com o usuario)
-- -------------------------------------------------------------------------
--   * unit_checks: SELECT liberado a equipe interna (tudo do tenant) e a
--     cliente (so checks de unidade(s) vendida(s) a ele). INSERT/UPDATE so
--     equipe interna (admin/comercial/administrativo) -- mesmo padrao ja
--     estabelecido (0010/0017/0036), nada reinventado aqui. Gate real de
--     `admin_status` em UnitDetail.jsx (toggleCheck/checkCanAdvance) precisa
--     dessa escrita. Cliente NUNCA insere/atualiza (so leitura no Portal,
--     confirmado por grep em ClientPortal.jsx -- so .filter()/.list()).
--   * construction_photos: mesma forma -- SELECT equipe (tudo do tenant) +
--     cliente (so fotos do(s) projeto(s) onde tem unidade vendida).
--     INSERT/UPDATE so equipe interna, mesmo que nenhum fluxo real de upload
--     exista ainda (0049: tabela orfa no original) -- grants de tabela ja
--     preveem isso desde a criacao, e mantem consistencia com o resto do
--     projeto (equipe grava, cliente so le) em vez de deixar a decisao
--     pendente. Cliente NUNCA insere/atualiza.
--   * client_messages: mesma forma -- SELECT equipe (tudo do tenant) +
--     cliente (so as PROPRIAS mensagens, via clients.user_id = auth.uid()).
--     INSERT/UPDATE so equipe interna (mensagem "equipe -> cliente", unico
--     sentido com uso real hoje -- ver comentario de 0050 sobre `direction`
--     'to_client' ser o unico literal confirmado no original). Cliente
--     NUNCA insere/atualiza nesta rodada -- nem para enviar mensagem
--     propria (`direction = 'from_client'`, so inferido da UI, sem write
--     path confirmado) nem para marcar `read_at` -- ambos ficam fora de
--     escopo, sao feature nova de mensageria bidirecional real, nao a
--     replica fiel do Portal do Cliente original. Revisitar esta migration
--     quando essa feature for pedida explicitamente.
--
-- SEM POLICY DE DELETE em nenhuma das 3: exclusao e sempre soft delete via
-- UPDATE (`is_deleted`), ja coberto pela policy de UPDATE (equipe interna).
-- Grants de tabela (0048/0049/0050) ja sao exatamente `select, insert,
-- update` -- nada a corrigir aqui.

-- =======================================================================
-- 0. Funcoes auxiliares SECURITY DEFINER -- ver racional completo acima.
-- =======================================================================

-- Verdadeiro se o usuario autenticado (auth.uid()) e o cliente comprador de
-- uma unidade (deal com sales_stage = 'vendido', dentro do MESMO tenant do
-- claim do JWT).
create or replace function public.client_owns_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deals d
    join public.clients c on c.id = d.client_id
    where d.unit_id = p_unit_id
      and d.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and c.tenant_id = d.tenant_id
      and d.sales_stage = 'vendido'
      and d.is_deleted = false
      and c.is_deleted = false
      and c.user_id = auth.uid()
  );
$$;

comment on function public.client_owns_unit(uuid) is
  'SECURITY DEFINER: true se auth.uid() e o comprador (deal vendido) da '
  'unidade p_unit_id, dentro do tenant do claim do JWT. Bypassa RLS de '
  'deals/clients de proposito (nenhuma das duas tem policy de SELECT para '
  'tenant_role=cliente -- 0010/0017) -- ver racional completo no topo de '
  '0051_rls_client_portal.sql. Usada pela policy de SELECT de unit_checks '
  'para o papel cliente.';

-- Verdadeiro se o usuario autenticado e comprador de ALGUMA unidade dentro
-- do projeto p_project_id (dentro do MESMO tenant do claim).
create or replace function public.client_owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deals d
    join public.clients c on c.id = d.client_id
    join public.units u on u.id = d.unit_id
    where u.project_id = p_project_id
      and d.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and c.tenant_id = d.tenant_id
      and u.tenant_id = d.tenant_id
      and d.sales_stage = 'vendido'
      and d.is_deleted = false
      and c.is_deleted = false
      and c.user_id = auth.uid()
  );
$$;

comment on function public.client_owns_project(uuid) is
  'SECURITY DEFINER: true se auth.uid() comprou (deal vendido) alguma '
  'unidade do projeto p_project_id, dentro do tenant do claim do JWT. '
  'Bypassa RLS de deals/clients/units de proposito -- ver racional completo '
  'no topo de 0051_rls_client_portal.sql. Usada pela policy de SELECT de '
  'construction_photos para o papel cliente.';

-- Verdadeiro se p_client_id e o proprio registro de cliente do usuario
-- autenticado (dentro do MESMO tenant do claim). Mais simples que as duas
-- acima -- FK direta clients.user_id, sem precisar passar por deals.
create or replace function public.client_owns_client_record(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and c.is_deleted = false
      and c.user_id = auth.uid()
  );
$$;

comment on function public.client_owns_client_record(uuid) is
  'SECURITY DEFINER: true se p_client_id e o registro de clients do proprio '
  'auth.uid(), dentro do tenant do claim do JWT. Bypassa RLS de clients de '
  'proposito (sem policy de SELECT para tenant_role=cliente -- 0017) -- ver '
  'racional completo no topo de 0051_rls_client_portal.sql. Usada pela '
  'policy de SELECT de client_messages para o papel cliente.';

-- Funcoes nascem com EXECUTE liberado para PUBLIC por padrao -- revogado e
-- reconcedido so para `authenticated` (mesmo padrao de 0002/0005). `anon`
-- nunca deve poder chamar isto (auth.uid() seria sempre null para anon, mas
-- nao ha razao de expor a funcao mesmo assim).
revoke execute on function public.client_owns_unit(uuid) from public, anon;
revoke execute on function public.client_owns_project(uuid) from public, anon;
revoke execute on function public.client_owns_client_record(uuid) from public, anon;

grant execute on function public.client_owns_unit(uuid) to authenticated;
grant execute on function public.client_owns_project(uuid) to authenticated;
grant execute on function public.client_owns_client_record(uuid) to authenticated;

-- =======================================================================
-- 1. unit_checks
-- =======================================================================

alter table public.unit_checks enable row level security;

create policy "unit_checks_select_tenant_team"
  on public.unit_checks
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "unit_checks_select_tenant_client_own"
  on public.unit_checks
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_unit(unit_id)
  );

create policy "unit_checks_insert_tenant_team"
  on public.unit_checks
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "unit_checks_update_tenant_team"
  on public.unit_checks
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

-- SEM policy de DELETE de proposito: exclusao e sempre soft delete via
-- UPDATE (ja coberto pela policy de UPDATE acima, equipe interna).

comment on policy "unit_checks_select_tenant_team" on public.unit_checks is
  'Isolamento por tenant via claim tenant_id do JWT, papeis internos '
  '(admin/comercial/administrativo) veem todos os checks do tenant.';

comment on policy "unit_checks_select_tenant_client_own" on public.unit_checks is
  'tenant_role=cliente do tenant certo ve SOMENTE checks da(s) unidade(s) '
  'que comprou (deal vendido) -- via client_owns_unit(), SECURITY DEFINER '
  'que bypassa RLS de deals/clients de proposito (ver racional completo no '
  'topo de 0051_rls_client_portal.sql). Sem isso, unit_checks de outro '
  'cliente do MESMO tenant ficariam expostas -- isolamento aqui e por '
  'unidade/cliente, nao so por tenant.';

-- =======================================================================
-- 2. construction_photos
-- =======================================================================

alter table public.construction_photos enable row level security;

create policy "construction_photos_select_tenant_team"
  on public.construction_photos
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "construction_photos_select_tenant_client_own"
  on public.construction_photos
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_project(project_id)
  );

create policy "construction_photos_insert_tenant_team"
  on public.construction_photos
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "construction_photos_update_tenant_team"
  on public.construction_photos
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

-- SEM policy de DELETE de proposito -- mesmo criterio de unit_checks acima.

comment on policy "construction_photos_select_tenant_team" on public.construction_photos is
  'Isolamento por tenant via claim tenant_id do JWT, papeis internos '
  '(admin/comercial/administrativo) veem todas as fotos do tenant.';

comment on policy "construction_photos_select_tenant_client_own" on public.construction_photos is
  'tenant_role=cliente do tenant certo ve SOMENTE fotos do(s) projeto(s) '
  'onde tem unidade comprada (deal vendido) -- via client_owns_project(), '
  'SECURITY DEFINER que bypassa RLS de deals/clients/units de proposito '
  '(ver racional completo no topo de 0051_rls_client_portal.sql). Sem FK '
  'direta cliente/unit nesta tabela -- so project_id -- por isso o join '
  'passa por units dentro da funcao.';

-- =======================================================================
-- 3. client_messages
-- =======================================================================

alter table public.client_messages enable row level security;

create policy "client_messages_select_tenant_team"
  on public.client_messages
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "client_messages_select_tenant_client_own"
  on public.client_messages
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_client_record(client_id)
  );

create policy "client_messages_insert_tenant_team"
  on public.client_messages
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "client_messages_update_tenant_team"
  on public.client_messages
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

-- SEM policy de DELETE de proposito -- mesmo criterio das 2 tabelas acima.
-- SEM policy de INSERT/UPDATE para cliente de proposito (nesta rodada) --
-- nem para enviar mensagem propria (direction = 'from_client', sem write
-- path confirmado no original) nem para marcar read_at -- ver racional
-- completo no topo do arquivo.

comment on policy "client_messages_select_tenant_team" on public.client_messages is
  'Isolamento por tenant via claim tenant_id do JWT, papeis internos '
  '(admin/comercial/administrativo) veem todas as mensagens do tenant.';

comment on policy "client_messages_select_tenant_client_own" on public.client_messages is
  'tenant_role=cliente do tenant certo ve SOMENTE as PROPRIAS mensagens '
  '(client_id = o proprio registro em clients, via user_id = auth.uid()) -- '
  'via client_owns_client_record(), SECURITY DEFINER que bypassa RLS de '
  'clients de proposito (ver racional completo no topo de '
  '0051_rls_client_portal.sql). Sem isso, mensagens de outro cliente do '
  'MESMO tenant ficariam expostas.';

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function deste modulo
-- existe hoje (confirmado -- so migrations de schema/RLS criadas ate agora
-- para unit_checks/construction_photos/client_messages, nada em
-- supabase/functions/). Ponto a revisitar quando/se uma for criada:
-- `service_role` so pode ser usado server-side (dentro da Edge Function,
-- nunca embutido/exposto num client React) -- mesma regra de 0045. Ver
-- teste supabase/tests/0051_client_portal_isolation.sql para o teste de
-- isolamento cross-tenant e por posse (unidade/cliente) correspondente a
-- esta migration.
