-- 0030_documents.sql
-- Documentos: `documents` — gestão documental MCMV (do original
-- `src/pages/Documents.jsx`, `src/components/unit/DocumentChecklist.jsx`,
-- usado também em `UnitDetail.jsx` e `DealDetail.jsx`). Documento é o
-- produto deste módulo (ao contrário de `comprovante_url` em
-- payment_installments/commission_payments, que era campo incidental de
-- texto) — upload real via Supabase Storage configurado em
-- 0031_documents_storage.sql (bucket `documents`).
--
-- `project_id`/`unit_id`/`deal_id` NULLABLE: confirmado em Documents.jsx
-- (`project_id`/`unit_id` no formData, unit "opcional") e no fato de que
-- nenhuma dessas 3 FKs é sempre preenchida — UnitDetail.jsx cria documentos
-- com project_id+unit_id (sem deal_id); Documents.jsx cria só com
-- project_id (unit_id opcional); DealDetail.jsx só LÊ via
-- `Document.filter({ deal_id })` — não há nenhum `Document.create(...)`
-- com `deal_id` no payload em todo o `src` (grep confirmado), mas a coluna
-- é mantida (mesmo critério já usado para campos com read path confirmado
-- e sem write path localizado no export, ex.: `commissions.paid_at` em
-- 0024) porque a tela de detalhe do negócio depende dela para listar os
-- documentos vinculados.
--
-- `doc_type`: enum com os 23 valores de `DOC_TYPES` em
-- `src/components/shared/Constants.jsx`, convertidos para snake_case
-- minúsculo (ex.: `LAUDO_ENG` -> `laudo_eng`). Comentários abaixo agrupam
-- por categoria original (ENGENHARIA/CAIXA/CARTORIO/REGISTRO/ENTREGA/
-- DISTRATO/OUTROS) só como referência de leitura — a categoria em si não
-- vira coluna (não há write/filter por categoria em nenhuma tela).
--
-- `status`: DIVERGE do rascunho inicial da tarefa (que listava só
-- `recebido`/`aprovado`/`rejeitado`, mesmo texto desatualizado que está em
-- `docs/DOMAIN_MAP.md` e `docs/SCHEMA_PLAN.md`). Conferido diretamente no
-- código-fonte (não confiado de cabeça, conforme pedido): `DOC_STATUS_CONFIG`
-- em `src/components/shared/StatusBadge.jsx` define 4 valores —
-- `PENDENTE`, `RECEBIDO`, `APROVADO`, `REJEITADO` — e `Documents.jsx` expõe
-- os 4 tanto no filtro de listagem quanto no Select de edição do dialog
-- (`RECEBIDO` é só o default do formulário de criação, não o único valor
-- possível). `docs/DOMAIN_MAP.md`/`SCHEMA_PLAN.md` ficaram desatualizados
-- nesse ponto — devem ser corrigidos numa próxima passada de auditoria de
-- docs, fora do escopo desta migration.
--
-- `file_url`/`file_name` NULLABLE: confirmado em Documents.jsx —
-- `handleSubmit` permite criar/editar o registro sem `selectedFile` (o
-- dialog não bloqueia submit por falta de arquivo, só por
-- project_id/doc_type/title ausentes). Upload pode acontecer depois, via
-- edição do mesmo registro.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/0017/0024/0027.

-- 1. Enum de tipo de documento (23 valores, DOC_TYPES em Constants.jsx).
create type document_type as enum (
  -- ENGENHARIA
  'laudo_eng',

  -- CAIXA
  'form_caixa_assinado',
  'contrato_caixa_assinado',

  -- CARTORIO
  'itbi',
  'certidao_negativa',
  'validacao_assinatura_gov',

  -- REGISTRO
  'comprov_registro_pago',
  'matricula_averbada',
  'contrato_caixa_selo_cartorio',

  -- ENTREGA
  'termo_vistoria',
  'termo_entrega',

  -- DISTRATO
  'termo_distrato',

  -- OUTROS
  'matricula_imovel',
  'rg_cpf_cliente',
  'comprovante_renda',
  'comprovante_residencia',
  'certidao_casamento',
  'extrato_fgts',
  'declaracao_ir',
  'escritura',
  'averbacao',
  'habite_se',
  'outros'
);

-- 2. Enum de status do documento. 4 valores confirmados via
--    StatusBadge.jsx/Documents.jsx (ver comentário no topo do arquivo).
create type document_status as enum (
  'pendente',
  'recebido',
  'aprovado',
  'rejeitado'
);

-- 3. documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos (todos opcionais — ver comentário no topo do arquivo)
  project_id uuid references projects(id),
  unit_id uuid references units(id),
  deal_id uuid references deals(id),

  doc_type document_type not null,
  title text not null,
  notes text,

  issued_at date,
  received_at date,

  status document_status not null default 'recebido',

  -- Upload real via Supabase Storage (bucket `documents`, ver
  -- 0031_documents_storage.sql). file_url guarda o path no bucket (não URL
  -- pública — o bucket é privado), file_name o nome original do arquivo.
  file_url text,
  file_name text,

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

comment on table documents is
  'Documento do módulo de gestão documental MCMV. project_id/unit_id/'
  'deal_id são todos opcionais (contexto varia por tela de origem — '
  'Documents.jsx, UnitDetail.jsx, DealDetail.jsx). file_url guarda o path '
  'do objeto no bucket privado `documents` do Storage (0031), não uma URL '
  'pública.';

comment on column documents.status is
  '4 valores (pendente/recebido/aprovado/rejeitado), confirmados via '
  'DOC_STATUS_CONFIG em StatusBadge.jsx — diverge do rascunho inicial de '
  'docs/DOMAIN_MAP.md e docs/SCHEMA_PLAN.md (que listavam só 3, sem '
  'pendente), que ficaram desatualizados nesse ponto.';

comment on column documents.deal_id is
  'Nullable, sem write path confirmado em Document.create(...) no `src` '
  'exportado (grep confirmado) — só leitura via Document.filter({ deal_id '
  '}) em DealDetail.jsx. Mantida a coluna porque a tela de detalhe do '
  'negócio depende dela para listar os documentos vinculados.';

comment on column documents.file_url is
  'Path do objeto no bucket privado `documents` (Storage), não URL '
  'pública. Nullable: Documents.jsx permite criar/editar o registro sem '
  'arquivo anexado ainda.';

-- 4. Índices compostos (docs/SCHEMA_PLAN.md secao 4 + filtros de tela).
create index documents_tenant_id_project_id_idx
  on documents (tenant_id, project_id);

create index documents_tenant_id_unit_id_idx
  on documents (tenant_id, unit_id);

create index documents_tenant_id_deal_id_idx
  on documents (tenant_id, deal_id);

create index documents_tenant_id_doc_type_idx
  on documents (tenant_id, doc_type);

create index documents_tenant_id_status_idx
  on documents (tenant_id, status);

-- 5. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_documents_updated_at
  before update on documents
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0014/0024: nao confiar no
-- default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.documents to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `documents` ainda NAO tem Row Level Security habilitada.
-- Responsabilidade do subagente `rls-guardian` na proxima etapa, com teste
-- de isolamento correspondente, antes de qualquer dado real trafegar por
-- esta tabela. Mesmo padrao esperado de 0017/0027: select/insert/update
-- restrito a tenant_role in ('admin','comercial','administrativo') do
-- tenant certo via claim, sem delete.
-- ---------------------------------------------------------------------
