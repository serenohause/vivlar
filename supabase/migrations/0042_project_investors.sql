-- 0042_project_investors.sql
-- Vínculo investidor↔projeto: `project_investors` — quanto um investidor
-- aportou em um projeto específico e qual seu percentual de participação
-- no resultado (do original `src/pages/InvestorDetail.jsx`,
-- `InvestorDashboard.jsx`, `InvestorProjectDetail.jsx`,
-- `src/components/shared/services/projectService.jsx`;
-- docs/DOMAIN_MAP.md seção "ProjectInvestor").
--
-- ACHADO IMPORTANTE: no código original esta entidade NUNCA é criada por
-- nenhuma tela — só lida via `.filter()`/`.list()` nos 4 arquivos acima
-- (grep confirmado, nenhum `ProjectInvestor.create(...)` em todo o `src`).
-- Aparentemente era escrita direto no banco pela equipe técnica do Base44.
-- Como não há esse acesso na plataforma nova, o módulo de frontend desta
-- feature PRECISA construir a tela de criação/edição deste vínculo, senão
-- a feature de investidores fica inutilizável — registrado aqui para quem
-- for construir o `frontend-builder` desta feature.
--
-- `nome_exibicao`: como o investidor aparece nesse projeto especificamente
-- (pode diferir do `investors.nome` cadastral) — confirmado em uso em
-- InvestorDetail.jsx linha 134 e InvestorDashboard.jsx linha 479.
--
-- `valor_aportado`: confirmado em uso em InvestorDetail.jsx linha 136.
--
-- `percentual_participacao`: % de participação no resultado do projeto
-- (0-100), usado em `calculateInvestorShare`
-- (src/components/investment/investmentResultHelpers.jsx) para recortar o
-- resultado operacional do projeto na fatia do investidor. Constraint de
-- faixa (0-100) adicionada no banco, já que o valor é sempre um percentual.
--
-- NOTA sobre `calculateParticipationPercentages`: o original tem uma
-- função auxiliar (mesmo arquivo investmentResultHelpers.jsx) que recalcula
-- `percentual_participacao` de todos os investidores de um projeto a
-- partir do `valor_aportado` de cada um (proporcional ao total investido).
-- Ela NÃO está conectada a nenhum `.update(...)` real em todo o `src`
-- (grep confirmado) — código morto/órfão no original, igual a outros casos
-- já registrados neste projeto (ex.: KPI órfão em 0024). Decisão: não virou
-- trigger nem constraint aqui — `percentual_participacao` continua sendo um
-- valor editável manualmente por quem cadastra/edita o vínculo. Fica
-- registrado como candidato a virar um botão "Recalcular automaticamente"
-- no hook/UI futura desta tela (não uma regra de banco, já que o produto
-- pode querer permitir percentuais que não somam 100%, ex.: participação
-- fora do capital aportado).
--
-- `unique(tenant_id, project_id, investor_id) where not is_deleted`: mesmo
-- critério de "1 registro ativo por combinação" já usado em `commissions`
-- (0024, `unique(tenant_id, deal_id) where not is_deleted`) — evita vínculo
-- duplicado do mesmo investidor no mesmo projeto.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente.

-- 1. project_investors
create table project_investors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  project_id uuid not null references projects(id),
  investor_id uuid not null references investors(id),

  nome_exibicao text not null,
  valor_aportado numeric(14, 2) not null default 0,
  percentual_participacao numeric(5, 2) not null default 0
    constraint project_investors_percentual_participacao_range
    check (percentual_participacao >= 0 and percentual_participacao <= 100),

  -- Soft delete
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  -- Auditoria
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table project_investors is
  'Vínculo investidor↔projeto: quanto um investidor aportou em um projeto '
  'específico e seu percentual de participação no resultado. ACHADO: no '
  'original nenhuma tela cria este registro (só list/filter) — o frontend '
  'desta feature precisa construir a tela de criação/edição, senão o '
  'módulo de investidores fica inutilizável.';

comment on column project_investors.nome_exibicao is
  'Como o investidor aparece nesse projeto especificamente (pode diferir '
  'de investors.nome) — confirmado em InvestorDetail.jsx/'
  'InvestorDashboard.jsx.';

comment on column project_investors.percentual_participacao is
  'Percentual de participação no resultado do projeto (0-100), usado em '
  'calculateInvestorShare. Editável manualmente — a função auxiliar do '
  'original que recalcularia isso automaticamente a partir de '
  'valor_aportado (calculateParticipationPercentages) é código morto no '
  'original, não virou trigger/constraint aqui. Ver nota completa no topo '
  'do arquivo.';

-- 2. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index project_investors_tenant_id_created_at_idx
  on project_investors (tenant_id, created_at);

create index project_investors_tenant_id_project_id_idx
  on project_investors (tenant_id, project_id);

create index project_investors_tenant_id_investor_id_idx
  on project_investors (tenant_id, investor_id);

-- 3. Índice único parcial: no máximo 1 vínculo ativo (não excluído) por
--    par projeto/investidor, por tenant. Ver justificativa no comentário
--    do topo do arquivo.
create unique index project_investors_tenant_id_project_investor_uidx
  on project_investors (tenant_id, project_id, investor_id)
  where not is_deleted;

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_project_investors_updated_at
  before update on project_investors
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030/0034/0037/
-- 0041: nao confiar no default privilege do schema, conceder select/
-- insert/update explicitamente a `authenticated`, nada a `anon`. Sem
-- delete: exclusao e sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.project_investors to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `project_investors` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Mesmo padrao esperado de 0017/0027/0032/
-- 0036/0039: select/insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera investidores no produto real), sem delete.
-- ---------------------------------------------------------------------
