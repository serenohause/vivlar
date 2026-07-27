-- 0059_rls_espelho_vendas.sql
-- Módulo 13 (Espelho de Vendas) — primeira vez no projeto inteiro em que o
-- papel `anon` (visitante da internet, sem login) precisa de qualquer
-- capacidade de leitura ou escrita no banco. Até aqui toda RLS deste
-- projeto assume `authenticated` com `tenant_id`/`tenant_role` no claim do
-- JWT (0002/0006) — para `anon` não existe claim nenhum, então a
-- autorização vem inteiramente da lógica dentro de 4 funções `security
-- definer`, nunca de grant direto de tabela a `anon`.
--
-- REGRA GERAL DE SUPERFÍCIE (lida antes de alterar): NENHUM `grant
-- select/insert/update` é dado a `anon` em `projects`, `units`, `clients`,
-- `deals`, `status_transitions`, `brokers` nem em `public_leads` nesta
-- migration. As 4 funções abaixo são `security definer`, então rodam com o
-- privilégio do DONO (o role que executa a migration — `postgres`, mesmo
-- padrão já usado por `create_tenant_with_admin`, 0005) — como `postgres` é
-- dono de todas essas tabelas e nenhuma delas tem `FORCE ROW LEVEL
-- SECURITY`, o dono contorna a RLS nativamente, sem precisar de nenhum
-- grant a `anon`/`authenticated` na tabela em si. A única coisa exposta a
-- `anon` é `EXECUTE` nas 4 funções, com todo campo interno/sensível filtrado
-- explicitamente dentro delas (allow-list de campos, nunca `select *`).
--
-- SEARCH_PATH: `set search_path = ''` nas 4 funções, mesmo racional já
-- documentado em 0005_create_tenant_rpc.sql (blindagem contra search_path
-- hijacking) — todo objeto referenciado no corpo é schema-qualificado
-- (`public.projects`, `public.units`, tipos enum `public.unit_status`
-- etc.), exceto o que resolve via `pg_catalog` (sempre pesquisado
-- implicitamente, mesmo com search_path vazio: `now()`, `make_interval`,
-- `btrim`, `regexp_replace`, tipos builtin como `uuid`/`text`/`timestamptz`).
--
-- PARTE 1 — LEITURA PÚBLICA DO CATÁLOGO
-- --------------------------------------
-- `get_public_project(p_slug text)` e `get_public_units(p_project_id uuid)`
-- devolvem só os campos public-safe confirmados por grep em
-- `original-project/src/pages/EspelhoVendas.jsx`,
-- `original-project/src/components/espelho/{EspelhoHero,UnitModal,
-- ImplantacaoInterativa}.jsx` — nunca `projects.notes`,
-- `total_construction_cost`, `total_indirect_costs`, `tenant_id`, nem
-- `units.notes`/`admin_status`. `brokers` não recebe NENHUM acesso público:
-- confirmado por grep que `EspelhoVendas.jsx` busca o broker responsável,
-- mas `UnitModal.jsx` (único componente que recebe o prop `broker`) nunca
-- lê nenhum campo dele — fetch morto no próprio original, não portado aqui.
--
-- `get_public_project` devolve `null` tanto para slug inexistente quanto
-- para projeto privado (`is_public = false`) quanto para deletado
-- (`is_deleted = true`) — mesma resposta pros 3 casos, de propósito, pra não
-- vazar existência de projeto privado por enumeração de slug.
--
-- ACHADO DE AUDITORIA (fora do escopo de RLS, reportado para o
-- schema-architect decidir): `projects.slug` só tem `unique(tenant_id,
-- slug)` (0007) — NÃO é globalmente único entre tenants. Se dois tenants
-- diferentes cadastrarem o mesmo slug (ex: dois clientes da plataforma
-- escolhendo "residencial-brisa"), `get_public_project` devolve um dos dois
-- de forma não determinística sem o `order by ... limit 1` abaixo — com o
-- `limit 1` a resposta fica determinística mas ainda pode ser o projeto
-- "errado" sob a ótica de quem esperava o outro tenant. Não é vazamento de
-- dado privado (ambos são `is_public = true`, só campos public-safe), mas é
-- um bug de roteamento em potencial. Rota `/e/:slug` deveria idealmente
-- exigir slug globalmente único (ou path com prefixo de tenant) — decisão de
-- schema/produto, não resolvida nesta migration.
--
-- PARTE 2 — SUBMISSÃO DO FORMULÁRIO (LeadForm.jsx)
-- --------------------------------------------------
-- `create_public_lead(...)` cobre os intents INTERESSE/LISTA_ESPERA (1
-- INSERT em `public_leads`, tenant_id resolvido a partir de `project_id`,
-- nunca aceito como parâmetro). `create_public_reservation(...)` cobre
-- RESERVA — a peça crítica, atômica: trava a linha da unidade com `select
-- ... for update`, valida disponibilidade, busca/cria `clients` por
-- `(tenant_id, cpf)`, cria `deals`, atualiza `units`, loga
-- `status_transitions` e converte o `public_leads`, tudo dentro de uma
-- única function `plpgsql` — atômica por padrão no Postgres, sem precisar
-- de `begin`/`commit` manual: se qualquer passo falhar, tudo desfaz sozinho.
--
-- ACHADO DE AUDITORIA (bloqueante para um campo do enunciado original, não
-- inventado aqui): `projects.broker_responsavel_id` NÃO EXISTE no schema
-- (confirmado em 0007_projects.sql, comentário de topo: "Fora de escopo
-- aqui... broker_responsavel_id (depende de brokers, módulo futuro de
-- CRM)" — a coluna nunca foi criada). `create_public_reservation` portanto
-- grava `deals.broker_id = null` sempre (coluna é nullable, ver 0014) — não
-- inventamos uma coluna que não existe. Se o produto precisar atribuir
-- corretor responsável automaticamente na reserva pública, é uma migration
-- de schema separada (schema-architect) adicionando
-- `projects.broker_responsavel_id uuid references brokers(id)` antes de
-- alterar esta função.
--
-- CPF: `clients` tem índice único parcial `(tenant_id, cpf) where cpf is
-- not null` (0011) — a função busca por esse par antes de criar, e ainda
-- captura `unique_violation` num sub-bloco `exception` (corrida rara: duas
-- reservas concorrentes com o MESMO cpf em unidades diferentes, ambas
-- passam pelo SELECT antes de qualquer uma inserir) para reaproveitar o
-- client criado pela concorrente em vez de estourar a função inteira —
-- robustez extra além do pedido original, mesmo espírito de "peça crítica
-- precisa ser atômica" do enunciado.
--
-- VALIDAÇÃO MÍNIMA NO BANCO (defesa em profundidade, não substitui o Zod do
-- frontend): nome/telefone não vazios sempre; cpf não vazio e com 11
-- dígitos (sem checar dígito verificador, que fica só no frontend) quando é
-- reserva; e-mail com formato básico quando informado. Mensagens de erro em
-- português, para o frontend exibir direto ou mapear.
--
-- ip_address: fica NULL — não há como capturar IP real de dentro de uma
-- function chamada via `supabase.rpc()` do client sem infraestrutura
-- adicional (nem PostgREST nem `auth.jwt()` expõem o IP do request para uma
-- function comum). Limitação documentada também em 0057_public_leads.sql.
--
-- RATE LIMITING / CAPTCHA: deliberadamente ausente — decisão já tomada com
-- o usuário, risco aceito e documentado, não adicionado aqui.
--
-- RLS de `public_leads`: habilitada nesta migration (ficou pendente desde
-- 0057). `authenticated` com `tenant_role in ('admin','comercial',
-- 'administrativo')` ganha SELECT/UPDATE do próprio tenant — mesmo sem tela
-- ainda (padrão já usado no resto do projeto: RLS pronta antes da UI
-- existir). SEM policy de INSERT para `authenticated`: a única via de
-- escrita é através das 2 functions acima (que bypassam RLS como dono) —
-- o grant de INSERT que 0057 deu a `authenticated` fica órfão sem policy
-- (mesmo problema já corrigido para `status_transitions` em 0017), corrigido
-- abaixo com um `revoke insert`.

-- =======================================================================
-- 1. get_public_project — leitura pública do projeto por slug.
-- =======================================================================

create or replace function public.get_public_project(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Sem STRICT: 0 linhas (slug inexistente, is_public=false ou
  -- is_deleted=true) deixa v_result NULL sem levantar exceção — mesma
  -- resposta pros 3 casos, de propósito (não vaza existência de projeto
  -- privado por enumeração de slug). `order by created_at asc limit 1`
  -- só existe para tornar a resposta determinística no caso raro (e fora do
  -- controle desta migration, ver comentário de topo) de slug colidir entre
  -- dois tenants diferentes -- `unique(tenant_id, slug)` de 0007 não
  -- garante unicidade global.
  select jsonb_build_object(
    'id', p.id,
    'code', p.code,
    'name', p.name,
    'address', p.address,
    'city', p.city,
    'state', p.state,
    'slug', p.slug,
    'total_units', p.total_units,
    'status', p.status,
    'description_public', p.description_public,
    'caracteristicas', p.caracteristicas,
    'implantacao_svg_url', p.implantacao_svg_url,
    'mcmv_faixa', p.mcmv_faixa,
    'entrada_min', p.entrada_min,
    'valor_min', p.valor_min,
    'valor_max', p.valor_max,
    'parcela_aprox', p.parcela_aprox,
    'subsidio_aprox', p.subsidio_aprox,
    'reserva_horas', p.reserva_horas,
    'whatsapp_principal', p.whatsapp_principal
  )
  into v_result
  from public.projects p
  where p.slug = p_slug
    and p.is_public = true
    and p.is_deleted = false
  order by p.created_at asc
  limit 1;

  return v_result;
end;
$$;

comment on function public.get_public_project(text) is
  'Leitura pública do espelho de vendas (/e/:slug) -- só campos public-safe '
  'de projects, nunca notes/total_construction_cost/total_indirect_costs/ '
  'tenant_id. SECURITY DEFINER (dono postgres bypassa RLS de projects sem '
  'nenhum grant de SELECT a anon na tabela). Devolve null para slug '
  'inexistente, projeto privado (is_public=false) ou deletado -- mesma '
  'resposta pros 3 casos, para não vazar existência de projeto privado.';

-- =======================================================================
-- 2. get_public_units — leitura pública das unidades de um projeto.
-- =======================================================================

create or replace function public.get_public_units(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Revalida is_public/is_deleted do projeto aqui também -- não confia que
  -- quem chamou já tenha passado um project_id de projeto público (ex:
  -- chamada direta ao RPC sem passar por get_public_project antes).
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.is_public = true
      and p.is_deleted = false
  ) then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'project_id', u.project_id,
        'sku', u.sku,
        'bloco', u.bloco,
        'tipologia', u.tipologia,
        'area_m2', u.area_m2,
        'area_lote_m2', u.area_lote_m2,
        'quartos', u.quartos,
        'vagas', u.vagas,
        'suites', u.suites,
        'pavimentos', u.pavimentos,
        'posicao_solar', u.posicao_solar,
        'list_price', u.list_price,
        'status', u.status,
        'observacoes_publica', u.observacoes_publica,
        'entrada_minima', u.entrada_minima,
        'subsidio_simulado', u.subsidio_simulado,
        'parcela_simulada', u.parcela_simulada
      )
      order by u.sku
    ),
    '[]'::jsonb
  )
  into v_result
  from public.units u
  where u.project_id = p_project_id
    and u.is_deleted = false;

  return v_result;
end;
$$;

comment on function public.get_public_units(uuid) is
  'Leitura pública das unidades de um projeto (/e/:slug) -- só campos '
  'public-safe de units, nunca notes/admin_status/tenant_id. Revalida '
  'is_public/is_deleted do projeto internamente, não confia em quem chamou. '
  'SECURITY DEFINER (dono postgres bypassa RLS de units sem nenhum grant de '
  'SELECT a anon na tabela). Devolve [] (nunca erro) se o projeto não for '
  'público/existir -- mesmo padrão de não distinguir motivo de '
  'get_public_project.';

-- =======================================================================
-- 3. create_public_lead — intents INTERESSE / LISTA_ESPERA.
-- =======================================================================

create or replace function public.create_public_lead(
  p_project_id uuid,
  p_intent public.public_lead_intent,
  p_nome text,
  p_telefone text,
  p_unit_id uuid default null,
  p_email text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_user_agent text default null,
  p_mensagem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_tenant_id uuid;
  v_lead_id uuid;
begin
  -- RESERVA passa por create_public_reservation (transação bem mais
  -- envolvida) -- esta function só cobre os 2 intents simples.
  if p_intent = 'reserva' then
    raise exception 'Use create_public_reservation para o intent reserva.';
  end if;

  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;

  if p_telefone is null or btrim(p_telefone) = '' then
    raise exception 'Telefone é obrigatório.';
  end if;

  if p_email is not null and btrim(p_email) <> ''
     and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail em formato inválido.';
  end if;

  -- Resolve e valida o projeto -- só público e não deletado recebe leads.
  -- Mesma mensagem para "não existe" e "não é público" (não vaza
  -- existência de projeto privado).
  select * into v_project
  from public.projects
  where id = p_project_id
    and is_public = true
    and is_deleted = false;

  if not found then
    raise exception 'Empreendimento não encontrado ou indisponível.';
  end if;

  v_tenant_id := v_project.tenant_id;

  -- unit_id, se informado, precisa pertencer a este projeto e não estar
  -- deletada.
  if p_unit_id is not null and not exists (
    select 1 from public.units
    where id = p_unit_id
      and project_id = p_project_id
      and is_deleted = false
  ) then
    raise exception 'Unidade não encontrada neste empreendimento.';
  end if;

  insert into public.public_leads (
    tenant_id, project_id, unit_id, nome, telefone, email,
    intent, status, origem, utm_source, utm_medium, utm_campaign,
    user_agent, mensagem
  ) values (
    v_tenant_id, p_project_id, p_unit_id, btrim(p_nome), btrim(p_telefone),
    nullif(btrim(p_email), ''), p_intent, 'novo', 'espelho_vendas',
    p_utm_source, p_utm_medium, p_utm_campaign, p_user_agent, p_mensagem
  )
  returning id into v_lead_id;

  return jsonb_build_object('id', v_lead_id, 'intent', p_intent, 'status', 'novo');
end;
$$;

comment on function public.create_public_lead(uuid, public.public_lead_intent, text, text, uuid, text, text, text, text, text, text) is
  'Cria um public_leads para os intents interesse/lista_espera (RESERVA usa '
  'create_public_reservation). tenant_id resolvido a partir de project_id '
  '(projects.tenant_id do projeto público/não-deletado), NUNCA aceito como '
  'parâmetro -- evita spoofing de tenant. SECURITY DEFINER (dono postgres '
  'insere sem nenhum grant de INSERT a anon em public_leads).';

-- =======================================================================
-- 4. create_public_reservation — intent RESERVA (peça crítica, atômica).
-- =======================================================================

create or replace function public.create_public_reservation(
  p_project_id uuid,
  p_unit_id uuid,
  p_nome text,
  p_telefone text,
  p_cpf text,
  p_email text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_unit public.units;
  v_tenant_id uuid;
  v_cpf_digits text;
  v_client_id uuid;
  v_reserva_horas integer;
  v_reserva_expira_em timestamptz;
  v_deal_id uuid;
  v_lead_id uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome é obrigatório.';
  end if;

  if p_telefone is null or btrim(p_telefone) = '' then
    raise exception 'Telefone é obrigatório.';
  end if;

  if p_cpf is null or btrim(p_cpf) = '' then
    raise exception 'CPF é obrigatório para reservas.';
  end if;

  -- Só formato básico (11 dígitos) -- dígito verificador fica só no
  -- frontend, conforme decisão já tomada.
  v_cpf_digits := regexp_replace(p_cpf, '\D', '', 'g');
  if length(v_cpf_digits) <> 11 then
    raise exception 'CPF em formato inválido.';
  end if;

  if p_email is not null and btrim(p_email) <> ''
     and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail em formato inválido.';
  end if;

  -- 1. Projeto: só público e não deletado. Mesma mensagem para "não
  --    existe" e "não é público" -- não vaza existência de projeto privado.
  select * into v_project
  from public.projects
  where id = p_project_id
    and is_public = true
    and is_deleted = false;

  if not found then
    raise exception 'Empreendimento não encontrado ou indisponível.';
  end if;

  v_tenant_id := v_project.tenant_id;

  -- 2. TRAVA a linha da unidade (select ... for update) -- ponto central
  --    da atomicidade: uma segunda chamada concorrente para a MESMA
  --    unidade bloqueia aqui até esta transação terminar (commit/rollback),
  --    depois relê o status já atualizado e cai no `raise exception`
  --    abaixo -- nunca as duas reservam a mesma unidade. Revalida que a
  --    unidade pertence a este project_id (não confia em payload) e não
  --    está deletada.
  select * into v_unit
  from public.units
  where id = p_unit_id
    and project_id = p_project_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'Unidade não encontrada neste empreendimento.';
  end if;

  if v_unit.status <> 'disponivel' then
    raise exception 'Esta unidade acabou de ser reservada por outro interessado. Por favor, escolha outra unidade.';
  end if;

  -- 3. Busca client por (tenant_id, cpf) -- índice único parcial de
  --    0011_clients.sql. Cria se não existir; captura unique_violation
  --    (corrida rara: outra requisição concorrente com o MESMO cpf, em
  --    outra unidade, criou o client entre nosso SELECT e este INSERT) e
  --    reaproveita em vez de derrubar a reserva inteira.
  select id into v_client_id
  from public.clients
  where tenant_id = v_tenant_id
    and cpf = v_cpf_digits;

  if not found then
    begin
      insert into public.clients (tenant_id, name, cpf, phone, email)
      values (
        v_tenant_id, btrim(p_nome), v_cpf_digits, btrim(p_telefone),
        nullif(btrim(p_email), '')
      )
      returning id into v_client_id;
    exception when unique_violation then
      select id into v_client_id
      from public.clients
      where tenant_id = v_tenant_id and cpf = v_cpf_digits;
    end;
  end if;

  -- 4. Expiração da reserva.
  v_reserva_horas := coalesce(v_project.reserva_horas, 24);
  v_reserva_expira_em := now() + make_interval(hours => v_reserva_horas);

  -- 5. Cria o deal. broker_id sempre NULL: projects.broker_responsavel_id
  --    não existe neste schema (0007_projects.sql documenta a exclusão --
  --    achado de auditoria registrado no comentário de topo desta
  --    migration). sales_stage='reservado' confirmado no enum
  --    deal_sales_stage (0014).
  insert into public.deals (
    tenant_id, project_id, unit_id, client_id, broker_id,
    sales_stage, expected_sale_value, reserved_until, is_active
  ) values (
    v_tenant_id, p_project_id, p_unit_id, v_client_id, null,
    'reservado', v_unit.list_price, v_reserva_expira_em, true
  )
  returning id into v_deal_id;

  -- 6. Reflexo em units.
  update public.units
  set status = 'reservada', active_deal_id = v_deal_id
  where id = p_unit_id;

  -- 7. Log de transição.
  insert into public.status_transitions (
    tenant_id, unit_id, deal_id, from_status, to_status, transition_type, note
  ) values (
    v_tenant_id, p_unit_id, v_deal_id, 'disponivel', 'reservada', 'comercial',
    'Reserva via espelho de vendas público'
  );

  -- 8. public_leads convertido.
  insert into public.public_leads (
    tenant_id, project_id, unit_id, nome, telefone, email, cpf,
    intent, status, origem, reserva_expira_em, converted_to_deal_id,
    converted_to_client_id, utm_source, utm_medium, utm_campaign, user_agent
  ) values (
    v_tenant_id, p_project_id, p_unit_id, btrim(p_nome), btrim(p_telefone),
    nullif(btrim(p_email), ''), v_cpf_digits, 'reserva', 'convertido',
    'espelho_vendas', v_reserva_expira_em, v_deal_id, v_client_id,
    p_utm_source, p_utm_medium, p_utm_campaign, p_user_agent
  )
  returning id into v_lead_id;

  -- Retorno mínimo para a UI confirmar -- sem dado sensível de outros
  -- clientes.
  return jsonb_build_object(
    'deal_id', v_deal_id,
    'client_id', v_client_id,
    'unit_id', p_unit_id,
    'lead_id', v_lead_id,
    'reserva_expira_em', v_reserva_expira_em,
    'reserva_horas', v_reserva_horas
  );
end;
$$;

comment on function public.create_public_reservation(uuid, uuid, text, text, text, text, text, text, text, text) is
  'Reserva pública atômica (LeadForm.jsx handleReserva): trava units com '
  'select...for update, valida disponibilidade, busca/cria clients por '
  '(tenant_id, cpf), cria deals (sales_stage=reservado), atualiza units '
  '(status=reservada, active_deal_id), loga status_transitions e converte '
  'public_leads -- tudo em uma única function plpgsql atômica. broker_id '
  'sempre null: projects.broker_responsavel_id não existe neste schema '
  '(0007_projects.sql). tenant_id resolvido de projects.tenant_id, nunca '
  'aceito como parâmetro. SECURITY DEFINER (dono postgres escreve nas 4 '
  'tabelas sem nenhum grant a anon nelas).';

-- =======================================================================
-- 5. RLS de public_leads -- ficou pendente desde 0057_public_leads.sql.
-- =======================================================================

alter table public.public_leads enable row level security;

create policy "public_leads_select_tenant_team"
  on public.public_leads
  for select
  to authenticated
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    and (auth.jwt() ->> 'tenant_role') in ('admin', 'comercial', 'administrativo')
  );

create policy "public_leads_update_tenant_team"
  on public.public_leads
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

comment on policy "public_leads_select_tenant_team" on public.public_leads is
  'Isolamento por tenant via claim tenant_id do JWT, restrito a papeis '
  'internos (admin/comercial/administrativo) -- mesmo padrao de 0010/0017. '
  'Nenhuma tela usa isso ainda (debito tecnico ja documentado em '
  '0057_public_leads.sql), mas a RLS fica pronta antes da UI existir, '
  'padrao do projeto. anon NUNCA tem policy aqui -- a unica escrita publica '
  'e via create_public_lead/create_public_reservation (security definer, '
  'bypassam RLS como dono).';

-- SEM policy de INSERT para authenticated: a unica via de escrita e pelas
-- 2 functions security definer acima. O grant de INSERT que 0057 deu a
-- `authenticated` fica orfao sem policy -- mesmo problema ja corrigido para
-- status_transitions em 0017_rls_crm.sql -- revogado explicitamente abaixo.
revoke insert on public.public_leads from authenticated;

-- =======================================================================
-- 6. Grants de EXECUTE nas 4 functions -- anon E authenticated (mesmo
--    padrao para as 4: leitura publica e submissao publica podem ser
--    chamadas tanto por um visitante anonimo quanto por um usuario
--    logado navegando o espelho de vendas). Revogado de PUBLIC antes, para
--    nao depender do grant implicito que toda function nova recebe.
-- =======================================================================

revoke all on function public.get_public_project(text) from public;
grant execute on function public.get_public_project(text) to anon, authenticated;

revoke all on function public.get_public_units(uuid) from public;
grant execute on function public.get_public_units(uuid) to anon, authenticated;

revoke all on function public.create_public_lead(uuid, public.public_lead_intent, text, text, uuid, text, text, text, text, text, text) from public;
grant execute on function public.create_public_lead(uuid, public.public_lead_intent, text, text, uuid, text, text, text, text, text, text) to anon, authenticated;

revoke all on function public.create_public_reservation(uuid, uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_public_reservation(uuid, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Auditoria de grants de tabela (confirmar após push, mesmo criterio de
-- 0010/0017): anon deve continuar com ZERO privilegios diretos em
-- projects/units/clients/deals/status_transitions/brokers/public_leads --
-- toda leitura/escrita publica passa pelas 4 functions acima. Teste de
-- isolamento correspondente: supabase/tests/0059_espelho_vendas_isolation.sql
-- (mais o teste de concorrencia real em
-- supabase/tests/0059_reserva_concurrency_*.sql, rodado manualmente com 2
-- sessoes paralelas -- ver instrucoes no cabecalho de cada arquivo).
-- ---------------------------------------------------------------------
