-- 0059_reserva_concurrency_session1.sql
-- Parte 2/4 do teste de concorrência real -- ver cabeçalho de
-- 0059_reserva_concurrency_setup.sql para a ordem completa de execução.
--
-- Trava manualmente a linha da unidade (como o role de conexão, que tem
-- privilégio de dono -- só para forçar contenção real de propósito neste
-- teste) e SEGURA o lock por ~6s com pg_sleep antes de chamar
-- create_public_reservation como `anon` -- a função reutiliza o mesmo lock
-- (já é a mesma transação), então não espera nada; só COMMIT no final
-- libera o lock. Isso dá tempo de sobra para a sessão 2 iniciar enquanto
-- esta sessão ainda segura a linha.

begin;

select id, status from public.units
where id = 'f7731111-1111-1111-1111-111111111111'
for update;

select pg_sleep(6);

set local role anon;

select public.create_public_reservation(
  'f7721111-1111-1111-1111-111111111111'::uuid,
  'f7731111-1111-1111-1111-111111111111'::uuid,
  'Sessao Um Concorrencia',
  '(85) 99999-1001',
  '111.222.333-96'
) as resultado_sessao_1;

commit;
