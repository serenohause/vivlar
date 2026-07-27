-- 0058_units_active_deal_id.sql
-- Fecha o débito deixado propositalmente em `0008_units.sql`: `units.
-- active_deal_id`, adiado porque `deals` ainda não existia naquela leva.
-- `deals` existe desde o módulo 4 (0014_deals.sql), mas nenhum fluxo até
-- agora precisava gravar nela. O Módulo 13 (Espelho de Vendas) é o
-- primeiro: o fluxo de reserva pública (`LeadForm.jsx`, `handleReserva`)
-- grava `Unit.active_deal_id = deal.id` ao criar o Deal de reserva.
--
-- Nullable, sem `on delete cascade` — mesma convenção de tenant_id/FKs
-- já estabelecida em 0001 e mantida em toda tabela desde então.
--
-- Sem lógica de escrita aqui: nenhuma tela existente grava nesta coluna
-- ainda. Quem passa a gravar é a RPC de reserva pública que o
-- `rls-guardian` escreve na próxima etapa (junto com a RLS de
-- `public_leads`).
--
-- RLS: units já tem RLS habilitada desde 0010_rls_catalog.sql (policies de
-- select/insert/update para a equipe interna do tenant) — essa coluna nova
-- entra sob as policies já existentes, nenhuma policy nova é necessária só
-- por causa dela. A RPC de reserva (rls-guardian, próxima etapa) roda como
-- security definer e não depende de policy de update em nome do anon.

alter table units
  add column active_deal_id uuid references deals(id);

comment on column units.active_deal_id is
  'Deal ativo corrente desta unidade (reserva/negociação em andamento). '
  'Espelha deals.is_active=true para a mesma unidade — gravado pela RPC de '
  'reserva pública do espelho de vendas (rls-guardian), não por nenhuma '
  'tela administrativa ainda. Sem on delete cascade, mesma convenção do '
  'resto do schema.';

-- Índice parcial: lookup direto feito pela RPC de reserva (checar/atualizar
-- o deal ativo de uma unidade) e por telas futuras de detalhe de unidade.
-- Parcial porque a coluna é nula na maior parte das linhas (unidade sem
-- negócio ativo) -- mesmo raciocínio do índice único parcial de
-- clients.cpf em 0011.
create index units_tenant_id_active_deal_id_idx
  on units (tenant_id, active_deal_id)
  where active_deal_id is not null;

-- ---------------------------------------------------------------------
-- RLS: nenhuma mudança de policy necessária nesta migration (ver
-- comentário acima) -- units já tem RLS habilitada desde 0010. Se o
-- rls-guardian identificar necessidade de policy dedicada para esta
-- coluna (ex: update restrito por role em vez de via RPC), fica a cargo
-- dele na próxima etapa.
-- ---------------------------------------------------------------------
