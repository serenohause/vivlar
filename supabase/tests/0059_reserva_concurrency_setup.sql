-- 0059_reserva_concurrency_setup.sql
-- Teste de CONCORRÊNCIA REAL para create_public_reservation
-- (supabase/migrations/0059_rls_espelho_vendas.sql) -- duas sessões
-- (conexões) de verdade disputando o `select ... for update` da mesma
-- unidade, não uma simulação sequencial dentro de uma única transação (isso
-- já está coberto, de forma sequencial, no teste (d) de
-- supabase/tests/0059_espelho_vendas_isolation.sql).
--
-- DIFERENÇA DESTE GRUPO DE ARQUIVOS PARA OS OUTROS TESTES DO PROJETO
-- --------------------------------------------------------------------
-- Todo outro teste em supabase/tests/ roda numa única conexão, dentro de
-- `begin; ... rollback;` (0002/0010/0017/etc). Isso NÃO PROVA nada sobre
-- concorrência real -- uma única sessão nunca disputa lock consigo mesma.
-- Provar que o `select ... for update` dentro de create_public_reservation
-- de fato bloqueia uma segunda requisição concorrente (e não só rejeita
-- sequencialmente) exige DUAS conexões de verdade rodando ao mesmo tempo --
-- por isso este teste é dividido em 4 arquivos, executados NESTA ORDEM,
-- com os dois arquivos de sessão rodando EM PARALELO (não em sequência):
--
--   1. supabase/tests/0059_reserva_concurrency_setup.sql   (uma vez, antes)
--   2. supabase/tests/0059_reserva_concurrency_session1.sql (dispara e deixa rodando em background)
--   3. supabase/tests/0059_reserva_concurrency_session2.sql (dispara ~2s depois, enquanto a sessão 1 ainda está com o lock preso em pg_sleep)
--   4. supabase/tests/0059_reserva_concurrency_verify_and_cleanup.sql (uma vez, depois que as duas sessões terminarem)
--
-- COMO RODAR (shell, do diretório raiz do projeto)
-- --------------------------------------------------------------------
--   npx supabase db query --linked -f supabase/tests/0059_reserva_concurrency_setup.sql
--   npx supabase db query --linked -f supabase/tests/0059_reserva_concurrency_session1.sql &
--   sleep 2
--   npx supabase db query --linked -f supabase/tests/0059_reserva_concurrency_session2.sql
--   wait
--   npx supabase db query --linked -f supabase/tests/0059_reserva_concurrency_verify_and_cleanup.sql
--
-- COMPORTAMENTO ESPERADO
-- --------------------------------------------------------------------
-- Sessão 1 termina com sucesso (devolve deal_id/reserva_expira_em) depois
-- de ~6s (o `pg_sleep` artificial que segura o lock). Sessão 2, iniciada
-- ~2s depois, FICA BLOQUEADA no `select ... for update` de dentro de
-- create_public_reservation até a sessão 1 fazer commit -- só então relê o
-- status já 'reservada' e falha com a mensagem "Esta unidade acabou de ser
-- reservada por outro interessado" (mesma mensagem do teste sequencial). O
-- script de verificação confirma: exatamente 1 deal, 1 client, 1
-- status_transition, 1 public_lead convertido para a unidade -- nunca 2.
--
-- LIMPEZA
-- --------------------------------------------------------------------
-- Diferente dos outros testes (begin/rollback), este PRECISA committar de
-- verdade (é o commit da sessão 1 que libera o lock para a sessão 2
-- observar o estado atualizado) -- por isso o arquivo de verificação
-- também apaga toda a linha sintética ao final. Se o teste for interrompido
-- no meio, rode a query de limpeza do arquivo 4 manualmente para não deixar
-- lixo na tabela (tenant_id = 'f7711111-1111-1111-1111-111111111111').

insert into public.tenants (id, name, slug) values (
  'f7711111-1111-1111-1111-111111111111',
  'Tenant Teste Concorrencia 0059',
  'tenant-teste-concorrencia-0059'
);

insert into public.projects (id, tenant_id, code, name, slug, is_public, reserva_horas) values (
  'f7721111-1111-1111-1111-111111111111',
  'f7711111-1111-1111-1111-111111111111',
  'PRJ-CONC-0059',
  'Projeto Teste Concorrencia 0059',
  'projeto-teste-concorrencia-0059',
  true,
  24
);

insert into public.units (id, tenant_id, project_id, sku, list_price, status) values (
  'f7731111-1111-1111-1111-111111111111',
  'f7711111-1111-1111-1111-111111111111',
  'f7721111-1111-1111-1111-111111111111',
  'UN-CONC-0059',
  180000,
  'disponivel'
);

select 'setup concluido' as resultado;
