-- 0049_construction_photos.sql
-- Portal do Cliente (módulo 11): `construction_photos` — galeria de fotos
-- do andamento da obra, mostrada em "Acompanhe a Obra" no original
-- `src/pages/ClientPortal.jsx` (linhas 139-146, 377-426).
--
-- ÓRFÃ NO ORIGINAL, confirmado por grep em todo `original-project/src`:
-- `ConstructionPhoto` só aparece nesse único `.filter()` do Portal do
-- Cliente — nenhuma tela, nem admin nem cliente, tem `.create()`. Diferente
-- de `unit_checks` (0048), que É usada de verdade em outro lugar — aqui não
-- há nenhum write path a portar, nem sequer no lado interno/admin (mesmo
-- padrão de "entidade órfã" já registrado em `docs/DOMAIN_MAP.md` linha
-- 257 e no ARCHITECTURE.md para `Feasibility`/magic link do portal).
--
-- Ainda assim, criada agora (não deixada como "não portada", diferente de
-- Feasibility/magic link): a tarefa deste módulo pede a réplica fiel de
-- `ClientPortal.jsx`, e essa seção precisa de uma fonte real para renderizar
-- os 3 estados (vazio "Fotos em breve" — sempre este no lançamento, já que
-- não há tela nenhuma que grave foto ainda —, populado, erro). Sem a
-- tabela, a seção teria que ser hardcoded vazia, o que não é "portar",
-- é simplificar a estrutura de dados por trás da tela.
--
-- Sem bucket de Storage nesta migration: como não existe nenhum fluxo de
-- upload (nem admin, nem cliente) a suportar, criar um bucket agora seria
-- especular sobre um fluxo que não existe no original — diferente de
-- documents/inspection-media/maintenance-photos, todos criados junto com a
-- tela que de fato faz upload. Quando um módulo futuro adicionar a tela de
-- upload (equipe registrando fotos da obra — funcionalidade nova, fora do
-- que este módulo replica), a decisão de bucket privado + path por tenant
-- entra junto, seguindo o mesmo padrão já estabelecido (0031/0035/0038).
--
-- `file_url`: nome confirmado em `ClientPortal.jsx` (`photo.file_url`,
-- `docs/DOMAIN_MAP.md` chutava `photo_url`, desatualizado nesse ponto —
-- corrigido aqui contra o uso real). `not null`: sem nenhum `.create()`
-- para confirmar nullability real, mas semanticamente uma "foto" sem URL
-- não faz sentido existir como linha — mesmo raciocínio de campo obrigatório
-- por definição de entidade, não por form confirmado (diferente de
-- documents.file_url, nullable porque o registro nasce antes do upload lá).
--
-- `caption`/`taken_at`: nullable — usados condicionalmente em
-- ClientPortal.jsx (`photo.caption &&`, `photo.taken_at ? ... : 'Recente'`).
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa), com teste de isolamento correspondente —
-- igual ao padrão de 0001/0010/.../0045.

-- 1. construction_photos
create table construction_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  project_id uuid not null references projects(id),

  file_url text not null,
  caption text,
  taken_at timestamptz,

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

comment on table construction_photos is
  'Galeria de fotos do andamento da obra, exibida em "Acompanhe a Obra" no '
  'Portal do Cliente (ClientPortal.jsx). Órfã no original: nenhuma tela '
  'cria fotos, nem admin nem cliente — a lista sempre vem vazia até um '
  'módulo futuro adicionar upload (fora do escopo desta migration). Sem '
  'bucket de Storage ainda, pelo mesmo motivo.';

comment on column construction_photos.file_url is
  'URL/path da foto. Sem write path confirmado no original (grep '
  'confirmado) — not null por definição de entidade (uma foto sem arquivo '
  'não faz sentido existir), não por form confirmado. Passa a ser o path '
  'de um bucket privado quando/se um módulo futuro implementar upload '
  '(mesmo padrão de documents.file_url/inspection_media.file_url).';

-- 2. Índices compostos (tenant_id primeiro, seguindo o padrão do projeto).
create index construction_photos_tenant_id_created_at_idx
  on construction_photos (tenant_id, created_at);

create index construction_photos_tenant_id_project_id_idx
  on construction_photos (tenant_id, project_id);

create index construction_photos_tenant_id_taken_at_idx
  on construction_photos (tenant_id, taken_at);

-- 3. Trigger de updated_at (reutiliza a funcao criada em 0001, nao recria).
create trigger set_construction_photos_updated_at
  before update on construction_photos
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/.../0041/0048: nao confiar
-- no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: exclusao e
-- sempre soft delete via UPDATE (is_deleted).
-- ---------------------------------------------------------------------
grant select, insert, update on public.construction_photos to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `construction_photos` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Mesmo padrao esperado de 0017/.../0045:
-- select acessível ao tenant certo via claim, inclusive role `cliente`
-- (o Portal do Cliente lê por project_id da própria unidade, não há FK
-- direta para client/unit nesta tabela — a policy de cliente precisa
-- validar via join units/deals); insert/update restrito a quem for
-- decidido operar isso quando o upload existir, sem delete.
-- ---------------------------------------------------------------------
