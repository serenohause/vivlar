-- 0069_activity_type_status_change.sql
-- Automação de Distrato — fecha o débito técnico de
-- `original-project/src/pages/UnitDetail.jsx` /
-- `original-project/src/components/unit/unitStatusHelpers.jsx`.
--
-- Confirmado por leitura direta do código-fonte que praticamente todo o
-- schema necessário já existe: `deals.distrato_at`/`distrato_reason`/
-- `distrato_by_user_id` (0014), `deal_sales_stage` já tem 'distratado' e
-- 'perdido' (0014), `unit_admin_status` já tem 'distrato' (0008),
-- `documents.doc_type` já tem 'termo_distrato' e `document_status` já tem
-- 'aprovado' (0030), `status_transitions.transition_type` já suporta
-- 'admin' (0016), `notifications.type` já é `text` livre — não enum — logo
-- os valores "CRM"/"VENDA" usados nos dois fluxos de distrato já passam
-- sem alteração (0064).
--
-- ÚNICO GAP REAL: `resetUnitMcmvFlow` (unitStatusHelpers.jsx) cria um
-- registro em `Activity` com `type: "STATUS_CHANGE"` ao reabrir o ciclo
-- MCMV de uma unidade que estava em DISTRATO e recebe uma nova negociação
-- ativa. `activity_type` (0015_activities.sql) só tinha 'ligacao' /
-- 'whatsapp' / 'documento' / 'visita' / 'pendencia' / 'outro' — sem
-- equivalente para mudança de status. Esta migration adiciona o valor.
--
-- Sem tabela nova, sem tenant_id novo, sem índice novo: é só a extensão
-- de um enum já existente, então não há RLS nova para configurar aqui.
--
-- `ALTER TYPE ... ADD VALUE` não pode rodar dentro do mesmo bloco de
-- transação em que o valor novo já é usado — mas esta migration só
-- adiciona o valor, não o utiliza, então é segura como está.

alter type activity_type add value 'status_change';

comment on type activity_type is
  'Tipo de atividade do log de interações (activities). status_change '
  'adicionado em 0069 para suportar o registro automático de reabertura '
  'de ciclo MCMV pós-distrato (resetUnitMcmvFlow, ver UnitDetail.jsx / '
  'unitStatusHelpers.jsx do original) — os demais valores vêm de '
  '0015_activities.sql.';
