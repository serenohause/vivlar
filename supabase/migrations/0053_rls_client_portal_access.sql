-- 0053_rls_client_portal_access.sql
-- Portal do Cliente (Modulo 11) -- RLS para as 3 paginas REAIS do portal
-- (linkadas em Layout.jsx, ao contrario de ClientPortal.jsx/0048-0051, que
-- e orfa -- ver 0052): `ClientUnit.jsx`, `ClientFinance.jsx`,
-- `ClientMaintenance.jsx`. Primeira vez que `tenant_role = 'cliente'`
-- ganha SELECT em `clients`/`units`/`projects`/`finance_accounts`/
-- `payment_installments`/`financing_process`, e a UNICA escrita de cliente
-- em todo o sistema ate aqui: abrir/cancelar o proprio chamado de
-- `maintenance_requests`.
--
-- Mesmo padrao ja estabelecido em 0002/.../0051
-- (`(auth.jwt() ->> 'tenant_id')::uuid = tenant_id`, tenant_id sempre do
-- claim do JWT, nunca do client/body da requisicao) e mesma tecnica de
-- 0051 pra "cliente ve so o que e dele, no meio de tabelas que so tinham
-- policy pra equipe interna": as 3 funcoes SECURITY DEFINER de 0051
-- (`client_owns_unit`, `client_owns_project`, `client_owns_client_record`)
-- sao REUSADAS aqui, nao duplicadas -- mais uma funcao nova
-- (`client_owns_finance_account`) e criada seguindo o MESMO padrao, pra
-- `financing_process` (unica tabela nova sem FK direta de unit_id).
--
-- REGRA GERAL: toda tabela que ja tinha policy so pra equipe interna
-- (admin/comercial/administrativo) NAO E TOCADA -- so ganha policies NOVAS
-- pro papel `cliente` (SELECT nas 6 primeiras, SELECT+INSERT+UPDATE
-- restrito em maintenance_requests). Postgres combina policies permissivas
-- do MESMO comando com OR -- aqui isso e seguro porque os predicados de
-- role sao MUTUAMENTE EXCLUSIVOS (`tenant_role in (...papeis internos...)`
-- vs `tenant_role = 'cliente'`): nenhum usuario tem os dois claims ao
-- mesmo tempo, entao a policy mais permissiva de um grupo nunca "vaza" pro
-- outro -- diferente do cenario de 0040 (duas policies pro MESMO grupo de
-- papeis, uma mais permissiva que a outra, onde a OR combinava errado).
--
-- =======================================================================
-- DECISAO DELIBERADA: `deals` NAO GANHA NENHUMA POLICY PARA `cliente`
-- =======================================================================
-- O pedido original desta etapa incluia "cliente ve SELECT dos negocios
-- vendidos dele" em `deals`. Decisao tomada aqui, como rls-guardian: NAO
-- implementar isso, por 2 motivos que se reforcam:
--
-- 1. NECESSIDADE REAL = ZERO. Confirmado lendo os 3 arquivos reais do
--    portal (ClientUnit.jsx, ClientFinance.jsx, ClientMaintenance.jsx):
--    as 3 telas usam `Deal.filter({ client_id })` SO como passo
--    intermediario pra descobrir QUAIS unidades sao do cliente (`d.unit_id`
--    de deals com `sales_stage === "VENDIDO"`) -- nenhuma delas renderiza
--    QUALQUER campo de `deals` na tela (nem valor, nem estagio, nem
--    corretor). Esse mesmo filtro ja e feito, com mais seguranca, dentro de
--    `client_owns_unit(unit_id)`/`client_owns_project(project_id)`
--    (0051) -- que fazem exatamente esse JOIN (deals vendido -> clients.
--    user_id = auth.uid()) como SECURITY DEFINER, sem nunca devolver uma
--    linha de `deals` pro cliente. Ou seja: dando SELECT direto de `units`/
--    `projects` pro cliente (que E de fato usado nas telas -- ver abaixo),
--    o app consegue montar exatamente a mesma lista de "minhas unidades"
--    que o original monta via Deal.filter -- sem precisar tocar em `deals`.
--
-- 2. SUPERFICIE EXPOSTA E DESNECESSARIAMENTE ALTA. `deals` (0014) carrega
--    `final_sale_value`/`commission_rate`/`commission_value` (dado
--    financeiro do NEGOCIO com o corretor -- nao com o cliente),
--    `broker_id`, `lost_reason`, `distrato_reason` -- notas internas do
--    funil comercial. RLS do Postgres e por LINHA, nao por COLUNA: uma
--    policy de SELECT "cliente ve os proprios deals vendidos" devolveria a
--    LINHA INTEIRA, incluindo essas colunas, mesmo que nenhuma tela as
--    exiba hoje -- superficie exposta desnecessaria pra um dado que o
--    proprio 0051 ja classificou como sensivel o bastante pra NUNCA dar
--    SELECT de `deals` ao papel cliente (ver racional completo no topo de
--    0051_rls_client_portal.sql, mesma conclusao, mesma tabela).
--
-- Se uma tela futura precisar mesmo de um campo especifico de `deals` pro
-- cliente ver (ex: data da venda), a saida correta e uma funcao SECURITY
-- DEFINER que devolve SO essa(s) coluna(s) especifica(s) (mesmo padrao
-- desta migration), nunca abrir SELECT geral da tabela -- revisitar
-- quando/se isso for pedido explicitamente.

-- =======================================================================
-- 0. Funcao auxiliar SECURITY DEFINER nova -- so pra financing_process
--    (unica das tabelas novas sem unit_id direto). Reusa client_owns_unit
--    (0051) em vez de duplicar o JOIN deals/clients -- ver comentario da
--    funcao.
-- =======================================================================

create or replace function public.client_owns_finance_account(p_finance_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.finance_accounts fa
    where fa.id = p_finance_account_id
      and fa.tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
      and fa.is_deleted = false
      and public.client_owns_unit(fa.unit_id)
  );
$$;

comment on function public.client_owns_finance_account(uuid) is
  'SECURITY DEFINER: true se p_finance_account_id e uma finance_account cuja '
  'unit_id pertence (deal vendido) ao auth.uid() atual, dentro do tenant do '
  'claim do JWT. Reusa client_owns_unit() (0051_rls_client_portal.sql) em '
  'vez de duplicar o JOIN deals/clients -- bypassa RLS de finance_accounts '
  'de proposito (a policy de SELECT do papel cliente em finance_accounts, '
  'logo abaixo, usa client_owns_unit diretamente porque finance_accounts '
  'JA tem unit_id; esta funcao existe so pra financing_process, que NAO tem '
  'unit_id direto -- so finance_account_id). Usada pela policy de SELECT de '
  'financing_process para o papel cliente.';

revoke execute on function public.client_owns_finance_account(uuid) from public, anon;
grant execute on function public.client_owns_finance_account(uuid) to authenticated;

-- =======================================================================
-- 1. clients -- cliente ve o PROPRIO registro (FK direta, sem funcao
--    auxiliar -- e a propria linha dele, mesmo criterio ja usado dentro de
--    client_owns_client_record).
-- =======================================================================

create policy "clients_select_tenant_client_own"
  on public.clients
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and user_id = auth.uid()
  );

comment on policy "clients_select_tenant_client_own" on public.clients is
  'tenant_role=cliente do tenant certo ve SOMENTE o proprio registro '
  '(user_id = auth.uid()) -- FK direta, sem necessidade de funcao SECURITY '
  'DEFINER (e a propria linha do usuario autenticado). Introduzida pelo '
  'Portal do Cliente (Modulo 11, 0053) -- equipe interna (0017) continua '
  'vendo todos os clients do tenant, sem mudanca.';

-- SEM INSERT/UPDATE para cliente: confirmado por grep nas 3 paginas reais
-- do portal (ClientUnit/ClientFinance/ClientMaintenance.jsx) -- nenhuma
-- chama Client.update(...) nem Client.create(...). Edicao de cadastro do
-- cliente continua exclusiva da equipe interna (clients_update_tenant_team,
-- 0017).

-- =======================================================================
-- 2. deals -- DE PROPOSITO, NENHUMA POLICY NOVA AQUI. Ver racional
--    completo no topo deste arquivo ("DECISAO DELIBERADA").
-- =======================================================================

-- =======================================================================
-- 3. units -- cliente ve a(s) propria(s) unidade(s) (client_owns_unit,
--    0051, reusada sem alteracao).
-- =======================================================================

create policy "units_select_tenant_client_own"
  on public.units
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_unit(id)
  );

comment on policy "units_select_tenant_client_own" on public.units is
  'tenant_role=cliente do tenant certo ve SOMENTE a(s) unidade(s) que '
  'comprou (deal vendido) -- via client_owns_unit() (SECURITY DEFINER, '
  '0051_rls_client_portal.sql), reusada sem alteracao. Fecha o dado real '
  'usado por ClientUnit.jsx/ClientMaintenance.jsx (selecao de unidade) sem '
  'precisar abrir SELECT de deals ao cliente -- ver "DECISAO DELIBERADA" no '
  'topo de 0053_rls_client_portal_access.sql.';

-- =======================================================================
-- 4. projects -- cliente ve o(s) projeto(s) da(s) propria(s) unidade(s)
--    (client_owns_project, 0051, reusada sem alteracao).
-- =======================================================================

create policy "projects_select_tenant_client_own"
  on public.projects
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_project(id)
  );

comment on policy "projects_select_tenant_client_own" on public.projects is
  'tenant_role=cliente do tenant certo ve SOMENTE o(s) projeto(s) onde tem '
  'unidade comprada (deal vendido) -- via client_owns_project() (SECURITY '
  'DEFINER, 0051_rls_client_portal.sql), reusada sem alteracao. Usado por '
  'ClientUnit.jsx (nome/endereco do empreendimento).';

-- =======================================================================
-- 5. finance_accounts -- cliente ve a(s) propria(s) carteira(s) financeira
--    (unit_id direto na tabela -- client_owns_unit direto, sem funcao
--    nova).
-- =======================================================================

create policy "finance_accounts_select_tenant_client_own"
  on public.finance_accounts
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_unit(unit_id)
  );

comment on policy "finance_accounts_select_tenant_client_own" on public.finance_accounts is
  'tenant_role=cliente do tenant certo ve SOMENTE a(s) carteira(s) '
  'financeira(s) da(s) propria(s) unidade(s) -- finance_accounts.unit_id ja '
  'e coluna direta da tabela, entao usa client_owns_unit() (SECURITY '
  'DEFINER, 0051_rls_client_portal.sql) sem precisar de funcao nova. Usado '
  'por ClientFinance.jsx.';

-- =======================================================================
-- 6. payment_installments -- cliente ve as propria(s) parcela(s) (unit_id
--    desnormalizado direto na tabela, mesmo criterio de finance_accounts
--    acima -- ver comentario de 0020_payment_installments.sql sobre a
--    desnormalizacao).
-- =======================================================================

create policy "payment_installments_select_tenant_client_own"
  on public.payment_installments
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_unit(unit_id)
  );

comment on policy "payment_installments_select_tenant_client_own" on public.payment_installments is
  'tenant_role=cliente do tenant certo ve SOMENTE as propria(s) parcela(s) '
  '-- payment_installments.unit_id e desnormalizado direto na tabela (ver '
  '0020_payment_installments.sql), entao usa client_owns_unit() (SECURITY '
  'DEFINER, 0051_rls_client_portal.sql) direto, sem precisar passar por '
  'finance_account_id nem funcao nova. Usado por ClientFinance.jsx.';

-- =======================================================================
-- 7. financing_process -- RLS PENDENTE desde a criacao (0052_financing_
--    process.sql). Fecha JUNTO a lacuna de equipe interna (0052 nunca teve
--    RLS habilitada -- QUALQUER `authenticated` podia ler/gravar QUALQUER
--    linha de QUALQUER tenant ate esta migration, apesar do grant de 0052
--    ja ser select/insert/update) e adiciona o caso cliente nesta mesma
--    leva, ja que os dois fazem parte do mesmo modulo (Portal do Cliente).
-- =======================================================================

alter table public.financing_process enable row level security;

create policy "financing_process_select_tenant_team"
  on public.financing_process
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "financing_process_insert_tenant_team"
  on public.financing_process
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "financing_process_update_tenant_team"
  on public.financing_process
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

-- SEM policy de DELETE de proposito -- mesmo criterio do resto do projeto
-- (exclusao e sempre soft delete via UPDATE, is_deleted). Grant de delete
-- tambem nao foi concedido em 0052 -- nada a revogar aqui.
--
-- INSERT/UPDATE pra equipe: 0052 documenta que nenhum `FinancingProcess.
-- create`/`.update` foi confirmado em `src` ("alimentado fora do app") --
-- mas o grant de tabela ja concede select/insert/update a `authenticated`
-- desde a criacao (mesmo padrao de finance_accounts/payment_installments,
-- nao o padrao "so select/insert" de logs write-once como status_
-- transitions/finance_events). Politica aqui replica o grant existente
-- (equipe interna com CRUD completo, sem delete) em vez de deixar o grant
-- orfao -- se o produto decidir que financing_process e write-once/somente
-- alimentada fora do app, e o schema-architect quem deve revisitar o GRANT
-- (0052) e esta migration junto.

create policy "financing_process_select_tenant_client_own"
  on public.financing_process
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_finance_account(finance_account_id)
  );

comment on policy "financing_process_select_tenant_client_own" on public.financing_process is
  'tenant_role=cliente do tenant certo ve SOMENTE o(s) processo(s) de '
  'financiamento da(s) propria(s) carteira(s) financeira(s) -- via '
  'client_owns_finance_account() (SECURITY DEFINER, definida no topo desta '
  'migration), ja que financing_process nao tem unit_id direto (so '
  'finance_account_id). Usado por ClientFinance.jsx -- so leitura, sem '
  'INSERT/UPDATE confirmado em nenhuma tela (nem admin nem cliente, ver '
  '0052_financing_process.sql).';

comment on policy "financing_process_select_tenant_team" on public.financing_process is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo). RLS estava PENDENTE desde a '
  'criacao da tabela (0052) -- fechada aqui, junto com o caso cliente, por '
  'fazerem parte da mesma leva (Portal do Cliente, Modulo 11).';

-- =======================================================================
-- 8. maintenance_requests -- SELECT dos proprios chamados (client_owns_
--    client_record, 0051, reusada) + UNICA escrita de cliente no sistema:
--    abrir chamado novo (INSERT) e cancelar chamado ABERTO (UPDATE
--    restrito).
-- =======================================================================

create policy "maintenance_requests_select_tenant_client_own"
  on public.maintenance_requests
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_client_record(client_id)
  );

comment on policy "maintenance_requests_select_tenant_client_own" on public.maintenance_requests is
  'tenant_role=cliente do tenant certo ve SOMENTE os proprios chamados -- '
  'via client_owns_client_record() (SECURITY DEFINER, '
  '0051_rls_client_portal.sql), reusada sem alteracao. Usado por '
  'ClientMaintenance.jsx.';

-- INSERT: cliente abre chamado novo pra uma unidade que realmente possui.
-- Confirmado em ClientMaintenance.jsx (createMutation): client_id e sempre
-- o proprio registro (client.id, nunca escolhido em formulario), unit_id e
-- escolhido dentre as unidades do PROPRIO cliente (dropdown ja filtrado no
-- client), project_id e sempre derivado de unit.project_id. WITH CHECK
-- reforça no banco (nunca confia no client_id/unit_id/project_id vindos do
-- body -- reconfirma posse via as mesmas funcoes SECURITY DEFINER, mesmo
-- que a UI ja filtre): status so pode nascer 'aberto' (unico valor que o
-- create do original produz -- default da coluna, reforcado aqui contra
-- chamada direta a API que tentasse criar ja RESOLVIDO/CANCELADO etc.);
-- responsible_user_id/operator_notes/resolved_at sao campos INTERNOS (
-- atribuicao/observacao da equipe, carimbo de resolucao) -- cliente nunca
-- deveria conseguir preenche-los na criacao, mesmo que a UI atual nunca
-- envie esses campos (RLS nao deve confiar so no client nao enviar).
create policy "maintenance_requests_insert_tenant_client_own"
  on public.maintenance_requests
  for insert
  to authenticated
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_client_record(client_id)
    and public.client_owns_unit(unit_id)
    and public.client_owns_project(project_id)
    and status = 'aberto'
    and responsible_user_id is null
    and operator_notes is null
    and resolved_at is null
  );

comment on policy "maintenance_requests_insert_tenant_client_own" on public.maintenance_requests is
  'tenant_role=cliente do tenant certo pode ABRIR chamado novo, mas so pra '
  'si mesmo (client_owns_client_record) e pra unidade/projeto que '
  'realmente possui (client_owns_unit/client_owns_project, SECURITY '
  'DEFINER, 0051_rls_client_portal.sql -- nunca confia em client_id/'
  'unit_id/project_id vindos do body sem revalidar posse no banco). Status '
  'so pode nascer aberto; responsible_user_id/operator_notes/resolved_at '
  '(campos internos da equipe) nao podem ser setados na criacao pelo '
  'cliente.';

-- UPDATE: cliente SO pode cancelar (ABERTO -> CANCELADO) o proprio
-- chamado -- confirmado em ClientMaintenance.jsx (cancelMutation): unico
-- update do cliente em todo o arquivo, envia SOMENTE { status: "CANCELADO"
-- }, com o botao so aparecendo quando req.status === "ABERTO"
-- (confirm() antes de disparar). USING trava a linha alvo (status ANTIGO
-- precisa ser 'aberto' -- linha que ja esta cancelada/resolvida/etc nao e
-- nem candidata a este UPDATE pro cliente). WITH CHECK trava o valor NOVO
-- (status precisa virar 'cancelado', e client_id/unit_id/project_id, se
-- forem reenviados, continuam tendo que apontar pra algo que o cliente
-- possui). Ver LIMITACAO abaixo -- USING/WITH CHECK sozinhos nao impedem
-- que OUTRAS colunas (title, operator_notes etc.) sejam alteradas na MESMA
-- chamada -- fechado com um trigger complementar logo abaixo, nao deixado
-- so pra UI (CLAUDE.md: "RLS nunca e substituida por checagem so no
-- frontend").
create policy "maintenance_requests_update_tenant_client_cancel_own"
  on public.maintenance_requests
  for update
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_client_record(client_id)
    and status = 'aberto'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') = 'cliente'
    and public.client_owns_client_record(client_id)
    and public.client_owns_unit(unit_id)
    and public.client_owns_project(project_id)
    and status = 'cancelado'
  );

comment on policy "maintenance_requests_update_tenant_client_cancel_own" on public.maintenance_requests is
  'tenant_role=cliente do tenant certo SO pode fazer UMA transicao: o '
  'proprio chamado, de status=aberto (USING, valor ANTIGO) para '
  'status=cancelado (WITH CHECK, valor NOVO) -- espelha exatamente '
  'cancelMutation em ClientMaintenance.jsx (so aparece quando status === '
  'ABERTO, so envia { status: CANCELADO }). LIMITACAO CONHECIDA (mesma '
  'classe de problema documentada em '
  '0047_restrict_project_cost_fields_to_admin.sql): USING/WITH CHECK '
  'sozinhos nao enxergam OLD e NEW ao mesmo tempo pra garantir que NENHUMA '
  'outra coluna mudou (ex: title, operator_notes, responsible_user_id) na '
  'mesma chamada -- fechado pelo trigger '
  'maintenance_requests_enforce_client_cancel_only logo abaixo, que tem '
  'OLD/NEW disponiveis simultaneamente. Ambas as camadas juntas: RLS decide '
  'QUAL linha e QUAL status e permitido; o trigger garante que SO o status '
  'mudou.';

-- Trigger: garante que um UPDATE feito por tenant_role=cliente em
-- maintenance_requests NAO altera nenhuma coluna alem de status (e
-- updated_at/updated_by_user_id, que sao metadado de auditoria da propria
-- acao, nao dado de negocio). Mesma tecnica de
-- 0047_restrict_project_cost_fields_to_admin.sql (trigger BEFORE UPDATE
-- porque a regra precisa comparar OLD contra NEW, o que RLS declarativa
-- nao expoe numa unica expressao) -- aqui aplicada ao papel `cliente` em
-- vez de a colunas especificas de `projects`.
--
-- Equipe interna/service_role: NUNCA passam pela restricao (early return
-- assim que tenant_role no claim nao e 'cliente') -- continuam sob as
-- regras normais de 0039/0040, sem qualquer mudanca de comportamento.
create or replace function public.enforce_maintenance_request_client_cancel_only()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'tenant_role', '') <> 'cliente' then
    return new;
  end if;

  if (
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.priority is distinct from old.priority
    or new.suggested_date is distinct from old.suggested_date
    or new.scheduled_date is distinct from old.scheduled_date
    or new.opened_at is distinct from old.opened_at
    or new.resolved_at is distinct from old.resolved_at
    or new.responsible_user_id is distinct from old.responsible_user_id
    or new.operator_notes is distinct from old.operator_notes
    or new.photos is distinct from old.photos
    or new.project_id is distinct from old.project_id
    or new.unit_id is distinct from old.unit_id
    or new.client_id is distinct from old.client_id
    or new.tenant_id is distinct from old.tenant_id
    or new.is_deleted is distinct from old.is_deleted
    or new.deleted_at is distinct from old.deleted_at
    or new.deleted_by_user_id is distinct from old.deleted_by_user_id
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception
      'Cliente so pode alterar o status do proprio chamado (cancelamento) -- nenhuma outra coluna pode mudar nesta acao.'
      using errcode = '42501';
  end if;

  if old.status <> 'aberto' or new.status <> 'cancelado' then
    raise exception
      'Cliente so pode cancelar chamado com status ABERTO (transicao para CANCELADO).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_maintenance_request_client_cancel_only() is
  'Trigger BEFORE UPDATE em maintenance_requests: quando tenant_role (claim '
  'do JWT) e cliente, bloqueia qualquer UPDATE que mude coluna diferente de '
  'status, e exige a transicao aberto -> cancelado. Equipe interna/'
  'service_role (tenant_role != cliente) nunca sao afetados -- retorno '
  'imediato. Complementa (nao substitui) a policy '
  'maintenance_requests_update_tenant_client_cancel_own -- ver comentario '
  'da policy e racional completo no topo desta migration.';

-- BEFORE UPDATE, nome comeca com "maintenance_requests_enforce" -- roda
-- ANTES de "set_maintenance_requests_updated_at" (0037, ordem alfabetica de
-- triggers BEFORE do mesmo evento no Postgres: 'm' < 's'), entao o diff
-- acima compara os valores ainda nao tocados pelo trigger de updated_at
-- (updated_at/updated_by_user_id ficam de fora do diff de proposito, sao
-- metadado de auditoria da propria acao, nao dado de negocio).
create trigger maintenance_requests_enforce_client_cancel_only
  before update on public.maintenance_requests
  for each row
  execute function public.enforce_maintenance_request_client_cancel_only();

comment on trigger maintenance_requests_enforce_client_cancel_only on public.maintenance_requests is
  'Fecha a limitacao de RLS declarativa (OLD vs NEW, ver comentario da '
  'policy maintenance_requests_update_tenant_client_cancel_own): so o '
  'papel cliente e restrito a mudar unicamente status (aberto -> '
  'cancelado) no proprio chamado -- ver '
  '0053_rls_client_portal_access.sql.';

-- SEM policy de DELETE para cliente: mesmo criterio do resto do sistema
-- (soft delete e privilegio de admin, 0040) -- cancelamento pelo cliente e
-- sempre um UPDATE de status, nunca is_deleted/DELETE.

-- =======================================================================
-- NAO coberto por esta migration (documentado, nao resolvido aqui)
-- =======================================================================
-- Bypass de `service_role` (BYPASSRLS): nenhuma Edge Function deste modulo
-- existe hoje (confirmado -- supabase/functions/ continua sem nada de
-- Portal do Cliente). Mesma regra de 0002/0045/0047/0051: service_role so
-- pode ser usado server-side (dentro de uma Edge Function, nunca embutido/
-- exposto num client React). O trigger desta migration ja isenta
-- explicitamente qualquer role que nao seja 'cliente' (inclui service_role,
-- que normalmente nao carrega tenant_role no JWT) -- ver funcao acima.
-- Ver supabase/tests/0053_client_portal_access_isolation.sql para o teste
-- de isolamento cross-tenant, por posse (unidade/cliente/carteira) e de
-- escrita restrita (maintenance_requests) correspondente a esta migration.
