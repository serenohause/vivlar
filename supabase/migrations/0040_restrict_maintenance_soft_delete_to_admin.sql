-- 0040_restrict_maintenance_soft_delete_to_admin.sql
-- Achado da auditoria de seguranca do Modulo 9 (Manutencao, 2026-07-23):
-- `MaintenanceListPage.tsx`/`MaintenanceDetailPage.tsx` so mostram o botao
-- "Excluir" pro papel `admin`, mas a policy de UPDATE criada em 0039
-- (`maintenance_requests_update_tenant_team`) autorizava `admin`,
-- `comercial` E `administrativo` a fazer QUALQUER UPDATE em
-- `maintenance_requests` -- incluindo o soft-delete, que e so um UPDATE
-- setando `is_deleted = true` (0037: nao ha DELETE de verdade nesta
-- tabela). A RLS estava mais permissiva que a intencao de produto expressa
-- na UI. Corrigido aqui: `comercial`/`administrativo` continuam podendo
-- fazer updates normais (mudar status, agendar, editar notas etc.), mas so
-- `admin` consegue marcar `is_deleted = true`.
--
-- POR QUE UMA UNICA POLICY DE UPDATE (nao duas policies separadas)
-- --------------------------------------------------------------------
-- A abordagem obvia seria separar em duas policies permissivas de UPDATE:
-- uma "update normal" (3 papeis, sem tocar is_deleted) e uma "soft-delete"
-- (so admin). Isso seria uma armadilha: o Postgres combina MULTIPLAS
-- policies permissivas do MESMO comando (aqui, UPDATE) com OR, tanto no
-- USING quanto no WITH CHECK. Se a policy "update normal" tiver um WITH
-- CHECK que nao menciona `is_deleted`, ela sozinha ja autoriza QUALQUER
-- UPDATE dos 3 papeis -- inclusive um que sete `is_deleted = true` --
-- porque o Postgres so exige que UMA das policies permissivas aprove a
-- linha, nao todas. A policy "so admin" mais restritiva NAO restringe nada
-- nesse cenario -- ela so adiciona mais uma forma de passar, nunca subtrai
-- uma que ja passou por outra policy. Ou seja, a policy mais permissiva
-- (das duas) vence, reabrindo exatamente o buraco que essa migration existe
-- pra fechar.
--
-- A saida correta com RLS declarativa (sem trigger) e MANTER UMA UNICA
-- policy de UPDATE (substituindo a de 0039) cuja clausula WITH CHECK
-- embute a excecao diretamente: o novo valor de `is_deleted` so pode ser
-- `true` se quem esta fazendo o UPDATE for `admin`. Como so existe uma
-- policy pro comando UPDATE, nao ha combinacao por OR entre policies
-- concorrentes -- a logica AND/OR fica inteira dentro de uma unica
-- expressao booleana, sob controle direto daqui.
--
-- Um trigger BEFORE UPDATE (rejeitando a transicao is_deleted: false ->
-- true para quem nao for admin) tambem resolveria, mas foi descartado por
-- ser desnecessario: a policy WITH CHECK abaixo ja expressa a regra de
-- forma completa e legivel, sem precisar de outro objeto de banco pra
-- manter, e sem risco de composicao por OR (unica policy, nao duas).
--
-- NOTA sobre o que a nova WITH CHECK cobre: ela trava pelo valor NOVO de
-- `is_deleted` (nao pela transicao OLD -> NEW), e so bloqueia gravar
-- `true`. Duas consequencias praticas, ambas intencionais:
-- 1. `comercial`/`administrativo` NAO conseguem fazer NENHUM UPDATE (nem
--    editar nota, nem mudar status) numa linha que JA esteja com
--    `is_deleted = true` -- o valor novo continuaria `true`, falhando o
--    check. Consistente com a intencao de produto (chamado excluido nao e
--    editado por quem nao pode excluir) e nao e um caso de uso hoje (a UI
--    nao permite editar um chamado excluido).
-- 2. `comercial`/`administrativo` CONSEGUEM gravar `is_deleted = false`
--    (reverter/"undelete") -- a regra pedida foi restringir quem MARCA
--    `is_deleted = true`, nao quem reverte. Se a UI algum dia expuser uma
--    acao de "restaurar chamado excluido" para esses papeis, este e o
--    comportamento correto; se a intencao de produto for restringir
--    tambem o undelete a admin, revisitar esta policy (trocar a condicao
--    por uma que dependa do OLD.is_deleted via trigger, ja que WITH CHECK
--    declarativo nao enxerga o valor antigo da linha).

drop policy "maintenance_requests_update_tenant_team" on public.maintenance_requests;

create policy "maintenance_requests_update_tenant_team"
  on public.maintenance_requests
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
    -- So admin pode gravar is_deleted = true (soft-delete). Os outros dois
    -- papeis internos so passam no WITH CHECK se o valor NOVO de
    -- is_deleted continuar false -- ou seja, updates normais (status,
    -- agendamento, notas etc.) continuam liberados pra eles, mas o
    -- soft-delete nao.
    and (
      is_deleted = false
      or (auth.jwt() ->> 'tenant_role') = 'admin'
    )
  );

comment on policy "maintenance_requests_update_tenant_team" on public.maintenance_requests is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo) -- mesma regra de 0039. A '
  'partir de 0040, so admin pode gravar is_deleted = true (soft-delete); '
  'comercial/administrativo continuam liberados pra updates normais '
  '(status, agendamento, notas) mas nao para excluir, batendo com a UI '
  '(MaintenanceListPage.tsx/MaintenanceDetailPage.tsx so mostram "Excluir" '
  'pro admin). Efeito colateral aceito: como o check trava pelo valor NOVO '
  'de is_deleted, nao-admin tambem nao atualiza mais nenhum campo de uma '
  'linha ja excluida, mas ainda consegue reverter is_deleted para false '
  '(undelete nao foi pedido para ser restrito a admin).';

-- Grants: sem mudanca. `authenticated` ja tem select/insert/update em
-- maintenance_requests desde 0037 -- essa migration so troca a definicao da
-- policy de UPDATE, nao altera nenhum grant de tabela.
