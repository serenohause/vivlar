-- 0054_rls_maintenance_photos_client.sql
-- Fecha a lacuna de RLS de storage.objects (bucket `maintenance-photos`,
-- 0038) para o papel `cliente` -- sinalizada de proposito desde 0038
-- ("revisitar quando o portal do cliente existir") e confirmada como bug
-- real pelo `frontend-builder` ao construir `ClientMaintenanceCreateDialog`
-- (features/client-portal): o Portal do Cliente reusa `useUploadMaintenancePhoto`
-- (0037/0038, mesmo hook do lado admin) para anexar foto ao abrir um chamado
-- (`maintenance_requests_insert_tenant_client_own`, 0053), mas as unicas
-- policies do bucket ate agora (0039) sao restritas a
-- `tenant_role in ('admin','comercial','administrativo')` -- todo usuario
-- `tenant_role = 'cliente'` recebe 403 tanto no upload (INSERT) quanto na
-- galeria de fotos do proprio chamado (SELECT, `useMaintenancePhotoSignedUrl`).
--
-- POR QUE A POLICY DE SELECT NAO PODE SER "SO TENANT + ROLE" (COMO A DA
-- EQUIPE INTERNA)
-- -------------------------------------------------------------------------
-- Convencao de path do bucket (0038, reconfirmada em `useUploadMaintenancePhoto`,
-- `features/maintenance/hooks.ts`):
--   {tenant_id}/{timestamp}-{nome_original_do_arquivo}
-- O PRIMEIRO segmento e sempre o tenant_id -- e so isso. NADA no path
-- identifica o cliente ou o chamado de manutencao dono daquele arquivo (sem
-- client_id nem maintenance_request_id embutido). Isso e seguro para a
-- equipe interna (0039) porque todo membro da equipe enxerga TODOS os
-- chamados do tenant mesmo assim (`maintenance_requests_select_tenant_team`,
-- 0039) -- mas para o papel `cliente`, que so pode ver os PROPRIOS chamados
-- (`maintenance_requests_select_tenant_client_own`, 0053), copiar a policy
-- da equipe 1:1 (so tenant_id do path = claim + tenant_role = 'cliente')
-- permitiria um cliente ler/ENUMERAR fotos de OUTRO cliente do MESMO
-- tenant -- bastaria adivinhar/observar um path de outro chamado (ex.: via
-- network tab, ou tentando paths sequenciais) para montar uma signed URL e
-- baixar a foto, mesmo sem nunca ter acesso a linha de `maintenance_requests`
-- correspondente (essa, sim, ja isolada por 0053). O objeto de Storage em si
-- ficaria sem essa MESMA barreira -- vazamento de dado sensivel (foto de
-- problema/imovel de outro cliente) entre clientes do mesmo tenant.
--
-- A SAIDA: SELECT do papel `cliente` exige, alem de tenant_id do path = claim
-- + tenant_role = 'cliente', que (a) o path esteja de fato referenciado no
-- array `photos` de um `maintenance_requests` cujo `client_id` seja do
-- proprio cliente logado -- via nova funcao `client_owns_maintenance_photo(path)`,
-- mesmo padrao SECURITY DEFINER ja estabelecido em 0051/0053
-- (`client_owns_unit`/`client_owns_project`/`client_owns_client_record`/
-- `client_owns_finance_account`) --, OU (b) o proprio cliente seja quem
-- enviou aquele objeto (`owner`/`owner_id` = `auth.uid()`, setados pelo
-- Storage API a partir do JWT de quem fez o upload, nao vem do client) --
-- ver ACHADO IMPORTANTE mais abaixo, na policy de SELECT, sobre por que essa
-- segunda condicao e indispensavel (sem ela, o upload real do cliente falha
-- em 100% dos casos). Diferente das outras funcoes SECURITY DEFINER de
-- 0051/0053, `client_owns_maintenance_photo` NAO precisa bypassar RLS de
-- `maintenance_requests` por falta de policy (0053 ja da SELECT ao cliente
-- nas proprias linhas) -- mas SECURITY DEFINER e mantido mesmo assim, pelo
-- MESMO motivo estrutural do padrao anterior: uma unica funcao testavel/
-- documentada em vez de repetir o EXISTS inline dentro da policy de
-- storage.objects, e independente de outra policy de RLS continuar
-- existindo/inalterada no futuro. `photos` (0037) e `text[]` guardando o
-- PATH COMPLETO do objeto (confirmado lendo o comentario de 0037 e
-- `useUploadMaintenancePhoto`/`ClientMaintenanceCreateDialog`, que grava
-- exatamente o retorno de `.upload(path, file)` no array, sem transformacao)
-- -- por isso a comparacao abaixo e `p_path = any(mr.photos)` direto contra
-- `storage.objects.name`, sem precisar extrair/normalizar nada.
--
-- REGRA DE AUTORIZACAO (confirmada com o usuario)
-- -------------------------------------------------------------------------
--   * INSERT: pode ser igual ao padrao da equipe interna (tenant_id do path
--     = claim + tenant_role = 'cliente') -- o cliente escolher escrever na
--     pasta do proprio tenant e seguro. O path e SEMPRE gerado pelo proprio
--     upload (timestamp/nome do arquivo, `useUploadMaintenancePhoto`), o
--     cliente nao tem como "roubar" o path de outro objeto ja existente
--     nem forcar colisao com um path de outro cliente. A posse de QUAL
--     chamado referencia esse path e garantida por outra policy, na tabela
--     `maintenance_requests` (`maintenance_requests_insert_tenant_client_own`,
--     0053), que ja exige `client_owns_unit`/`client_owns_project`/
--     `client_owns_client_record` antes de aceitar o `photos[]` no INSERT --
--     um objeto de storage orfao (upload feito, chamado nunca criado) nao
--     e um vazamento de dado de OUTRO cliente, so um arquivo nao referenciado
--     (mesma classe de "orfao" ja aceita em 0039 para reupload/remocao).
--   * SELECT: NAO pode ser so tenant+role -- ver racional completo acima.
--     Exige `owner`/`owner_id` = auth.uid() (o proprio upload) OU
--     `client_owns_maintenance_photo(name)` (chamado ja criado referencia o
--     path).
--   * UPDATE/DELETE: nenhuma policy nova, mesma decisao ja tomada para a
--     equipe interna em 0039 -- reupload sempre vira objeto novo (path com
--     timestamp diferente), nunca substituicao in-place. Sem policy, RLS
--     nega por padrao (mesmo criterio de 0039).
--
-- `maintenance_requests` (tabela) em si NAO e tocada aqui -- 0053 ja cobre
-- select/insert/update do papel cliente nela. Esta migration e SO sobre
-- `storage.objects` do bucket `maintenance-photos`.

-- =======================================================================
-- 0. Funcao auxiliar SECURITY DEFINER -- mesmo padrao de 0051/0053.
-- =======================================================================

-- Verdadeiro se p_path e o path de um objeto do bucket `maintenance-photos`
-- referenciado no array `photos` de algum `maintenance_requests` cujo
-- `client_id` e o proprio registro de cliente do usuario autenticado
-- (dentro do MESMO tenant do claim). Reusa `client_owns_client_record`
-- (0051) em vez de duplicar o JOIN clients/auth.uid().
create or replace function public.client_owns_maintenance_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maintenance_requests mr
    where p_path = any(mr.photos)
      and mr.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and public.client_owns_client_record(mr.client_id)
  );
$$;

comment on function public.client_owns_maintenance_photo(text) is
  'SECURITY DEFINER: true se p_path (storage.objects.name, bucket '
  'maintenance-photos) aparece no array photos de algum maintenance_requests '
  'cujo client_id e o proprio auth.uid() (via client_owns_client_record, '
  '0051_rls_client_portal.sql), dentro do tenant do claim do JWT. Sem isso, '
  'uma policy de SELECT em storage.objects baseada so em tenant_id do path '
  '(mesmo padrao da equipe interna, 0039) permitiria um cliente ler/'
  'enumerar fotos de OUTRO cliente do MESMO tenant -- a convencao de path '
  '({tenant_id}/{timestamp}-{nome}, 0038) nao identifica dono nem chamado, '
  'so o tenant. Usada pela policy de SELECT do bucket maintenance-photos '
  'para o papel cliente, 0054_rls_maintenance_photos_client.sql.';

-- Funcao nasce com EXECUTE liberado para PUBLIC por padrao -- revogado e
-- reconcedido so para `authenticated` (mesmo padrao de 0002/0005/0051/0053).
revoke execute on function public.client_owns_maintenance_photo(text) from public, anon;
grant execute on function public.client_owns_maintenance_photo(text) to authenticated;

-- =======================================================================
-- 1. storage.objects (bucket `maintenance-photos`) -- policies novas para
--    tenant_role = 'cliente'. Nao mexe nas policies da equipe interna
--    (0039) -- Postgres combina policies permissivas do MESMO comando com
--    OR, e os predicados de role sao mutuamente exclusivos (mesmo criterio
--    ja documentado em 0053).
-- =======================================================================

-- NOTA: sem `comment on policy ... on storage.objects` aqui (ao contrario do
-- padrao usado em `maintenance_requests`/outras tabelas de `public`) --
-- `storage.objects` pertence ao schema gerenciado pela extensao de Storage
-- do Supabase; a role de migration nao e dona da relation, e `comment on
-- policy` exige ownership (`ERROR: must be owner of relation objects`,
-- confirmado tentando aplicar esta migration). Mesmo motivo pelo qual 0039
-- documenta as policies de storage.objects em comentario de SQL comum (`--`)
-- em vez de `comment on policy` -- documentacao abaixo, nao no catalogo.

-- tenant_role=cliente do tenant certo pode fazer upload na PROPRIA pasta do
-- bucket maintenance-photos (primeiro segmento do path = tenant_id do
-- claim) -- mesmo criterio de isolamento de tenant ja usado para a equipe
-- interna (maintenance_photos_bucket_insert_tenant_team, 0039). Seguro sem
-- checagem adicional de posse de chamado: o path e sempre gerado pelo
-- proprio upload (timestamp+nome, useUploadMaintenancePhoto), e a posse do
-- CHAMADO que vai referenciar este path e garantida por
-- maintenance_requests_insert_tenant_client_own (0053) no INSERT da tabela
-- -- um objeto sem chamado associado fica orfao, nunca visivel a outro
-- cliente (ver policy de SELECT abaixo).
create policy "maintenance_photos_bucket_insert_tenant_client"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
  );

-- tenant_role=cliente do tenant certo SO le objetos referenciados no array
-- photos de um maintenance_requests cujo client_id e o proprio (via
-- client_owns_maintenance_photo(), SECURITY DEFINER), OU objetos que ELE
-- PROPRIO acabou de enviar (owner/owner_id = auth.uid(), setados pelo proprio
-- Storage API a partir do JWT de quem fez o upload -- nao vem do client,
-- nao e manipulavel para "roubar" posse de um objeto ALHEIO ja existente,
-- so descreve quem enviou aquele objeto especifico). Isolamento por tenant
-- (primeiro segmento do path) SOZINHO nao basta aqui -- diferente da equipe
-- interna (0039), que ve todo chamado do tenant mesmo assim -- porque a
-- convencao de path (0038) nao identifica cliente/chamado dono do arquivo.
-- Sem client_owns_maintenance_photo(), um cliente que descobrisse/
-- adivinhasse o path exato de outra foto do mesmo tenant conseguiria montar
-- uma signed URL e ler a foto de outro cliente.
--
-- ACHADO IMPORTANTE (por que o `owner`/`owner_id` PRECISA estar aqui, nao so
-- client_owns_maintenance_photo): confirmado empiricamente rodando esta
-- migration contra o banco remoto -- o upload real (`.storage.from(...)
-- .upload(path, file)`, `useUploadMaintenancePhoto`) faz um INSERT com
-- RETURNING internamente (mesmo comportamento do endpoint de upload do
-- Storage API do Supabase). Regra do Postgres RLS: um INSERT com RETURNING
-- tambem precisa passar pela policy de SELECT para devolver a linha -- se a
-- linha recem-inserida nao passar no SELECT, o INSERT INTEIRO falha com
-- "new row violates row-level security policy" (42501), mesmo o WITH CHECK
-- do INSERT tendo aprovado. No fluxo real do Portal do Cliente
-- (`ClientMaintenanceCreateDialog`), a foto e enviada ANTES do chamado de
-- manutencao ser criado (`uploadPhoto.mutateAsync` roda por foto, dentro de
-- `handlePhotoChange`, e so DEPOIS o form inteiro e submetido via
-- `createRequest.mutate`) -- ou seja, no momento exato do upload, NENHUM
-- `maintenance_requests` ainda referencia aquele path, e
-- `client_owns_maintenance_photo(name)` teria que retornar false. Uma
-- policy de SELECT que dependesse SO dessa funcao quebraria todo upload
-- real do cliente em producao (403 sempre, 100% dos casos) -- por isso
-- `owner = auth.uid() or owner_id = auth.uid()::text` cobre exatamente esse
-- instante (o Storage API seta esses campos a partir do proprio uploader no
-- momento do INSERT), e `client_owns_maintenance_photo` continua garantindo
-- acesso de leitura depois, quando o chamado ja existe e referencia o path
-- (ex.: reabrir a galeria do chamado em outra sessao/dispositivo).
create policy "maintenance_photos_bucket_select_tenant_client_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'maintenance-photos'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'tenant_id')
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and (
      owner = auth.uid()
      or owner_id = (auth.uid())::text
      or public.client_owns_maintenance_photo(name)
    )
  );

-- SEM policy de UPDATE/DELETE para cliente, de proposito -- mesma decisao ja
-- tomada para a equipe interna em 0039: reupload vira objeto novo (novo
-- path), nunca substituicao in-place; RLS nega por padrao sem policy.

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function deste modulo
-- existe hoje (confirmado -- supabase/functions/ continua sem nada de
-- manutencao/Portal do Cliente). Mesma regra de 0002/0039/0045/0051/0053:
-- service_role so pode ser usado server-side (dentro de uma Edge Function,
-- nunca embutido/exposto num client React).
-- Ver supabase/tests/0054_maintenance_photos_client_isolation.sql para o
-- teste de isolamento cross-tenant, cross-cliente (mesmo tenant) e de
-- regressao da equipe interna correspondente a esta migration.
