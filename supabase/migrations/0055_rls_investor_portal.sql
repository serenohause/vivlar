-- 0055_rls_investor_portal.sql
-- Modulo 12 -- Portal do Investidor: primeiro caso real de `tenant_role =
-- 'investidor'` lendo dado (mesmo espirito de 0051, Portal do Cliente, mas
-- para o outro papel externo deixado de fora de proposito em 0045).
--
-- ESCOPO CONFIRMADO COM O USUARIO
-- -------------------------------------------------------------------------
-- Nao ha tabela nova: `investors.user_id` ja existe desde 0041, pensado
-- exatamente para isto. As 4 telas do original (InvestorProjects.jsx,
-- InvestorProjectDetail.jsx, InvestorContributions.jsx,
-- InvestorReturns.jsx) filtravam por `investor_id === currentUser.id` -- BUG
-- ja documentado em 0041 (linhas 21-31) e em docs/ARCHITECTURE.md: no schema
-- novo toda FK `investor_id` aponta sempre para `investors.id`, entao a
-- policy correta filtra por `investors.user_id = auth.uid()`, nao por
-- `auth.uid()` direto contra `investor_id`.
--
-- DELIBERADAMENTE NAO PORTADO: `InvestorDashboard.jsx` (a pagina, 512
-- linhas) lista TODOS os investidores lado a lado com saldo/capital de cada
-- um (`investorBalances`) -- se essa consulta fosse liberada tal qual para o
-- papel `investidor`, vazaria dado financeiro privado de outros investidores
-- do MESMO tenant. As policies abaixo bloqueiam isso por design: um
-- investidor SO ve as PROPRIAS linhas em project_investors/
-- investment_contributions/investment_returns, nunca as de outro investidor
-- do mesmo tenant -- equivalente ao "so as suas" ja aplicado ao papel
-- cliente em 0051. A tela pessoal (so os proprios projetos/aportes/
-- retornos) fica para o frontend-builder na proxima etapa;
-- `InvestorDashboardPage` (dashboard consolidado admin, modulo 10) continua
-- exclusiva da equipe interna, sem mudanca nenhuma aqui.
--
-- PADRAO REUTILIZADO DE 0051 (Portal do Cliente)
-- -------------------------------------------------------------------------
-- Mesma tecnica: cada tabela ganha uma SEGUNDA policy permissiva de SELECT
-- (`..._select_tenant_investor_own`), somada por OR (automatico do Postgres
-- para policies permissivas do MESMO comando) a policy de equipe interna ja
-- existente (`..._select_tenant_read_team`, 0045) -- sem duplicar/alterar a
-- policy de equipe, so adicionando a nova. Nenhuma policy de INSERT/UPDATE
-- nova para `investidor`: o papel so LE (mesmo criterio ja usado para
-- `cliente` em 0051 -- nenhuma tela do escopo desta leva grava nada como
-- investidor).
--
-- `investors`: FK direta (`investors.user_id = auth.uid()`), sem precisar de
-- funcao SECURITY DEFINER -- o proprio registro que a policy protege JA TEM
-- a coluna de posse.
--
-- `project_investors`/`investment_contributions`/`investment_returns`: essas
-- 3 tabelas NAO tem `user_id` proprio, so `investor_id` (FK para
-- `investors.id`). Resolver "o investidor.id cujo user_id = auth.uid()"
-- exige um lookup em `investors` -- mas a policy de SELECT de `investors`
-- (0045) so libera leitura para `admin`/`comercial`/`administrativo`, NUNCA
-- para `investidor` antes desta migration (a nova policy abaixo muda isso,
-- mas so para o PROPRIO registro) -- um EXISTS comum contra `investors`
-- dentro dessas 3 policies funcionaria de qualquer forma neste caso
-- especifico (porque agora `investidor` PODE ler o proprio registro em
-- investors, ver policy 1 abaixo), mas a funcao SECURITY DEFINER e preferida
-- mesmo assim, pelo MESMO racional documentado em 0051 (linhas 30-70): nao
-- acopla o funcionamento de 3 policies a exatamente qual policy de SELECT
-- `investors` tem hoje -- se `investors` mudar de politica de leitura no
-- futuro (por exemplo, se o papel investidor precisar ficar mais restrito
-- ainda em `investors`), as 3 policies dependentes nao quebram silenciosamente
-- junto. `set search_path = ''`, `language sql stable security definer` --
-- mesmo padrao de 0005/0051.
--
-- REGRA DE AUTORIZACAO POR TABELA (confirmada com o usuario)
-- -------------------------------------------------------------------------
--   * investors: `investidor` do tenant certo ve SOMENTE o proprio cadastro
--     (`investors.user_id = auth.uid()`). Continua sem INSERT/UPDATE para
--     este papel -- so a equipe (admin) cadastra/edita investidores (0045).
--   * project_investors: `investidor` ve SOMENTE os proprios vinculos
--     (investor_id -> investors.user_id = auth.uid()). Sem INSERT/UPDATE.
--   * investment_contributions: mesmo criterio -- SOMENTE os proprios
--     aportes. Sem INSERT/UPDATE.
--   * investment_returns: mesmo criterio -- SOMENTE os proprios retornos.
--     Sem INSERT/UPDATE.
--   * projects: `investidor` ve SOMENTE projeto(s) onde tem vinculo ativo em
--     project_investors (nao excluido) -- via nova funcao SECURITY DEFINER
--     `investor_has_stake_in_project`, mesmo racional das 3 tabelas acima
--     (project_investors nao libera leitura ampla para investidor -- so as
--     PROPRIAS linhas -- entao um EXISTS comum dentro da policy de projects,
--     rodando como o proprio investidor, so enxergaria os proprios vinculos
--     mesmo assim; a funcao SECURITY DEFINER e usada por consistencia e para
--     nao acoplar projects a policy de project_investors). Sem INSERT/
--     UPDATE -- projects continua com escrita restrita a equipe interna
--     (0010), sem mudanca.
--
-- SEM POLICY DE DELETE em nenhuma das 4 tabelas de investidores: mesmo
-- criterio ja estabelecido (soft delete via UPDATE, sempre restrito a
-- admin, 0045) -- `investidor` nunca teve nem tera DELETE.
--
-- deals/commissions: DELIBERADAMENTE SEM POLICY NOVA para `investidor`
-- nesta migration -- ver 0056_investor_operational_result.sql. Dar SELECT
-- (mesmo que filtrado) dessas 2 tabelas para o papel investidor vazaria
-- dado comercial granular (valor de venda por unidade, corretor, etc); o
-- resultado agregado (receita, custos, lucro, margem) e exposto so via
-- funcao SECURITY DEFINER dedicada.

-- =======================================================================
-- 0. Funcoes auxiliares SECURITY DEFINER -- mesmo padrao de 0051.
-- =======================================================================

-- Verdadeiro se p_investor_id e o proprio registro de investors do usuario
-- autenticado (dentro do MESMO tenant do claim). Mais simples que as
-- proximas duas -- FK direta investors.user_id, sem precisar de join.
create or replace function public.investor_owns_investor_record(p_investor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.investors i
    where i.id = p_investor_id
      and i.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and i.is_deleted = false
      and i.user_id = auth.uid()
  );
$$;

comment on function public.investor_owns_investor_record(uuid) is
  'SECURITY DEFINER: true se p_investor_id e o registro de investors do '
  'proprio auth.uid(), dentro do tenant do claim do JWT. Usada pelas '
  'policies de SELECT de project_investors/investment_contributions/'
  'investment_returns para o papel investidor -- filtra por investor_id '
  'sem depender de qual policy de SELECT investors tem hoje. Ver racional '
  'completo no topo de 0055_rls_investor_portal.sql.';

-- Verdadeiro se o usuario autenticado tem vinculo ATIVO (nao excluido) em
-- project_investors com o projeto p_project_id, dentro do MESMO tenant do
-- claim.
create or replace function public.investor_has_stake_in_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_investors pi
    join public.investors i on i.id = pi.investor_id
    where pi.project_id = p_project_id
      and pi.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and i.tenant_id = pi.tenant_id
      and pi.is_deleted = false
      and i.is_deleted = false
      and i.user_id = auth.uid()
  );
$$;

comment on function public.investor_has_stake_in_project(uuid) is
  'SECURITY DEFINER: true se auth.uid() tem vinculo ativo (project_investors '
  'nao excluido) com o projeto p_project_id, dentro do tenant do claim do '
  'JWT. Usada pela policy de SELECT de projects para o papel investidor, e '
  'pela funcao get_project_operational_result '
  '(0056_investor_operational_result.sql) para autorizar o calculo '
  'agregado. Ver racional completo no topo de 0055_rls_investor_portal.sql.';

-- Funcoes nascem com EXECUTE liberado para PUBLIC por padrao -- revogado e
-- reconcedido so para `authenticated` (mesmo padrao de 0002/0005/0051).
revoke execute on function public.investor_owns_investor_record(uuid) from public, anon;
revoke execute on function public.investor_has_stake_in_project(uuid) from public, anon;

grant execute on function public.investor_owns_investor_record(uuid) to authenticated;
grant execute on function public.investor_has_stake_in_project(uuid) to authenticated;

-- =======================================================================
-- 1. investors -- nova policy de SELECT para o proprio registro.
-- =======================================================================

create policy "investors_select_tenant_investor_own"
  on public.investors
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'investidor'
    and user_id = auth.uid()
  );

comment on policy "investors_select_tenant_investor_own" on public.investors is
  'tenant_role=investidor do tenant certo ve SOMENTE o proprio cadastro '
  '(user_id = auth.uid()) -- FK direta, sem funcao auxiliar. Somada por OR '
  'a investors_select_tenant_read_team (0045, equipe interna). Sem INSERT/'
  'UPDATE para este papel -- so admin cadastra/edita investidores (0045).';

-- =======================================================================
-- 2. project_investors -- nova policy de SELECT para os proprios vinculos.
-- =======================================================================

create policy "project_investors_select_tenant_investor_own"
  on public.project_investors
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'investidor'
    and public.investor_owns_investor_record(investor_id)
  );

comment on policy "project_investors_select_tenant_investor_own" on public.project_investors is
  'tenant_role=investidor do tenant certo ve SOMENTE os PROPRIOS vinculos '
  '(investor_id -> investors.user_id = auth.uid(), via '
  'investor_owns_investor_record()) -- nunca vinculos de outro investidor do '
  'MESMO tenant (isso vazaria valor_aportado/percentual_participacao de '
  'terceiro -- exatamente o bug do InvestorDashboard.jsx original que esta '
  'migration existe para NAO reproduzir). Somada por OR a '
  'project_investors_select_tenant_read_team (0045). Sem INSERT/UPDATE para '
  'este papel.';

-- =======================================================================
-- 3. investment_contributions -- nova policy de SELECT para os proprios
--    aportes.
-- =======================================================================

create policy "investment_contributions_select_tenant_investor_own"
  on public.investment_contributions
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'investidor'
    and public.investor_owns_investor_record(investor_id)
  );

comment on policy "investment_contributions_select_tenant_investor_own" on public.investment_contributions is
  'tenant_role=investidor do tenant certo ve SOMENTE os PROPRIOS aportes '
  '(investor_id -> investors.user_id = auth.uid(), via '
  'investor_owns_investor_record()) -- nunca aportes de outro investidor do '
  'MESMO tenant. Somada por OR a '
  'investment_contributions_select_tenant_read_team (0045). Sem INSERT/'
  'UPDATE para este papel.';

-- =======================================================================
-- 4. investment_returns -- nova policy de SELECT para os proprios retornos.
-- =======================================================================

create policy "investment_returns_select_tenant_investor_own"
  on public.investment_returns
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'investidor'
    and public.investor_owns_investor_record(investor_id)
  );

comment on policy "investment_returns_select_tenant_investor_own" on public.investment_returns is
  'tenant_role=investidor do tenant certo ve SOMENTE os PROPRIOS retornos '
  '(investor_id -> investors.user_id = auth.uid(), via '
  'investor_owns_investor_record()) -- nunca retornos de outro investidor do '
  'MESMO tenant. Somada por OR a '
  'investment_returns_select_tenant_read_team (0045). Sem INSERT/UPDATE para '
  'este papel.';

-- =======================================================================
-- 5. projects -- nova policy de SELECT para o(s) projeto(s) onde o
--    investidor tem vinculo ativo.
-- =======================================================================

create policy "projects_select_tenant_investor_own"
  on public.projects
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'investidor'
    and public.investor_has_stake_in_project(id)
  );

comment on policy "projects_select_tenant_investor_own" on public.projects is
  'tenant_role=investidor do tenant certo ve SOMENTE projeto(s) onde tem '
  'vinculo ativo em project_investors (via investor_has_stake_in_project()) '
  '-- inclui total_construction_cost/total_indirect_costs (RLS opera sobre '
  'linhas, nao colunas -- ver 0046/0047; o trigger de 0047 restringe '
  'ESCRITA dessas 2 colunas a admin, nao leitura). Somada por OR a '
  'projects_select_tenant_team (0010, equipe interna). Sem INSERT/UPDATE '
  'para este papel -- projects continua com escrita restrita a equipe '
  'interna, sem mudanca.';

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function deste modulo
-- existe hoje (confirmado -- so migrations de schema/RLS ate agora, nada em
-- supabase/functions/ para investidores). Ponto a revisitar quando/se uma
-- for criada: `service_role` so pode ser usado server-side, nunca exposto
-- ao client -- mesma regra de 0045/0047/0051.
--
-- deals/commissions para o papel investidor: ver
-- 0056_investor_operational_result.sql -- resultado agregado via funcao
-- SECURITY DEFINER, nunca SELECT linha a linha.
--
-- Ver supabase/tests/0055_investor_portal_isolation.sql para o teste de
-- isolamento cross-tenant e por posse (investidor A vs investidor B do
-- mesmo tenant) correspondente a esta migration.
