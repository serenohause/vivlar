-- 0067_finance_events_observacao.sql
-- Adiciona o valor `observacao` a `finance_event_type` -- pré-requisito da
-- RPC `run_finance_checkup` (0068_finance_checkup_rpc.sql), que grava um
-- `finance_events` documentando merges de carteira duplicada e remoções de
-- parcela duplicada. `OBSERVACAO` foi deliberadamente OMITIDO em
-- 0021_finance_events.sql porque `financeCheckup.jsx` (a ferramenta que usa
-- esse tipo no original) estava fora de escopo naquela leva -- agora que o
-- checkup está sendo portado, o enum precisa desse valor.
--
-- MIGRATION SEPARADA DE PROPÓSITO (não junto com 0068): `alter type ... add
-- value` não pode ser usado na MESMA transação em que o novo valor é
-- referenciado, quando o tipo já existe de uma transação anterior --
-- confirmado empiricamente contra o banco remoto deste projeto (Postgres
-- 17): tentar `alter type finance_event_type add value 'observacao'`
-- seguido de um `insert`/cast usando `'observacao'` dentro da MESMA
-- transação estoura `55P04: unsafe use of new value ... New enum values
-- must be committed before they can be used`. Como `supabase db push`
-- aplica cada arquivo de migration como uma única transação (também
-- confirmado empiricamente: uma falha no meio de um arquivo desfaz o
-- arquivo inteiro, incluindo DDL já executado), a única forma segura de
-- adicionar o valor e usá-lo é em dois arquivos/duas transações
-- separadas -- este arquivo só adiciona o valor (commit sozinho); a RPC que
-- o usa vem em 0068, depois deste já ter sido aplicado.

alter type public.finance_event_type add value 'observacao';

comment on type public.finance_event_type is
  'Tipo de evento gravado em finance_events. `observacao` (adicionado aqui)'
  ' é usado pela RPC run_finance_checkup (0068) para documentar merges de'
  ' carteira duplicada e remoções de parcela duplicada -- nenhum outro'
  ' fluxo do produto grava esse tipo.';

-- ---------------------------------------------------------------------
-- RLS: não aplicável -- esta migration só estende um enum já usado por
-- `finance_events`, cuja RLS já existe (0023_rls_financeiro.sql) e não
-- muda aqui. Nenhuma tabela nova, nenhuma policy nova.
-- ---------------------------------------------------------------------
