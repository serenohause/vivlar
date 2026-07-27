-- 0057_public_leads.sql
-- Espelho de Vendas: `public_leads` — registra toda submissão do formulário
-- público do site de vendas (`original-project/src/components/espelho/
-- LeadForm.jsx`), nos 3 intents: RESERVA (trava a unidade por N horas),
-- INTERESSE (só lead) e LISTA_ESPERA (avisar quando a unidade voltar a
-- ficar disponível). Confirmado em `docs/DOMAIN_MAP.md` (seção `PublicLead`)
-- e no `.jsonc` de entidade original.
--
-- tenant_id: caso especial deste módulo. Quem cria a linha é `anon` — o
-- visitante do site público, sem sessão e sem claim de tenant no JWT (o
-- padrão do resto do sistema, tenant_id vindo de `(auth.jwt() ->>
-- 'tenant_id')::uuid`, não se aplica aqui). O valor correto de tenant_id
-- precisa ser resolvido a partir do `project_id` informado no payload (todo
-- `project` já carrega seu próprio tenant_id) — essa resolução é
-- responsabilidade da função/RPC `security definer` que o `rls-guardian`
-- escreve na próxima etapa; ela é o único caminho de escrita nesta tabela
-- para o público. Esta migration só declara a constraint `not null`, sem
-- default e sem grant de insert direto a `anon` (ver seção de grants
-- abaixo).
--
-- Enums em minúsculo (`reserva`/`interesse`/`lista_espera`,
-- `novo`/`contatado`/.../`expirado`): o original usa maiúsculo
-- (`RESERVA`, `NOVO`, ...), mas mantém a convenção já estabelecida no
-- schema novo (ver `deal_sales_stage`, `status_transition_type` em
-- 0014/0016) — tradução de valor fica a cargo da aplicação, não do banco.
--
-- reserva_expira_em como timestamptz (não date): LeadForm.jsx calcula um
-- instante exato (`Date.now() + horas * 3600000`), e o `.jsonc` original
-- declara `format: date-time` para este campo — mantido timestamptz para
-- não perder precisão de hora/minuto, apesar do nome da coluna do original
-- (`deals.reserved_until`, ver 0014, também é timestamptz pelo mesmo
-- motivo).
--
-- contatado_em / contatado_por_user_id / notas_internas: colunas de
-- preenchimento futuro, lado admin — nenhuma tela de gestão de leads existe
-- no original ainda (confirmado por grep em `original-project/src`:
-- `PublicLead` só aparece em `LeadForm.jsx` e no `.jsonc` de entidade,
-- nenhuma página/CRM/Dashboard referencia leitura/gestão de leads). Isso é
-- um débito técnico do produto a documentar (não existe tela "Leads" para
-- a equipe interna trabalhar o funil de captação pública), não um problema
-- de schema desta migration.
--
-- unit_id NULLABLE: confirmado em LeadForm.jsx/DOMAIN_MAP.md — um lead pode
-- existir sem unidade específica (fluxo de INTERESSE genérico no projeto).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do `rls-guardian`
-- (próxima etapa) — inclui a policy de create pública (via RPC/security
-- definer, não grant direto de insert a `anon`) e as policies de
-- read/update/delete restritas à equipe interna do tenant, com teste de
-- isolamento correspondente, igual ao padrão de 0001/0010.

-- 1. Enum de intenção do lead.
create type public_lead_intent as enum (
  'reserva',
  'interesse',
  'lista_espera'
);

-- 2. Enum de status no funil de leads públicos.
create type public_lead_status as enum (
  'novo',
  'contatado',
  'qualificado',
  'convertido',
  'descartado',
  'expirado'
);

-- 3. public_leads
create table public_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos
  project_id uuid not null references projects(id),
  unit_id uuid references units(id),

  -- Dados do formulário (LeadForm.jsx)
  nome text not null,
  telefone text not null,
  email text,
  cpf text,

  -- Classificação
  intent public_lead_intent not null default 'interesse',
  status public_lead_status not null default 'novo',

  -- Reserva temporária (apenas intent = 'reserva')
  reserva_expira_em timestamptz,

  -- Conversão
  converted_to_deal_id uuid references deals(id),
  converted_to_client_id uuid references clients(id),

  -- Rastreamento/origem
  utm_source text,
  utm_medium text,
  utm_campaign text,
  origem text not null default 'espelho_vendas',
  ip_address text,
  user_agent text,
  mensagem text,

  -- Trabalho do funil (preenchimento futuro, lado admin — sem tela ainda)
  contatado_em timestamptz,
  contatado_por_user_id uuid references auth.users(id),
  notas_internas text,

  -- Soft delete
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id),

  -- Auditoria. created_by_user_id fica NULL na prática (quem cria é anon,
  -- sem auth.uid()) — mantido só por consistência estrutural com o resto
  -- do schema, sem uso real nesta tabela.
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public_leads is
  'Submissão do formulário público do espelho de vendas (LeadForm.jsx) — '
  'intents reserva/interesse/lista_espera. tenant_id resolvido a partir de '
  'project_id pela RPC de criação (rls-guardian), não de claim de JWT: quem '
  'insere é anon. Sem tela de gestão/leitura no original — débito técnico '
  'de produto, não desta migration.';

comment on column public_leads.tenant_id is
  'Resolvido a partir de project_id no momento da criação (não vem de '
  'claim de JWT — quem cria é anon, sem sessão). Resolução e insert ficam '
  'na função/RPC security definer do rls-guardian.';

comment on column public_leads.cpf is
  'Nullable: só obrigatório (validado na aplicação) quando intent = '
  'reserva. Nos demais intents fica vazio.';

comment on column public_leads.reserva_expira_em is
  'Instante em que a reserva temporária expira. Preenchido apenas quando '
  'intent = reserva (horas configuráveis em projects.reserva_horas).';

comment on column public_leads.contatado_por_user_id is
  'Preenchimento futuro, lado admin — nenhuma tela de gestão de leads '
  'existe ainda no original nem foi pedida nesta leva.';

-- 4. Índices compostos (tenant_id primeiro, padrão do projeto).
create index public_leads_tenant_id_project_id_idx
  on public_leads (tenant_id, project_id);

create index public_leads_tenant_id_unit_id_idx
  on public_leads (tenant_id, unit_id);

create index public_leads_tenant_id_status_idx
  on public_leads (tenant_id, status);

create index public_leads_tenant_id_created_at_idx
  on public_leads (tenant_id, created_at);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_public_leads_updated_at
  before update on public_leads
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0011: nao confiar no
-- default privilege do schema. `authenticated` recebe select/insert/update
-- (lado admin, quando a tela existir). Nada concedido a `anon` aqui de
-- proposito -- mesma decisao ja registrada em 0010_rls_catalog.sql: o
-- caminho de escrita publica e uma funcao/RPC security definer (proxima
-- etapa, rls-guardian), nao um grant geral de insert na tabela.
-- ---------------------------------------------------------------------
grant select, insert, update on public.public_leads to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `public_leads` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa -- inclui a funcao/RPC de criacao publica (resolvendo tenant_id a
-- partir de project_id) e as policies de select/update/delete restritas a
-- equipe interna do tenant, com teste de isolamento correspondente, antes
-- de qualquer dado real trafegar por esta tabela.
-- ---------------------------------------------------------------------
