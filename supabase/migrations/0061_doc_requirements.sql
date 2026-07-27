-- 0061_doc_requirements.sql
-- Configuração de gate documental (aba "Documentos" de Settings.jsx):
-- `doc_requirements` — define quais `document_type` são obrigatórios em
-- cada etapa do pipeline `admin_status` das unidades, para travar/liberar
-- o avanço de status. No original isso era `REQUIRED_DOCS_BY_STATUS`, uma
-- constante hardcoded em código (mesma para todas as construtoras); aqui
-- vira configurável por tenant.
--
-- SEM soft-delete: tabela de configuração pequena — remover um requisito é
-- remover mesmo (mesmo comportamento do botão de lixeira do original, que
-- já fazia DELETE de verdade). Único caso, junto com `tenant_invites`
-- (que usa status em vez de exclusão), em que este projeto não segue a
-- convenção geral de soft-delete-sempre-presente das demais tabelas de
-- negócio.
--
-- unique (tenant_id, admin_status, doc_type): não faz sentido duplicar o
-- mesmo requisito. Como não é parcial (não há is_deleted), o índice
-- implícito dessa constraint já começa em tenant_id e cobre também
-- consultas por (tenant_id, admin_status) sozinho — não é criado um
-- índice separado redundante para esse prefixo.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente.

-- 1. doc_requirements
create table doc_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  admin_status unit_admin_status not null,
  doc_type document_type not null,

  created_at timestamptz not null default now(),

  unique (tenant_id, admin_status, doc_type)
);

comment on table doc_requirements is
  'Configuração, por tenant, de quais document_type são obrigatórios em '
  'cada unit_admin_status — gate de avanço do pipeline administrativo. '
  'Substitui a constante hardcoded REQUIRED_DOCS_BY_STATUS do original. '
  'Sem soft-delete: remover o requisito é DELETE de verdade, mesmo '
  'comportamento do botão de lixeira original.';

comment on column doc_requirements.admin_status is
  'Etapa do pipeline administrativo (unit_admin_status, 0008_units.sql) '
  'em que este doc_type passa a ser exigido para avançar.';

-- ---------------------------------------------------------------------
-- Grants explicitos. Unico caso ate agora neste projeto com delete real
-- concedido a `authenticated` (sem soft-delete, ver nota no topo do
-- arquivo) — nao confiar no default privilege do schema.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.doc_requirements to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `doc_requirements` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Como o delete e real (nao soft-delete),
-- a policy de delete precisa existir explicitamente (nao basta a
-- ausencia de policy negar por padrao ser suficiente, como acontece nas
-- demais tabelas soft-delete) — restrita a admin do tenant certo.
-- ---------------------------------------------------------------------
