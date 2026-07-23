-- 0038_maintenance_requests_storage.sql
-- Bucket de Storage para upload real de fotos do módulo de Manutenção
-- pós-entrega (tabela `maintenance_requests`, 0037). Terceiro bucket do
-- projeto — mesma convenção dos buckets `documents` (0031/0033) e
-- `inspection-media` (0035): privado, mime/tamanho limitados desde a
-- criação (já incorporando o achado de auditoria de 0033, sem precisar de
-- migration de correção posterior).
--
-- Bucket PRIVADO (`public = false`): sem leitura pública/anônima. Acesso só
-- via usuário autenticado do tenant certo, através de RLS em
-- `storage.objects`.
--
-- `allowed_mime_types`: só image/jpeg e image/png — confirmado via
-- `accept="image/*"` no input de upload em AdminMaintenance.jsx (linha 805)
-- e ClientMaintenance.jsx (linha 461). Diferente de `documents`/
-- `inspection-media` (que também aceitam application/pdf): não há upload de
-- PDF neste módulo no original, só fotos do problema relatado.
--
-- `file_size_limit`: 20MB, mesmo limite dos outros dois buckets (0033/0035)
-- — sem indicação no original de um limite diferente para fotos de
-- manutenção.
--
-- CONVENCAO DE PATH (o frontend precisa seguir exatamente isto, mesma
-- convenção dos buckets `documents`/`inspection-media`):
--   {tenant_id}/{uuid_ou_timestamp}-{nome_original_do_arquivo}
--   ex.: 11111111-1111-1111-1111-111111111111/1721606400000-vazamento.jpg
-- O PRIMEIRO segmento do path é sempre o tenant_id (uuid, sem hífens
-- adicionais nem case alterado) — é isso que a policy de storage.objects
-- (via `storage.foldername(name)`) usa para isolar por tenant. Upload para
-- qualquer outro primeiro segmento que não seja o tenant_id do próprio
-- usuário deve ser rejeitado pela policy de INSERT (with check).
-- `maintenance_requests.photos` (0037) guarda esses paths (não URLs
-- públicas).
--
-- RLS de `storage.objects` para o bucket `maintenance-photos`: NAO
-- configurada nesta migration -- é responsabilidade do subagente
-- `rls-guardian` (mesma categoria de trabalho que RLS de tabela: "nunca
-- escrevo políticas de RLS", ver regras do `schema-architect`), com teste
-- de isolamento correspondente. Esperado, quando implementado, mesmo
-- padrão de 0031/0035:
--   * select: authenticated, usando
--     (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
--     and (auth.jwt() ->> 'tenant_role') in ('admin','comercial','administrativo')
--     (ajustar os roles conforme quem opera manutenção pós-entrega no
--     produto real — e revisitar quando o portal do cliente existir, já
--     que o cliente também faz upload de foto no original)
--   * insert: mesma condição, como `with check` (garante que o client não
--     escolhe fazer upload na pasta de outro tenant)
--   * update/delete: avaliar se é necessário (provavelmente não -- exclusão
--     de foto vira soft-delete/edição do array na tabela, não remoção do
--     objeto do bucket; decisão de produto, não de schema)
--   * nada para `anon` -- bucket privado, sem leitura pública.
-- RLS já vem habilitada por padrão pelo Supabase em storage.objects; não é
-- necessário (nem eu deveria) rodar `alter table storage.objects enable
-- row level security` aqui -- só confirmar isso é responsabilidade da
-- auditoria pós-push do rls-guardian.

insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'maintenance-photos',
  'maintenance-photos',
  false,
  array['image/jpeg', 'image/png'],
  20971520 -- 20MB em bytes
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- RLS PENDENTE (storage.objects, bucket `maintenance-photos`): sem policies
-- de select/insert ainda, nenhum usuário autenticado consegue ler nem
-- gravar neste bucket (RLS nega tudo por padrão até policy existir) --
-- comportamento seguro por omissão até o rls-guardian configurar o
-- isolamento por tenant_id do path, na próxima etapa.
-- ---------------------------------------------------------------------
