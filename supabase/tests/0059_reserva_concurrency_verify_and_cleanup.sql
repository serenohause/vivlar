-- 0059_reserva_concurrency_verify_and_cleanup.sql
-- Parte 4/4 do teste de concorrência real -- ver cabeçalho de
-- 0059_reserva_concurrency_setup.sql. Roda DEPOIS que as sessões 1 e 2
-- terminarem (sessão 2 deve ter falhado com erro -- normal, ver seu
-- cabeçalho). Confirma que a unidade ficou reservada exatamente 1 vez
-- (nunca 2, nunca num estado inconsistente) e depois apaga toda a linha
-- sintética criada por este grupo de testes (tenant_id =
-- 'f7711111-1111-1111-1111-111111111111').

select
  u.status as unit_status,
  u.active_deal_id,
  (select count(*) from public.deals where unit_id = u.id) as deals_count,
  (select count(*) from public.status_transitions where unit_id = u.id) as transitions_count,
  (select count(*) from public.public_leads where unit_id = u.id and intent = 'reserva' and status = 'convertido') as leads_convertidos_count,
  (select count(*) from public.clients where tenant_id = u.tenant_id) as clients_count
from public.units u
where u.id = 'f7731111-1111-1111-1111-111111111111';

-- Limpeza -- ordem respeita FKs (leads/transitions/deals antes de
-- units/clients, active_deal_id zerado antes de apagar deals).
update public.units set active_deal_id = null
where id = 'f7731111-1111-1111-1111-111111111111';

delete from public.status_transitions where unit_id = 'f7731111-1111-1111-1111-111111111111';
delete from public.public_leads where project_id = 'f7721111-1111-1111-1111-111111111111';
delete from public.deals where unit_id = 'f7731111-1111-1111-1111-111111111111';
delete from public.clients where tenant_id = 'f7711111-1111-1111-1111-111111111111';
delete from public.units where id = 'f7731111-1111-1111-1111-111111111111';
delete from public.projects where id = 'f7721111-1111-1111-1111-111111111111';
delete from public.tenants where id = 'f7711111-1111-1111-1111-111111111111';

select 'limpeza concluida' as resultado;
