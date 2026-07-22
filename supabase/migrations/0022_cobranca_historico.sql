-- 0022_cobranca_historico.sql
-- Financeiro: `cobranca_historico` — registro de ações de régua de
-- cobrança sobre uma parcela em atraso (do original
-- `src/pages/InadimplenciaManager.jsx`, e das funções de backend
-- `dailyEscalonamentoCobranca`/`inadimplenciaAutomation`, que só geram
-- registros — o escalonamento automático em si é cron/Edge Function, fora
-- de escopo desta leva, confirmado com o usuário).
--
-- `acao`: enum tem 5 valores, não 4 — o levantamento inicial listava
-- `lembrete_amigavel`/`primeira_cobranca`/`segunda_cobranca`/
-- `cobranca_formal` (confirmados em `dailyEscalonamentoCobranca`/
-- `inadimplenciaAutomation`), mas `InadimplenciaManager.jsx`
-- (`registrarAcaoMutation`) também grava `acao: 'MANUAL'` toda vez que o
-- usuário clica em Email/WhatsApp/Ligação/"Registrar Ação" no dialog — é o
-- valor de `acao` de fato usado pela única tela manual em escopo, não só um
-- rótulo de UI. Adicionado ao enum como `manual`.
--
-- `canal`: texto livre, não enum — confirmado em `inadimplenciaAutomation`
-- (`entry.ts`), que grava `canal: rule.canal.join(',')` (ex:
-- "EMAIL,WHATSAPP", lista variável de canais numa só string) e `canal:
-- 'sistema'` em `dailyEscalonamentoCobranca`; `InadimplenciaManager.jsx`
-- grava `canal: 'MANUAL'`. Sem lista fixa de valores no original.
--
-- `NEGATIVACAO` (aparece só como rótulo em `acaoLabels` de
-- `InadimplenciaManager.jsx`, nunca gravado por nenhum `.create(...)`) NÃO
-- incluído no enum — rótulo morto no original, sem código que efetivamente
-- crie um registro com essa ação.
--
-- Soft-delete padrão (`docs/SCHEMA_PLAN.md`): confirmado em uso na leitura
-- (`InadimplenciaManager.jsx`: `!h.is_deleted`, `dailyEscalonamentoCobranca`/
-- `inadimplenciaAutomation`: filtro `is_deleted: false` antes de decidir se
-- uma ação já foi executada). Nenhum fluxo do original efetivamente chama
-- `.update(...)`/soft-delete em `CobrancaHistorico`, mas a leitura já
-- depende do campo existir — mantido o padrão completo (auditoria +
-- updated_at) por consistência com as demais tabelas desta leva, não só o
-- flag `is_deleted`.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa), com teste de isolamento correspondente — igual ao padrão
-- de 0001/0010/0017.

-- 1. Enums.
create type cobranca_acao as enum (
  'lembrete_amigavel',
  'primeira_cobranca',
  'segunda_cobranca',
  'cobranca_formal',
  'manual'
);

create type cobranca_status as enum (
  'aguardando',
  'enviado'
);

-- 2. cobranca_historico
create table cobranca_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  installment_id uuid not null references payment_installments(id),

  acao cobranca_acao not null,
  canal text,
  data_execucao timestamptz not null,
  status cobranca_status not null default 'aguardando',
  observacoes text,

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

comment on table cobranca_historico is
  'Registro de ações de régua de cobrança sobre uma parcela em atraso — '
  'criado manualmente (InadimplenciaManager.jsx) ou por automação futura '
  '(dailyEscalonamentoCobranca/inadimplenciaAutomation, fora de escopo '
  'nesta leva). canal é texto livre (pode ser lista "EMAIL,WHATSAPP").';

comment on column cobranca_historico.acao is
  'lembrete_amigavel/primeira_cobranca/segunda_cobranca/cobranca_formal '
  '(régua automática) + manual (ação registrada pelo usuário em '
  'InadimplenciaManager.jsx) — 5 valores confirmados no código-fonte.';

-- 3. Índices compostos (docs/SCHEMA_PLAN.md secao 4 + task).
create index cobranca_historico_tenant_id_installment_id_idx
  on cobranca_historico (tenant_id, installment_id);

-- Não pedido explicitamente na leva, mas mesmo padrão de payment_installments:
-- status é usado para diferenciar ações aguardando envio vs já enviadas.
create index cobranca_historico_tenant_id_status_idx
  on cobranca_historico (tenant_id, status);

-- 4. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_cobranca_historico_updated_at
  before update on cobranca_historico
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0011: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`.
-- ---------------------------------------------------------------------
grant select, insert, update on public.cobranca_historico to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `cobranca_historico` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela.
-- ---------------------------------------------------------------------
