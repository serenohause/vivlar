-- 0033_documents_bucket_limits.sql
-- Achado de auditoria de segurança (severidade média, módulo Documentos):
-- o bucket privado `documents` (0031_documents_storage.sql) não tinha
-- `allowed_mime_types`/`file_size_limit`, então nada impedia upload de
-- tipo de arquivo ou tamanho arbitrário além da validação client-side
-- (facilmente contornável). Corrigido espelhando no bucket os mesmos
-- limites já aplicados no client (ver
-- src/features/documents/components/DocumentFormDialog.tsx):
-- application/pdf, image/jpeg, image/png, até 20MB.

update storage.buckets
set
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'],
  file_size_limit = 20971520 -- 20MB em bytes
where id = 'documents';
