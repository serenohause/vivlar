-- 0059_reserva_concurrency_session2.sql
-- Parte 3/4 do teste de concorrência real -- ver cabeçalho de
-- 0059_reserva_concurrency_setup.sql para a ordem completa de execução.
-- Deve ser disparado ~2s depois da sessão 1 (enquanto ela ainda segura o
-- lock da unidade dentro do pg_sleep), como uma segunda conexão em
-- paralelo, nunca depois da sessão 1 terminar.
--
-- RESULTADO ESPERADO: este comando FALHA (erro esperado, não um bug) --
-- fica bloqueado no `select ... for update` interno de
-- create_public_reservation até a sessão 1 commitar, relê o status já
-- 'reservada' e levanta a exceção "Esta unidade acabou de ser reservada
-- por outro interessado. Por favor, escolha outra unidade." Se este comando
-- SUCEDER, é uma falha grave de atomicidade (duas reservas na mesma
-- unidade).

begin;

set local role anon;

select public.create_public_reservation(
  'f7721111-1111-1111-1111-111111111111'::uuid,
  'f7731111-1111-1111-1111-111111111111'::uuid,
  'Sessao Dois Concorrencia',
  '(85) 99999-1002',
  '222.333.444-05'
) as resultado_sessao_2;

commit;
