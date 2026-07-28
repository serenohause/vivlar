-- 0073_rls_whatsapp_sessions.sql
-- RLS de `whatsapp_sessions` (0072_whatsapp_sessions.sql, deixada de
-- proposito com "RLS PENDENTE"). Fecha a lacuna antes de qualquer dado real
-- trafegar por esta tabela.
--
-- CRITERIO DE ACESSO -- CONFIRMADO CONTRA O ORIGINAL, MAIS RESTRITO QUE
-- INVESTIDORES/FINANCEIRO
-- -------------------------------------------------------------------------
-- `original-project/src/Layout.jsx` (linhas 157-171): o item de menu
-- "Sessões WhatsApp" só aparece dentro do bloco
-- `if (user?.role === "admin" || appProfile === "ADMINISTRADOR")`, junto
-- com "Checkup Financeiro" e "Checkup Distratos" -- mesmo gate exato dos
-- dois. Diferente de `investors`/`project_investors`/
-- `investment_contributions`/`investment_returns` (0045), onde
-- comercial/administrativo TAMBÉM leem (só a escrita era admin-only) --
-- aqui nem a LEITURA é liberada pro time comercial/administrativo, porque
-- o próprio menu já esconde a tela inteira deles no original. Não existe
-- nenhuma tela alternativa (fora do menu) que os exponha a esta entidade.
--
-- Nomenclatura da policy de SELECT (`_select_admin`, sem outros papéis no
-- IN): mesmo padrão já usado em `tenant_invites_select_admin` (0063, único
-- outro precedente de "só admin lê, mais ninguém do time interno") --
-- reaproveitado aqui em vez de inventar um nome novo, pra quem auditar RLS
-- reconhecer o padrão pelo nome sem precisar abrir o corpo da policy.
--
-- SELECT: `tenant_id` do claim + `tenant_role = 'admin'`. INSERT/UPDATE/
-- DELETE: SEM NENHUMA POLICY -- ver seção "DECISÃO SOBRE ESCRITA" abaixo
-- pro racional completo. `cliente`/`investidor`: sem policy nenhuma (RLS
-- nega tudo por padrão a eles, sem exceção -- nem leitura, nem escrita).
--
-- DECISÃO SOBRE ESCRITA: NENHUMA POLICY DE INSERT/UPDATE/DELETE AGORA
-- -------------------------------------------------------------------------
-- 0072 já registrou que NADA no original (frontend + as 22 edge functions)
-- cria/atualiza esta entidade -- é puramente lida (`WhatsAppSessions.jsx`,
-- só `.filter(...)`, sem nenhum `.create(`/`.update(` visível em lugar
-- nenhum do repo). Duas opções foram avaliadas:
--
--   (a) abrir INSERT/UPDATE pra `admin` por simetria com o resto do
--       projeto (toda outra tabela admin-gated tem pelo menos alguma
--       escrita liberada pro papel mais alto) e "futuro-proofing" (o dia
--       que um bot for integrado, o caminho já existiria);
--
--   (b) não abrir NENHUMA escrita agora, deixando a tabela genuinamente
--       só-leitura via RLS até um sistema externo precisar gravar nela.
--
-- Decisão: (b). Razões:
--
--   1. Não existe nenhuma ação de UI, nem RPC, nem regra de negócio que
--      justifique um humano (mesmo admin) escrever diretamente em
--      `state`/`status`/`flow_type` desta tabela. Diferente de
--      `investors` (0045) -- onde "admin edita cadastro de investidor" é
--      uma ação de negócio real, só mais sensível -- aqui não há
--      equivalente: a única entidade que teria motivo pra escrever é um
--      bot externo que não existe neste repositório. Abrir escrita pra
--      admin só pra "ter simetria" criaria uma superfície de escrita sem
--      nenhum consumidor real, violando least privilege sem ganho.
--
--   2. Um humano editando `state`/`status` por fora do fluxo do bot
--      corromperia silenciosamente a state machine que um bot externo (se
--      um dia existir) espera controlar sozinho -- o bot não saberia que
--      um humano "pulou" ou "voltou" um estado por baixo dele. Nenhuma
--      tela hoje precisa disso (tela é 100% leitura), então não há
--      trade-off real sendo sacrificado.
--
--   3. O caminho de escrita real, quando essa integração existir, é
--      `service_role` dentro de uma Edge Function (BYPASSRLS -- mesmo
--      raciocínio já registrado em 0002/0045/0047/0055: bypass de
--      service_role só server-side, nunca exposto ao client) -- não
--      precisa de NENHUMA policy de RLS pra `authenticated` pra isso
--      funcionar. Abrir escrita pra `admin` agora não "prepara o terreno"
--      pra essa integração futura -- ela não vai passar por RLS de
--      `authenticated` de jeito nenhum, vai usar a chave de serviço.
--
--   4. Se o produto um dia quiser uma tela de administração manual de
--      sessões (ex: admin encerrar/escalar uma sessão travada na mão),
--      isso é uma decisão de produto explícita e nova -- vira uma
--      migration própria, com sua regra de negócio documentada, igual ao
--      resto deste projeto (nunca "abrir por via das dúvidas").
--
-- CONSEQUÊNCIA NO GRANT: 0072 concedeu `select, insert, update` a
-- `authenticated` (grant pensado antes desta decisão de RLS). Sem NENHUMA
-- policy de insert/update, esse grant fica órfão -- mesmo problema já
-- identificado e corrigido em 0063 (auditoria de grants herdados de
-- 0061/0062: revogado `update` de `doc_requirements` por não ter policy
-- correspondente). Mesmo tratamento aqui: revoga-se `insert`/`update` de
-- `authenticated` explicitamente abaixo, deixando só `select` concedido --
-- o grant nunca deveria sugerir um privilégio que a RLS não torna efetivo.
-- `service_role` não é afetado por este revoke (não está na lista de roles
-- do `to authenticated` nem do revoke -- continua com acesso total via
-- BYPASSRLS + privilégios próprios, fora do escopo de grants explícitos
-- deste projeto, mesma nota de 0003/0045/0047).

alter table public.whatsapp_sessions enable row level security;

create policy "whatsapp_sessions_select_admin"
  on public.whatsapp_sessions
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'admin'
  );

comment on policy "whatsapp_sessions_select_admin" on public.whatsapp_sessions is
  'Isolamento por tenant via claim tenant_id do JWT, leitura restrita a '
  'tenant_role = admin -- mesmo gate do item de menu "Sessões WhatsApp" no '
  'original (Layout.jsx: user?.role === "admin" || appProfile === '
  '"ADMINISTRADOR"), mesmo critério de Checkup Financeiro/Checkup '
  'Distratos. comercial/administrativo/cliente/investidor SEM acesso -- '
  'diferente de investors (0045), onde comercial/administrativo liam. '
  'Sem policy de INSERT/UPDATE/DELETE de propósito -- ver racional '
  'completo no topo de 0073_rls_whatsapp_sessions.sql.';

-- Grant órfão (0072 concedeu insert/update a `authenticated` antes desta
-- decisão de RLS) -- revogado, sem policy nenhuma que os torne efetivos.
-- Mesmo tratamento de 0063 (revoke de update em doc_requirements).
revoke insert, update on public.whatsapp_sessions from authenticated;

-- ---------------------------------------------------------------------
-- NÃO coberto por esta migration (documentado, não resolvido aqui)
-- ---------------------------------------------------------------------
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function desta
-- entidade existe hoje (nenhum bot de WhatsApp integrado neste
-- repositório -- ver 0072). Ponto a revisitar quando/se uma for criada:
-- `service_role` só pode ser usado server-side (dentro da Edge Function,
-- nunca embutido/exposto num client React), mesma regra já documentada em
-- 0002/0045/0047/0051/0055/0063. Ver
-- supabase/tests/0073_whatsapp_sessions_isolation.sql para o teste de
-- isolamento cross-tenant e de gate por papel correspondente a esta
-- migration.
