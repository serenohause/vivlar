-- 0056_investor_operational_result.sql
-- Modulo 12 -- Portal do Investidor: `get_project_operational_result` --
-- funcao SECURITY DEFINER que devolve o "Resultado Operacional" (receita,
-- custos, lucro liquido, margem) de UM projeto, ja agregado, sem expor
-- linha a linha `deals`/`commissions`.
--
-- POR QUE NAO E SO UMA POLICY DE SELECT EM deals/commissions
-- -------------------------------------------------------------------------
-- InvestorProjects.jsx/InvestorProjectDetail.jsx (original) cruzam `deals`
-- (funil de vendas) e `commissions` (comissoes pagas a corretor) do projeto
-- para calcular o resultado. Ambas carregam dado comercial granular: valor
-- de venda por unidade (`deals.final_sale_value`), estagio de cada
-- negociacao, nome/percentual do corretor (`commissions`) -- informacao que
-- NAO deve ser exposta linha a linha a um investidor externo, mesmo que
-- filtrada por projeto (um investidor com 5% de participacao nao precisa
-- saber o valor de venda de CADA unidade para calcular o proprio retorno,
-- so o AGREGADO do projeto). Dar SELECT (mesmo restrito por projeto) dessas
-- 2 tabelas ao papel `investidor` vazaria exatamente esse dado granular --
-- por isso 0055_rls_investor_portal.sql deliberadamente NAO criou policy
-- nenhuma para `investidor` em deals/commissions.
--
-- A saida e o mesmo padrao ja usado neste projeto para "expor um resultado
-- computado sem expor as linhas de origem" -- funcao `security definer`
-- (mesmo espirito de client_owns_unit/client_owns_project/
-- client_owns_client_record, 0051, e investor_owns_investor_record/
-- investor_has_stake_in_project, 0055): roda com o privilegio do DONO
-- (postgres, dono de deals/commissions/projects, nao sujeito a FORCE ROW
-- LEVEL SECURITY em nenhuma delas), calcula o agregado internamente, e SO
-- retorna os numeros finais -- nunca uma linha de deals/commissions.
--
-- FORMULA -- REPLICA EXATA DE `calculateProjectResults`
-- -------------------------------------------------------------------------
-- Tradução 1:1 de src/features/investors/resultHelpers.ts
-- (`calculateProjectResults`, por sua vez traducao de
-- original-project/src/components/project/resultadoOperacional/
-- resultadoHelpers.jsx):
--   receivedRevenue = soma(deals.final_sale_value) onde deals.project_id =
--     p_project_id, deals.sales_stage = 'vendido', final_sale_value nao nulo
--     e deals.is_deleted = false (mesmo filtro que toda tela do produto ja
--     aplica antes de chamar calculateProjectResults -- ver
--     InvestorProjects.jsx linha 68 "activeDeals = allDeals.filter(d =>
--     !d.is_deleted)" -- sem esse filtro aqui, o agregado desta funcao
--     divergiria do que o frontend mostra).
--   salesCosts = soma(commissions.gross_value, fallback base_value se
--     gross_value for nulo) onde commissions.project_id = p_project_id e
--     commissions.is_deleted = false.
--   netVGV = receivedRevenue - salesCosts.
--   totalConstructionCost/totalIndirectCosts = projects.total_construction_
--     cost/projects.total_indirect_costs (direto, sem calculo).
--   totalCosts = totalConstructionCost + totalIndirectCosts.
--   netResult = netVGV - totalCosts (== grossResult no TS -- resultHelpers.ts
--     nao aplica nenhum desconto extra entre os dois, netResult = grossResult
--     literalmente, linha 49 do arquivo).
--   margin = netResult / receivedRevenue * 100 se receivedRevenue > 0, senao
--     0.
--
-- AUTORIZACAO INTERNA (a funcao NAO confia em nada vindo do client alem do
-- p_project_id -- toda decisao de quem pode ver o que usa auth.uid()/
-- auth.jwt() resolvidos no proprio banco)
-- -------------------------------------------------------------------------
--   * Sem sessao autenticada (auth.uid() null) ou sem tenant_id no claim:
--     nenhuma linha retornada.
--   * `admin`/`comercial`/`administrativo` do tenant do projeto: sempre
--     autorizado. Racional: a equipe interna ja tem acesso equivalente (e
--     mais granular) via InvestorDashboardPage direto nas tabelas
--     deals/commissions/projects (0010/0027) -- esta funcao nao abre nada
--     que eles ja nao pudessem calcular manualmente, so evita duplicar a
--     formula em outro lugar (mesma formula, uma fonte da verdade).
--   * `investidor` do tenant do projeto: autorizado SOMENTE se tiver
--     vinculo ATIVO em project_investors com p_project_id -- reutiliza
--     `investor_has_stake_in_project()` (0055), a MESMA funcao que autoriza
--     a policy de SELECT de projects para este papel. Sem vinculo ativo
--     (mesmo que o projeto exista no mesmo tenant): nenhuma linha
--     retornada -- nao um erro, VAZIO, mesmo padrao de "RLS nega por
--     ausencia de match" usado em todo o resto do projeto.
--   * Qualquer outro papel (`cliente`, ou tenant_role ausente/invalido):
--     nenhuma linha retornada.
--   * Projeto inexistente, de outro tenant, ou p_project_id null: nenhuma
--     linha retornada (o SELECT em projects, mesmo rodando com privilegio
--     de dono, filtra explicitamente por tenant_id = claim -- a funcao NAO
--     reintroduz lookup de tenant_id de outro lugar, so usa o claim, mesmo
--     padrao de 0051/0055).
--
-- `returns table (...)`, NAO `returns record`/exception: uma consulta sem
-- match (nao autorizado OU projeto nao encontrado) retorna 0 linhas -- o
-- client (PostgREST RPC) recebe um array vazio, nao um erro 500/403 -- mais
-- facil de tratar no frontend (estado "sem acesso"/"sem dado" em vez de
-- exception a capturar) e evita side-channel de erro diferenciando "projeto
-- nao existe" de "projeto existe mas voce nao tem acesso" (mesma resposta:
-- vazio, nos dois casos).
--
-- `language plpgsql` (nao `sql`): precisa de controle de fluxo (`if ...
-- then return; end if;` para os casos de nao autorizado) antes da query de
-- agregacao -- mesmo motivo de 0002/0005 usarem plpgsql em vez de sql puro.
--
-- `set search_path = ''` -- mesma pratica de 0005/0051/0055: todo objeto
-- referenciado no corpo e schema-qualificado explicitamente.

create or replace function public.get_project_operational_result(p_project_id uuid)
returns table (
  project_id uuid,
  received_revenue numeric,
  sales_costs numeric,
  net_vgv numeric,
  total_construction_cost numeric,
  total_indirect_costs numeric,
  total_costs numeric,
  net_result numeric,
  margin numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant_role text;
  v_project public.projects%rowtype;
  v_received_revenue numeric;
  v_sales_costs numeric;
  v_net_vgv numeric;
  v_total_costs numeric;
  v_net_result numeric;
  v_margin numeric;
begin
  v_tenant_id := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  v_tenant_role := auth.jwt() ->> 'tenant_role';

  -- Sem sessao autenticada de verdade ou sem tenant_id no claim: vazio.
  if auth.uid() is null or v_tenant_id is null then
    return;
  end if;

  -- Autorizacao: equipe interna do tenant sempre pode; investidor do tenant
  -- so se tiver vinculo ativo no projeto; qualquer outro papel, nao.
  if not (
    v_tenant_role in ('admin', 'comercial', 'administrativo')
    or (v_tenant_role = 'investidor' and public.investor_has_stake_in_project(p_project_id))
  ) then
    return;
  end if;

  -- Projeto precisa existir, no MESMO tenant do claim (nunca de outro
  -- tenant, mesmo rodando com privilegio de dono).
  select p.* into v_project
    from public.projects p
    where p.id = p_project_id
      and p.tenant_id = v_tenant_id
      and p.is_deleted = false;

  if not found then
    return;
  end if;

  -- receivedRevenue: soma de deals.final_sale_value, so 'vendido', so
  -- deals ativos (nao excluidos) -- mesmo filtro ja aplicado por toda tela
  -- do produto antes de chamar calculateProjectResults (ver comentario da
  -- migration).
  select coalesce(sum(d.final_sale_value), 0)
    into v_received_revenue
    from public.deals d
    where d.project_id = p_project_id
      and d.tenant_id = v_tenant_id
      and d.sales_stage = 'vendido'
      and d.final_sale_value is not null
      and d.is_deleted = false;

  -- salesCosts: soma de commissions.gross_value (fallback base_value),
  -- so comissoes ativas (nao excluidas).
  select coalesce(sum(coalesce(c.gross_value, c.base_value)), 0)
    into v_sales_costs
    from public.commissions c
    where c.project_id = p_project_id
      and c.tenant_id = v_tenant_id
      and c.is_deleted = false;

  v_net_vgv := v_received_revenue - v_sales_costs;
  v_total_costs := v_project.total_construction_cost + v_project.total_indirect_costs;
  v_net_result := v_net_vgv - v_total_costs;
  v_margin := case when v_received_revenue > 0
    then (v_net_result / v_received_revenue) * 100
    else 0
  end;

  return query
    select
      p_project_id,
      v_received_revenue,
      v_sales_costs,
      v_net_vgv,
      v_project.total_construction_cost,
      v_project.total_indirect_costs,
      v_total_costs,
      v_net_result,
      v_margin;
end;
$$;

comment on function public.get_project_operational_result(uuid) is
  'SECURITY DEFINER: Resultado Operacional agregado (receita, custos, lucro '
  'liquido, margem) de UM projeto, replicando '
  'src/features/investors/resultHelpers.ts (calculateProjectResults). '
  'Bypassa RLS de deals/commissions de proposito -- nenhuma policy de '
  'SELECT existe para tenant_role=investidor nessas 2 tabelas (dado '
  'comercial granular demais para expor linha a linha a um investidor '
  'externo) -- ver racional completo no topo de '
  '0056_investor_operational_result.sql. Autorizacao interna: equipe '
  'interna do tenant sempre; investidor do tenant so com vinculo ativo em '
  'project_investors para o projeto (investor_has_stake_in_project, 0055); '
  'qualquer outro caso retorna 0 linhas (nunca erro, nunca linha de outro '
  'projeto/tenant).';

-- Funcao nasce com EXECUTE liberado para PUBLIC por padrao -- revogado e
-- reconcedido so para `authenticated` (mesmo padrao de 0002/0005/0051/0055).
-- `anon` nunca deve poder chamar isto.
revoke execute on function public.get_project_operational_result(uuid) from public, anon;
grant execute on function public.get_project_operational_result(uuid) to authenticated;

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role`: nenhuma Edge Function deste modulo existe hoje
-- -- mesma ressalva de 0045/0051/0055.
--
-- Ver supabase/tests/0056_investor_operational_result_isolation.sql para o
-- teste (a) autorizacao por papel/vinculo, (b) valor batendo com calculo
-- manual, (c) regressao dos testes antigos de 0045.
