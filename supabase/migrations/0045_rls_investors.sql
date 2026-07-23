-- 0045_rls_investors.sql
-- RLS de `investors` (0041), `project_investors` (0042),
-- `investment_contributions` (0043) e `investment_returns` (0044). Fecha a
-- lacuna deixada de proposito nas 4 migrations anteriores (RLS PENDENTE),
-- seguindo o mesmo padrao ja estabelecido em
-- 0002/0010/0017/0023/0027/0032/0036/0039/0040
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao).
--
-- As 4 tabelas numa unica migration (mesma escolha de 0032/0036/0039): mesma
-- "leva" de trabalho (modulo 10 - Investidores), sobre o mesmo modulo, com a
-- MESMA regra de autorizacao.
--
-- REGRA DE AUTORIZACAO -- DIFERENTE DO CRITERIO DE MANUTENCAO (0039/0040)
-- -------------------------------------------------------------------------
-- Escopo confirmado com o usuario: so o lado interno/admin acessa estas 4
-- tabelas nesta rodada (sem portal do investidor ainda -- mesmo criterio
-- geral de escopo ja usado em Manutencao, 0037/0039). A DIFERENCA em
-- relacao a Manutencao e QUEM, dentro do time interno, pode operar:
--
-- Manutencao (0039): admin/comercial/administrativo TODOS podem
-- criar/editar chamados -- e trabalho operacional do dia a dia, sem
-- envolver dinheiro de terceiros diretamente.
--
-- Investidores (aqui): dados de dinheiro de terceiros (aportes e retornos
-- pagos a investidores externos) e cadastro de quem sao esses investidores
-- -- informacao financeira sensivel, nao operacional do dia a dia de
-- comercial/administrativo. Decisao (pedida explicitamente pelo usuario:
-- "so admin deveria conseguir gerenciar isso"):
--
--   - SELECT: `admin`, `comercial` E `administrativo` do tenant certo (via
--     claim) podem LER as 4 tabelas. Racional: comercial/administrativo
--     legitimamente precisam CONSULTAR quem sao os investidores de um
--     projeto e quanto ja foi aportado/retornado -- por exemplo, ao montar
--     um relatorio de projeto, conferir se uma unidade tem capital de
--     investidor vinculado, ou responder uma pergunta de um investidor por
--     telefone -- sem que isso signifique que eles devam ser capazes de
--     ALTERAR esse dado. E o mesmo raciocinio de "least privilege" ja usado
--     no financeiro (0023): ver saldo/status e diferente de poder mexer
--     nele. Nao ha nenhuma tela em `original-project/` que restrinja isso
--     por papel (nao existe controle de acesso por role no app antigo -- e
--     hardcoded para uma unica empresa), entao a decisao e nova, tomada
--     aqui a favor de menor privilegio.
--
--   - INSERT/UPDATE: RESTRITO A `admin`. Cadastrar investidor, criar/editar
--     vinculo investidor-projeto, registrar aporte ou retorno sao acoes que
--     movimentam ou comprometem dinheiro de terceiros -- exigem o nivel de
--     confianca mais alto disponivel no sistema hoje (`admin`), nao o time
--     comercial/administrativo do dia a dia. Se o produto precisar no
--     futuro de um papel intermediario (ex: "financeiro"), isso e uma
--     migration nova, decisao de produto explicita, nao uma folga aqui.
--
--   - DELETE: sem policy (mesmo padrao do resto do projeto) -- exclusao e
--     sempre soft delete via UPDATE de `is_deleted`, ja coberto pela policy
--     de UPDATE (so admin). Grants de tabela tambem nao incluem delete em
--     nenhuma das 4 migrations anteriores -- nada a revogar aqui.
--
--   - `cliente`/`investidor`: SEM NENHUMA policy aqui, de proposito -- RLS
--     nega tudo por padrao pra eles. Nao existe portal do investidor ainda
--     (confirmado no comentario de escopo de 0041/0042/0043/0044) --
--     revisitar esta migration quando esse portal for construido (um
--     investidor devera poder ler, no minimo, os proprios registros em
--     `investors`/`project_investors`/`investment_contributions`/
--     `investment_returns` filtrados por `investor_id`, nunca pela ausencia
--     de policy que fecha tudo).
--
-- Como so existe UMA policy por comando (select/insert/update) em cada
-- tabela -- nao ha composicao por OR entre policies concorrentes do mesmo
-- comando (mesma armadilha documentada em 0040) -- a logica fica inteira
-- dentro de uma unica expressao por comando, sem risco de uma policy mais
-- permissiva "vazar" privilegio que outra pretendia negar.

-- =======================================================================
-- 1. investors
-- =======================================================================

alter table public.investors enable row level security;

create policy "investors_select_tenant_read_team"
  on public.investors
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "investors_insert_tenant_admin"
  on public.investors
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

create policy "investors_update_tenant_admin"
  on public.investors
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- SEM policy de DELETE de proposito: exclusao e sempre soft delete
-- (`is_deleted = true` via UPDATE, ja coberto pela policy de UPDATE acima,
-- restrita a admin). Grant de delete tambem nao foi concedido em 0041 --
-- nada a revogar aqui.

comment on policy "investors_select_tenant_read_team" on public.investors is
  'Isolamento por tenant via claim tenant_id do JWT. Leitura liberada para '
  'admin/comercial/administrativo (consulta operacional); escrita restrita '
  'a admin (ver racional completo no topo de 0045_rls_investors.sql -- '
  'dinheiro de terceiros). cliente/investidor sem policy aqui de proposito '
  '-- sem portal do investidor nesta rodada.';

-- Grants: `investors` ja tem exatamente `select, insert, update` concedido a
-- `authenticated` desde 0041 -- bate com as 3 policies acima (select mais
-- aberto por papel, insert/update mais restritos por papel dentro do MESMO
-- grant de tabela). Nada concedido a `anon`.

-- =======================================================================
-- 2. project_investors
-- =======================================================================

alter table public.project_investors enable row level security;

create policy "project_investors_select_tenant_read_team"
  on public.project_investors
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "project_investors_insert_tenant_admin"
  on public.project_investors
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

create policy "project_investors_update_tenant_admin"
  on public.project_investors
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- SEM policy de DELETE de proposito -- mesmo criterio de investors acima.

comment on policy "project_investors_select_tenant_read_team" on public.project_investors is
  'Isolamento por tenant via claim tenant_id do JWT. Leitura liberada para '
  'admin/comercial/administrativo; escrita restrita a admin (vinculo '
  'investidor-projeto: valor aportado e percentual de participacao no '
  'resultado -- ver racional completo no topo de 0045_rls_investors.sql). '
  'cliente/investidor sem policy aqui de proposito.';

-- Grants: `project_investors` ja tem exatamente `select, insert, update`
-- concedido a `authenticated` desde 0042. Nada concedido a `anon`.

-- =======================================================================
-- 3. investment_contributions
-- =======================================================================

alter table public.investment_contributions enable row level security;

create policy "investment_contributions_select_tenant_read_team"
  on public.investment_contributions
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "investment_contributions_insert_tenant_admin"
  on public.investment_contributions
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

create policy "investment_contributions_update_tenant_admin"
  on public.investment_contributions
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- SEM policy de DELETE de proposito -- mesmo criterio das tabelas acima.

comment on policy "investment_contributions_select_tenant_read_team" on public.investment_contributions is
  'Isolamento por tenant via claim tenant_id do JWT. Leitura liberada para '
  'admin/comercial/administrativo; escrita restrita a admin (aporte de '
  'capital de terceiro ou proprio -- ver racional completo no topo de '
  '0045_rls_investors.sql). cliente/investidor sem policy aqui de proposito.';

-- Grants: `investment_contributions` ja tem exatamente `select, insert,
-- update` concedido a `authenticated` desde 0043. Nada concedido a `anon`.

-- =======================================================================
-- 4. investment_returns
-- =======================================================================

alter table public.investment_returns enable row level security;

create policy "investment_returns_select_tenant_read_team"
  on public.investment_returns
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "investment_returns_insert_tenant_admin"
  on public.investment_returns
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

create policy "investment_returns_update_tenant_admin"
  on public.investment_returns
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

-- SEM policy de DELETE de proposito -- mesmo criterio das tabelas acima.

comment on policy "investment_returns_select_tenant_read_team" on public.investment_returns is
  'Isolamento por tenant via claim tenant_id do JWT. Leitura liberada para '
  'admin/comercial/administrativo; escrita restrita a admin (retorno/'
  'dividendo pago a terceiro ou a propria construtora -- ver racional '
  'completo no topo de 0045_rls_investors.sql). cliente/investidor sem '
  'policy aqui de proposito.';

-- Grants: `investment_returns` ja tem exatamente `select, insert, update`
-- concedido a `authenticated` desde 0044. Nada concedido a `anon`.

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function deste modulo
-- existe hoje (confirmado -- so migrations de schema criadas ate agora,
-- nenhuma function em supabase/functions/ para investidores). Ponto a
-- revisitar quando/se uma for criada: `service_role` so pode ser usado
-- server-side (dentro da Edge Function, nunca embutido/exposto num client
-- React). Ver teste supabase/tests/0045_investors_isolation.sql para o
-- teste de isolamento cross-tenant e por papel correspondente a esta
-- migration.
