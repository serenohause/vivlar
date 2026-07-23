-- 0046_project_operational_result_costs.sql
-- Preenche a lacuna deixada intencionalmente em 0007_projects.sql (linhas
-- 2-7): "Resultado Operacional (`total_construction_cost`/
-- `total_indirect_costs`, aba financeira do projeto — módulo futuro)".
-- Esse módulo futuro é agora — o Dashboard de Investidores (Módulo 10,
-- `src/features/investors/resultHelpers.ts`) precisa desses dois valores
-- para calcular o Resultado Operacional real do projeto; sem eles, o
-- cálculo só desconta comissão e mostra lucro artificialmente alto.
--
-- Confirmado contra o original
-- (`original-project/src/components/project/resultadoOperacional/
-- resultadoHelpers.jsx`, linhas 24-28): ambos os campos são preenchidos
-- manualmente pela equipe (não calculados a partir de outra tabela), daí
-- serem colunas simples em `projects`, não uma tabela separada.
--
-- Tipo/precisão: numeric(14, 2), igual às demais colunas monetárias já
-- existentes em `projects` (entrada_min, valor_min, valor_max,
-- parcela_aprox, subsidio_aprox — 0007_projects.sql linhas 69-73) e a
-- `investment_contributions.valor` (0043_investment_contributions.sql).
--
-- `not null default 0`: nenhum projeto existente tem esses valores hoje
-- (coluna nova); default 0 evita quebrar linhas já cadastradas e reflete
-- "custo ainda não lançado", não NULL/desconhecido.
--
-- RLS/GRANTS: NÃO precisam de ajuste. `projects` já tem RLS habilitada
-- desde 0010_rls_catalog.sql, com policy de UPDATE
-- (`projects_update_tenant_team`) que filtra por linha
-- (tenant_id + tenant_role), sem qualquer referência a coluna específica —
-- RLS no Postgres opera sobre linhas, não colunas. O grant concedido em
-- 0007_projects.sql (`grant select, insert, update on public.projects to
-- authenticated;`) também não tem lista de colunas, então cobre
-- automaticamente as duas colunas novas (comportamento padrão do Postgres:
-- um grant de tabela sem `(coluna, ...)` vale para todas as colunas,
-- inclusive as adicionadas depois). Confirmado que este projeto não usa
-- column-level grants em nenhuma migration existente.
alter table public.projects
  add column total_construction_cost numeric(14, 2) not null default 0,
  add column total_indirect_costs numeric(14, 2) not null default 0;

comment on column public.projects.total_construction_cost is
  'Custo total da obra, valor digitado manualmente pela equipe (não '
  'calculado). Usado no Resultado Operacional do projeto (Dashboard de '
  'Investidores, src/features/investors/resultHelpers.ts).';

comment on column public.projects.total_indirect_costs is
  'Custos indiretos do projeto, valor digitado manualmente pela equipe '
  '(não calculado). Usado no Resultado Operacional do projeto (Dashboard '
  'de Investidores, src/features/investors/resultHelpers.ts).';
