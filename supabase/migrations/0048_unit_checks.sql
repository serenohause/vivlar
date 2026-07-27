-- 0048_unit_checks.sql
-- Portal do Cliente (módulo 11): `unit_checks` — checklist interno de
-- verificações obrigatórias por etapa do pipeline `admin_status` de uma
-- unidade (do original `src/pages/UnitDetail.jsx`, seção "Verificações
-- Internas (Checks)", e lido também por `src/components/unit/
-- UnitTimeline.jsx`, reaproveitado sem mudança no Portal do Cliente via
-- `ClientPortal.jsx`).
--
-- CORREÇÃO DE UM DÉBITO REGISTRADO ERRADO: `docs/ARCHITECTURE.md` (débito
-- técnico do módulo 4) afirma que "`unit_checks` não foi criada — nenhuma
-- tela do original de fato o usa hoje". Conferido agora, linha a linha, em
-- `UnitDetail.jsx`: NÃO é órfã — `createCheckMutation`/`updateCheckMutation`
-- (linhas 274-286) e `toggleCheck` (linhas 329-350) criam/atualizam
-- `UnitCheck` de verdade, e `checkCanAdvance` (linhas 310-327) usa o
-- resultado para BLOQUEAR o avanço de `admin_status` quando falta um check
-- obrigatório (mesmo gate que já existe para documentos obrigatórios,
-- débito ainda pendente do módulo 3). Essa afirmação em ARCHITECTURE.md
-- precisa ser corrigida numa próxima passada de auditoria de docs — fora do
-- escopo desta migration (só schema).
--
-- ESCOPO DESTA MIGRATION: só a tabela. A tela `UnitDetail.jsx` (módulo 3,
-- já em produção) NÃO ganha o botão "Confirmar OK"/toggle de check nesta
-- rodada — isso é trabalho de frontend, fora do escopo do subagente
-- schema-architect. Criar a tabela agora serve para: (1) fechar o débito de
-- schema corretamente documentado acima, e (2) permitir que o Portal do
-- Cliente (`ClientPortal.jsx` -> `UnitTimeline.jsx`) leia o estado real dos
-- checks, em vez de sempre uma lista vazia.
--
-- INCONSISTÊNCIA DE NOMES DE CAMPO NO PRÓPRIO ORIGINAL (mesma classe de
-- achado já registrada para Activity/Notification em `docs/ARCHITECTURE.md`
-- -- "Decisões de limpeza"): `UnitDetail.jsx` ESCREVE com
-- `check_code`/`status` (PENDENTE/CONCLUIDO)/`completed_at`/
-- `required_for_status`, mas `UnitTimeline.jsx` (`checkHasCheck`, linha
-- 158-160) LÊ com `check_type`/`is_checked` — nomes que a escrita real
-- nunca preenche. É bug morto no original: a seção "Verificações" da
-- timeline nunca reflete o check de verdade. `docs/DOMAIN_MAP.md` (linha
-- 98-102) já documenta `check_code`/`required_for_status`/`status`/
-- `completed_at` como os campos reais (conferidos contra o código que
-- efetivamente grava dado) — são os adotados aqui como canônicos. Quando o
-- `frontend-builder` portar `UnitTimeline.jsx` para o Portal do Cliente,
-- precisa mapear `checkHasCheck` para `check_code` + `status = 'concluido'`
-- em vez de `check_type`/`is_checked`, ou a seção de checks da timeline
-- fica sempre vazia (replicando o bug, não a intenção real da feature).
--
-- `check_code`: texto livre, não enum. Só 1 valor existe hoje em todo o
-- `original-project` (`CONF_CORRESPONDENTE_OK`, ver `UNIT_CHECKS` em
-- `src/components/shared/Constants.jsx`) — vocabulário claramente
-- incompleto/em early-stage (`REQUIRED_CHECKS_BY_STATUS` tem array vazio
-- para quase toda etapa do pipeline). Mesmo critério já usado para
-- `maintenance_requests.category`/`inspection_template_items.category`:
-- vocabulário pequeno e sugerido na UI, mas não enumerado no banco, porque
-- claramente vai crescer por edição direta de código, não por um domínio
-- fechado.
--
-- `required_for_status`: DIFERENTE do critério de `status_transitions.
-- to_status` (texto livre lá porque a coluna serve dois domínios
-- diferentes conforme `transition_type`). Aqui só existe um domínio
-- possível (`unit_admin_status`, já existe desde 0008) — usa o enum
-- diretamente, ganhando integridade referencial de graça.
--
-- Soft delete: sem `UnitCheck.delete(...)` confirmado em `src` (só
-- create/update), mas `UnitTimeline.jsx` já lê `!c.is_deleted` na condição
-- de `checkHasCheck` — o campo existe na entidade mesmo sem UI de exclusão
-- ainda, mesmo padrão de soft-delete-sempre-presente já adotado em toda
-- tabela de negócio deste projeto (CLAUDE.md).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/0017/0023/0027/0032/0036/0039/0045.

-- 1. Enum de status do check. 2 valores confirmados em UnitDetail.jsx
--    (toggleCheck, checkCanAdvance): PENDENTE, CONCLUIDO.
create type unit_check_status as enum (
  'pendente',
  'concluido'
);

-- 2. unit_checks
create table unit_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  unit_id uuid not null references units(id),

  -- Texto livre — ver comentário no topo do arquivo (vocabulário pequeno,
  -- definido em código-fonte, não um domínio fechado).
  check_code text not null,

  -- Reaproveita o enum de admin_status já existente (0008) — aqui só
  -- existe um domínio possível, diferente de status_transitions.to_status.
  required_for_status unit_admin_status not null,

  status unit_check_status not null default 'pendente',
  completed_at timestamptz,

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

comment on table unit_checks is
  'Checklist interno de verificações obrigatórias por etapa do pipeline '
  'admin_status de uma unidade (UnitDetail.jsx, seção "Verificações '
  'Internas"). Não é órfã: gate real para avançar admin_status (mesmo '
  'papel de documents.status = aprovado/recebido). Campos canônicos são os '
  'que UnitDetail.jsx efetivamente escreve (check_code/status/'
  'completed_at/required_for_status) — UnitTimeline.jsx lê com nomes '
  'diferentes (check_type/is_checked) que nunca batem com o que é gravado, '
  'bug morto no original, não replicado aqui como verdade de schema.';

comment on column unit_checks.check_code is
  'Texto livre, não enum — só 1 valor existe hoje no original '
  '(CONF_CORRESPONDENTE_OK, UNIT_CHECKS em Constants.jsx), vocabulário '
  'claramente incompleto/em expansão, mesmo critério de category em '
  'maintenance_requests/inspection_template_items.';

comment on column unit_checks.required_for_status is
  'Reaproveita unit_admin_status (0008) em vez de texto livre — diferente '
  'de status_transitions.to_status, aqui só existe um domínio possível.';

-- 3. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index unit_checks_tenant_id_created_at_idx
  on unit_checks (tenant_id, created_at);

create index unit_checks_tenant_id_unit_id_idx
  on unit_checks (tenant_id, unit_id);

create index unit_checks_tenant_id_status_idx
  on unit_checks (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_unit_checks_updated_at
  before update on unit_checks
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/.../0037/0041: nao confiar
-- no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.unit_checks to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `unit_checks` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela. Mesmo padrao esperado de 0017/.../0039/0045: select restrito
-- ao tenant certo via claim (inclusive role `cliente`, que só deve
-- enxergar checks da própria unidade — via join client->deal->unit, não
-- via FK direta); insert/update restrito a quem opera o pipeline
-- administrativo (`admin`/`administrativo`, a confirmar com o produto),
-- sem delete.
-- ---------------------------------------------------------------------
