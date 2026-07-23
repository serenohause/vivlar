-- 0035_inspections_storage.sql
-- Bucket de Storage para upload real de mídia do módulo de Vistorias
-- (tabelas `inspection_media` e `inspection_signatures`, 0034). Segundo
-- bucket do projeto — mesma convenção do bucket `documents` (0031/0033), já
-- corrigindo desde já o achado de auditoria daquela leva (mime types/limite
-- de tamanho no bucket desde a criação, em vez de precisar de uma migration
-- de correção posterior).
--
-- Bucket PRIVADO (`public = false`): sem leitura pública/anônima. Acesso só
-- via usuário autenticado do tenant certo, através de RLS em
-- `storage.objects`.
--
-- `allowed_mime_types`: image/jpeg, image/png (fotos de item de checklist,
-- accept="image/*" no input de upload em InspectionDetail.jsx) e
-- application/pdf (PDF da vistoria assinado pelo cliente,
-- accept="application/pdf" no input de upload da assinatura). Mesmos 3 tipos
-- do bucket `documents` (0033).
--
-- `file_size_limit`: 20MB, mesmo limite do bucket `documents` (0033) — sem
-- indicação no original de um limite diferente para fotos de vistoria.
--
-- CONVENCAO DE PATH (o frontend precisa seguir exatamente isto, mesma
-- convenção do bucket `documents` em 0031):
--   {tenant_id}/{uuid_ou_timestamp}-{nome_original_do_arquivo}
--   ex.: 11111111-1111-1111-1111-111111111111/1721606400000-foto-item.jpg
-- O PRIMEIRO segmento do path é sempre o tenant_id (uuid, sem hífens
-- adicionais nem case alterado) — é isso que a policy de storage.objects
-- (via `storage.foldername(name)`) usa para isolar por tenant. Upload para
-- qualquer outro primeiro segmento que não seja o tenant_id do próprio
-- usuário deve ser rejeitado pela policy de INSERT (with check).
-- `inspection_media.file_url`/`inspection_signatures.signature_file_url`
-- (0034) guardam esse path (não uma URL pública).
--
-- RLS de `storage.objects` para o bucket `inspection-media`: NAO configurada
-- nesta migration -- é responsabilidade do subagente `rls-guardian` (mesma
-- categoria de trabalho que RLS de tabela: "nunca escrevo políticas de
-- RLS", ver regras do `schema-architect`), com teste de isolamento
-- correspondente. Esperado, quando implementado, mesmo padrão de 0031:
--   * select: authenticated, usando
--     (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
--     and (auth.jwt() ->> 'tenant_role') in ('admin','comercial','administrativo')
--     (ajustar os roles conforme quem opera vistorias no produto real)
--   * insert: mesma condição, como `with check` (garante que o client não
--     escolhe fazer upload na pasta de outro tenant)
--   * update/delete: avaliar se é necessário (provavelmente não -- exclusão
--     de mídia já é soft-delete na tabela inspection_media, não precisa
--     remover o objeto do bucket; decisão de produto, não de schema)
--   * nada para `anon` -- bucket privado, sem leitura pública.
-- RLS já vem habilitada por padrão pelo Supabase em storage.objects; não é
-- necessário (nem eu deveria) rodar `alter table storage.objects enable
-- row level security` aqui -- só confirmar isso é responsabilidade da
-- auditoria pós-push do rls-guardian.

insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'inspection-media',
  'inspection-media',
  false,
  array['image/jpeg', 'image/png', 'application/pdf'],
  20971520 -- 20MB em bytes
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- RLS PENDENTE (storage.objects, bucket `inspection-media`): sem policies de
-- select/insert ainda, nenhum usuário autenticado consegue ler nem gravar
-- neste bucket (RLS nega tudo por padrão até policy existir) --
-- comportamento seguro por omissão até o rls-guardian configurar o
-- isolamento por tenant_id do path, na próxima etapa.
-- ---------------------------------------------------------------------
