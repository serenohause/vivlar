-- 0034_inspections.sql
-- Vistorias e templates de checklist (do original `src/pages/Templates.jsx`,
-- `TemplateDetail.jsx`, `CreateInspection.jsx`, `InspectionDetail.jsx`,
-- `Inspections.jsx`, `src/components/reports/inspectionPdf.jsx`). 6 tabelas:
-- `inspection_templates` (checklist reutilizável), `inspection_template_items`
-- (item do checklist), `inspections` (vistoria de uma unidade),
-- `inspection_item_results` (resultado de um item numa vistoria),
-- `inspection_media` (fotos/anexos por item), `inspection_signatures`
-- (assinatura do vistoriador / PDF assinado do cliente).
--
-- `src/components/unit/InspectionDashboard.jsx` e
-- `src/components/dashboard/InspectionsDashboard.jsx` NÃO tocam nenhuma
-- entidade Inspection* do base44 (o primeiro é 100% local a `localStorage`,
-- checklist hardcoded, órfão/desconectado do backend) — não influenciam este
-- schema.
--
-- `status` (inspections): 7 valores confirmados em InspectionDetail.jsx/
-- Inspections.jsx (getStatusColor, Select de filtro): Rascunho, Em Vistoria,
-- Enviado ao Cliente, Aprovado, Reprovado, Reinspeção, Concluído.
--
-- `result` (inspection_item_results): 4 valores confirmados nos botões de
-- resultado em InspectionDetail.jsx: Conforme, Não Conforme, Não se Aplica,
-- Pendente.
--
-- `severity`/`severity_default`: 3 valores confirmados em TemplateDetail.jsx
-- (SEVERITIES) e Constants.jsx: Baixa, Média, Crítica. Mesmo enum reutilizado
-- nas duas tabelas (severity é herdado de severity_default na criação do
-- resultado, ver CreateInspection.jsx linha ~265 e normalizeResults em
-- InspectionDetail.jsx).
--
-- `inspection_item_results.due_date`/`resolved_at` NÃO incluídos: ambos são
-- lidos em InspectionDetail.jsx (linha 517 `!i.resolved_at`, linha 1067-1069
-- `item.due_date`), mas nenhum `InspectionItemResult.create(...)` ou
-- `.update(...)` em todo o `src` seta qualquer um dos dois (grep confirmado)
-- — mesmo critério já usado para `commissions.paid_at` (0024): campo lido,
-- sem write path no export. Diferente de `documents.deal_id` (mantido apesar
-- de sem write path, porque uma tela inteira dependia dele para leitura) —
-- aqui os dois campos são só usados em condicionais defensivas
-- (`pendingItems`/badge de prazo) que nunca disparam com o schema atual.
-- Reversível: se o produto introduzir prazo de correção/resolução de
-- pendência, isso vira uma migration própria.
--
-- `inspections.notes_general` incluído (apesar de também sem write path
-- confirmado no export — só leitura em InspectionDetail.jsx/inspectionPdf.jsx):
-- é um campo de observação de topo de tabela, mesmo padrão de baixo risco já
-- usado para `notes`/`observacoes` em commissions/commission_payments/
-- documents, cuja UI de escrita é trivial e esperada quando o
-- `frontend-builder` implementar a tela — diferente de `due_date`/
-- `resolved_at` acima, que fazem parte de uma automação de fluxo (prazo de
-- correção) ainda não implementada, não apenas um campo de texto solto.
--
-- `inspection_templates`/`inspection_template_items`/`inspections`/
-- `inspection_item_results`: soft-delete + updated_at completos — todas têm
-- `.update(...)` real confirmado (edição de nome/descrição/ativo em
-- templates, edição de itens em TemplateDetail.jsx, updateItemMutation/
-- updateInspectionMutation em InspectionDetail.jsx) além do soft-delete.
--
-- `inspection_media`: soft-delete + updated_at também incluídos, mesmo só
-- havendo `.create(...)` e soft-delete via `.update(...)` confirmados (sem
-- edição de file_url/caption) — o soft-delete já é um UPDATE real, mesmo
-- critério de `commission_payments` (0026), que também tinha edição real.
--
-- `inspection_signatures`: WRITE-ONCE — confirmado via grep que só existe
-- `InspectionSignature.create(...)` em todo o `src`, nenhum `.update(`/
-- `.delete(`. Sem soft-delete/updated_at, mesmo critério de
-- `commission_adjustments` (0025). `signer_type` é texto livre (só 2 valores
-- usados na prática — "Vistoriador"/"Cliente" — mas sem validação de enum no
-- create), mesmo critério de `commission_payments.payment_method` (0026).
--
-- `inspection_media.item_result_id` NOT NULL: todo `InspectionMedia.create`
-- encontrado no `src` (uploadMediaMutation, InspectionDetail.jsx linha
-- ~223-234) sempre inclui `item_result_id` — não há upload de mídia solta a
-- nível de vistoria sem item associado.
--
-- Upload real via Supabase Storage (bucket `inspection-media`, ver
-- 0035_inspections_storage.sql). `file_url`/`signature_file_url` guardam o
-- path no bucket privado, não URL pública — mesma convenção do bucket
-- `documents` (0031).
--
-- `inspection_item_results_tenant_id_inspection_id_template_item_id_uidx`:
-- índice único parcial (tenant_id, inspection_id, template_item_id) where
-- not is_deleted. Fecha a classe de bug de duplicação identificada no
-- próprio original: `normalizeResults` em InspectionDetail.jsx (linhas
-- 128-202) existe especificamente para detectar e soft-deletar resultados
-- duplicados por template_item_id numa mesma vistoria — sintoma de o
-- original não ter essa garantia no banco. Com o índice, a duplicação deixa
-- de ser possível na origem; a rotina de normalização do frontend pode ser
-- simplificada quando o `frontend-builder` implementar a tela (não precisa
-- mais fazer dedupe reativo).
--
-- Sem unique constraint de "1 vistoria ativa por unidade": a regra em
-- CreateInspection.jsx (`getActiveInspection`) é sobre um subconjunto de
-- status ("Rascunho", "Em Vistoria", "Enviado ao Cliente", "Reinspeção"),
-- não sobre a existência da linha em si — várias vistorias concluídas ou
-- reprovadas podem coexistir para a mesma unidade ao longo do tempo. Regra
-- de fluxo, aplicada pela aplicação (mesmo padrão já usado para regras de
-- transição de estágio em deals/status_transitions, 0016), não expressável
-- como constraint simples de unicidade.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/0017/0023/0027/0032.

-- 1. Enum de severidade. Reutilizado em inspection_template_items e
--    inspection_item_results (severity é herdado de severity_default na
--    criação do resultado).
create type inspection_severity as enum (
  'baixa',
  'media',
  'critica'
);

-- 2. Enum de status da vistoria. Confirmado em InspectionDetail.jsx/
--    Inspections.jsx (getStatusColor, filtro de status).
create type inspection_status as enum (
  'rascunho',
  'em_vistoria',
  'enviado_ao_cliente',
  'aprovado',
  'reprovado',
  'reinspecao',
  'concluido'
);

-- 3. Enum de resultado de um item de checklist. Confirmado nos botões de
--    resultado em InspectionDetail.jsx.
create type inspection_result as enum (
  'pendente',
  'conforme',
  'nao_conforme',
  'nao_se_aplica'
);

-- 4. inspection_templates
create table inspection_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  name text not null,
  description text,
  is_active boolean not null default true,

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

comment on table inspection_templates is
  'Template reutilizável de checklist de vistoria (Templates.jsx/'
  'TemplateDetail.jsx). is_active controla se aparece na criação de novas '
  'vistorias (CreateInspection.jsx).';

-- 5. inspection_template_items
create table inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  template_id uuid not null references inspection_templates(id),

  category text not null,
  title text not null,
  instructions text,
  severity_default inspection_severity not null,
  requires_photo boolean not null default false,
  order_index integer not null default 0,

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

comment on table inspection_template_items is
  'Item de checklist de um inspection_template (TemplateDetail.jsx). '
  'category é texto livre (lista fixa de sugestões na UI, sem enum no '
  'schema — mesmo critério de payment_method em 0020/0026). order_index '
  'controla a ordem de exibição (reorderItemMutation troca valores entre '
  'itens adjacentes).';

-- 6. inspections
create table inspections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  -- Relacionamentos
  project_id uuid not null references projects(id),
  unit_id uuid not null references units(id),
  client_id uuid references clients(id),
  template_id uuid not null references inspection_templates(id),
  inspector_user_id uuid references auth.users(id),

  inspection_date date,
  status inspection_status not null default 'rascunho',

  -- Totais recalculados pela aplicação (recalculateTotals em
  -- InspectionDetail.jsx) a cada mudança de resultado de item — sem trigger
  -- de agregação no banco, mesmo padrão de commissions.gross_value (0024).
  totals_conform integer not null default 0,
  totals_nonconform integer not null default 0,
  totals_notapplicable integer not null default 0,
  totals_pending integer not null default 0,
  score_conformity_percent numeric(5, 2) not null default 0,

  notes_general text,

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

comment on table inspections is
  'Vistoria de uma unidade a partir de um inspection_template. client_id é '
  'nullable (getClientForUnit em CreateInspection.jsx retorna null se não '
  'houver deal VENDIDO para a unidade). totals_*/score_conformity_percent '
  'são recalculados pela aplicação (recalculateTotals), não por trigger no '
  'banco. Sem constraint de "1 vistoria ativa por unidade" — regra de fluxo '
  'aplicada no frontend sobre um subconjunto de status (ver topo do '
  'arquivo).';

comment on column inspections.client_id is
  'Nullable: só é preenchido se a unidade tiver um deal com sales_stage = '
  'VENDIDO no momento da criação da vistoria (CreateInspection.jsx, '
  'getClientForUnit).';

-- 7. inspection_item_results
create table inspection_item_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  inspection_id uuid not null references inspections(id),
  template_item_id uuid not null references inspection_template_items(id),

  result inspection_result not null default 'pendente',
  severity inspection_severity not null,
  comment text,
  requires_fix boolean not null default false,

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

comment on table inspection_item_results is
  'Resultado de um inspection_template_item numa inspection específica. '
  'severity é copiado de template_item_items.severity_default no momento da '
  'criação (não é FK derivada, pode divergir depois se o template mudar). '
  'requires_fix é derivado de result no momento do update (handleResultChange '
  'em InspectionDetail.jsx: true quando result é Não Conforme ou Pendente).';

comment on column inspection_item_results.severity is
  'Copiado de inspection_template_items.severity_default na criação do '
  'resultado (CreateInspection.jsx/normalizeResults em InspectionDetail.jsx) '
  '— não há write path que altere severity depois de criado.';

-- 8. inspection_media
create table inspection_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  inspection_id uuid not null references inspections(id),
  item_result_id uuid not null references inspection_item_results(id),

  -- Upload real via Supabase Storage (bucket `inspection-media`, ver
  -- 0035_inspections_storage.sql). file_url guarda o path no bucket (não URL
  -- pública), file_name o nome original do arquivo.
  file_url text not null,
  file_name text,
  caption text,
  taken_at timestamptz not null default now(),

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

comment on table inspection_media is
  'Foto/arquivo anexado a um inspection_item_result. item_result_id NOT '
  'NULL: todo InspectionMedia.create no original inclui item_result_id, sem '
  'mídia solta a nível de vistoria. file_url guarda o path do objeto no '
  'bucket privado inspection-media (0035), não uma URL pública.';

-- 9. inspection_signatures
create table inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  inspection_id uuid not null references inspections(id),

  signer_type text not null,
  signer_name text,
  signer_document text,

  -- Upload real via Supabase Storage (bucket `inspection-media`, mesmo
  -- bucket de inspection_media). Path no bucket, não URL pública. Usado
  -- para o PDF da vistoria assinado pelo cliente (createSignatureMutation,
  -- InspectionDetail.jsx) — a assinatura do vistoriador não anexa arquivo.
  signature_file_url text,
  signed_at timestamptz,
  confirmation_checkbox boolean not null default false,

  -- Auditoria (write-once, ver topo do arquivo)
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table inspection_signatures is
  'Assinatura de uma inspection — write-once, sem update/delete no fluxo '
  'original (confirmado via grep: só há InspectionSignature.create). '
  'signer_type é texto livre (2 valores usados na prática: '
  '"Vistoriador"/"Cliente"), sem validação de enum no create. '
  'signature_file_url é nullable: a assinatura do vistoriador não anexa '
  'arquivo (só confirmation_checkbox); a do cliente é sempre um PDF '
  '(accept="application/pdf" no input de upload).';

-- 10. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index inspection_templates_tenant_id_is_active_idx
  on inspection_templates (tenant_id, is_active);

create index inspection_template_items_tenant_id_template_id_idx
  on inspection_template_items (tenant_id, template_id);

create index inspections_tenant_id_project_id_idx
  on inspections (tenant_id, project_id);

create index inspections_tenant_id_unit_id_idx
  on inspections (tenant_id, unit_id);

create index inspections_tenant_id_client_id_idx
  on inspections (tenant_id, client_id);

create index inspections_tenant_id_status_idx
  on inspections (tenant_id, status);

create index inspections_tenant_id_template_id_idx
  on inspections (tenant_id, template_id);

create index inspection_item_results_tenant_id_inspection_id_idx
  on inspection_item_results (tenant_id, inspection_id);

create index inspection_item_results_tenant_id_template_item_id_idx
  on inspection_item_results (tenant_id, template_item_id);

create index inspection_media_tenant_id_inspection_id_idx
  on inspection_media (tenant_id, inspection_id);

create index inspection_media_tenant_id_item_result_id_idx
  on inspection_media (tenant_id, item_result_id);

create index inspection_signatures_tenant_id_inspection_id_idx
  on inspection_signatures (tenant_id, inspection_id);

-- 11. Índice único parcial: no máximo 1 resultado ativo (não excluído) por
--     template_item_id, por inspeção, por tenant. Fecha a classe de bug de
--     duplicação já identificada e contornada no original via
--     normalizeResults (ver topo do arquivo).
create unique index inspection_item_results_tenant_id_inspection_id_item_uidx
  on inspection_item_results (tenant_id, inspection_id, template_item_id)
  where not is_deleted;

-- 12. Triggers de updated_at (reutiliza a funcao criada em 0001, nao
--     recria). inspection_signatures nao tem: write-once, sem coluna
--     updated_at (ver topo do arquivo).
create trigger set_inspection_templates_updated_at
  before update on inspection_templates
  for each row
  execute function set_updated_at();

create trigger set_inspection_template_items_updated_at
  before update on inspection_template_items
  for each row
  execute function set_updated_at();

create trigger set_inspections_updated_at
  before update on inspections
  for each row
  execute function set_updated_at();

create trigger set_inspection_item_results_updated_at
  before update on inspection_item_results
  for each row
  execute function set_updated_at();

create trigger set_inspection_media_updated_at
  before update on inspection_media
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0026/0030: nao confiar
-- no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE, exceto inspection_signatures (write-once,
-- so select/insert).
-- ---------------------------------------------------------------------
grant select, insert, update on public.inspection_templates to authenticated;
grant select, insert, update on public.inspection_template_items to authenticated;
grant select, insert, update on public.inspections to authenticated;
grant select, insert, update on public.inspection_item_results to authenticated;
grant select, insert, update on public.inspection_media to authenticated;
grant select, insert on public.inspection_signatures to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: nenhuma das 6 tabelas acima tem Row Level Security
-- habilitada ainda. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por elas. Mesmo padrao esperado de 0017/0027/0032: select/
-- insert/update restrito a tenant_role in
-- ('admin','comercial','administrativo') do tenant certo via claim (ajustar
-- os roles conforme quem opera vistorias no produto real), sem delete.
-- ---------------------------------------------------------------------
