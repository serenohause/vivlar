-- 0066_espelho_vendas_lead_notifications.sql
-- Achado de auditoria registrado no topo de 0064_notifications.sql e no
-- comentário de 0059_rls_espelho_vendas.sql: `LeadForm.jsx` (espelho de
-- vendas público) chama `Notification.create()` em 3 pontos (interesse,
-- reserva, lista de espera -- confirmado por leitura direta do arquivo,
-- linhas 110/199/228), mas `create_public_lead`/`create_public_reservation`
-- (0059) nunca inseriram em `notifications` -- fluxo não portado até hoje.
--
-- Fechado aqui com `create or replace function`, MESMA assinatura das duas
-- funções (nomes/tipos/ordem/default de parâmetro idênticos a 0059 -- não é
-- uma função nova, é a mesma alterada). Não precisa de grant novo a `anon`:
-- as duas já são `security definer`, dono `postgres` já é dono de
-- `notifications` e a tabela não tem `FORCE ROW LEVEL SECURITY` -- o dono
-- contorna a RLS de 0065 nativamente, mesmo raciocínio já documentado no
-- comentário de topo de 0059 para projects/units/clients/deals/
-- status_transitions/public_leads.
--
-- TEXTO DAS NOTIFICAÇÕES: copiado o mais fiel possível de LeadForm.jsx
-- (título/mensagem/severity/audience/type/event_key), com 2 adaptações
-- inevitáveis porque a lógica agora roda no Postgres, não no browser:
--   - Formatação de moeda: `toLocaleString("pt-BR", {style:"currency",...})`
--     não existe em SQL -- aproximado com `to_char(..., 'FM999G999G990')`
--     prefixado de "R$ ". Mesma informação, formatação não é byte-a-byte
--     idêntica ao Intl do JS (ex: separador de milhar pode variar em casos
--     extremos) -- aceitável, é só o corpo da notificação interna, não um
--     valor contratual/financeiro exibido ao lead.
--   - Data de expiração da reserva: `toLocaleString("pt-BR")` do JS vira
--     `to_char(v_reserva_expira_em, 'DD/MM/YYYY HH24:MI')` -- mesma
--     informação (data e hora em horário local do servidor, que já é como
--     o resto do projeto grava timestamptz).
--
-- UNIT OPCIONAL em create_public_lead (p_unit_id default null): no
-- original, `LeadForm.jsx` SEMPRE é aberto a partir de uma unidade
-- específica (UnitModal), então `unit` nunca é null nos 3 pontos de
-- `Notification.create()`. Mas a function aqui aceita p_unit_id null (não
-- reescrevo essa validação, fora de escopo de RLS) -- por robustez, a
-- mensagem cai num fallback genérico (sem sku/tipologia/preço) se
-- `p_unit_id` não vier, em vez de gerar uma mensagem com "null" dentro.

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
  v_unit public.units;
  v_tenant_id uuid;
  v_lead_id uuid;
  v_notification_title text;
  v_notification_message text;
  v_notification_severity public.notification_severity;
  v_notification_event_key text;
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

  if p_unit_id is not null then
    select * into v_unit from public.units where id = p_unit_id;
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

  -- Notificação pra equipe interna (audience=ADMIN_ONLY) -- achado de
  -- auditoria de 0064, portado aqui. Texto fiel a LeadForm.jsx (linhas
  -- 110-120 para interesse, 228-238 para lista_espera), ver comentário de
  -- topo desta migration para as 2 adaptações de formatação.
  if p_intent = 'interesse' then
    v_notification_title := 'Novo interesse: ' || btrim(p_nome);
    v_notification_message := case
      when v_unit.id is not null then
        'Interesse na unidade ' || v_unit.sku
        || ' (' || coalesce(v_unit.tipologia, '')
        || case
             when v_unit.list_price is not null
               then ', R$ ' || to_char(v_unit.list_price, 'FM999G999G990')
             else ''
           end
        || ') — ' || p_telefone
      else
        'Interesse no empreendimento ' || v_project.name || ' — ' || p_telefone
    end;
    v_notification_severity := 'INFO';
    v_notification_event_key := 'public_lead_interest_' || v_lead_id;
  elsif p_intent = 'lista_espera' then
    v_notification_title := 'Lista de espera: '
      || coalesce(v_unit.sku, v_project.name) || ' — ' || btrim(p_nome);
    v_notification_message := btrim(p_nome)
      || ' quer ser avisado quando ' || coalesce(v_unit.sku, 'a unidade')
      || ' ficar disponível — ' || p_telefone;
    v_notification_severity := 'INFO';
    v_notification_event_key := 'public_lead_espera_' || v_lead_id;
  end if;

  insert into public.notifications (
    tenant_id, title, message, type, severity, audience, event_key,
    entity_type, entity_id
  ) values (
    v_tenant_id, v_notification_title, v_notification_message, 'CRM',
    v_notification_severity, 'ADMIN_ONLY', v_notification_event_key,
    'PublicLead', v_lead_id
  );

  return jsonb_build_object('id', v_lead_id, 'intent', p_intent, 'status', 'novo');
end;
$$;

comment on function public.create_public_lead(uuid, public.public_lead_intent, text, text, uuid, text, text, text, text, text, text) is
  'Cria um public_leads para os intents interesse/lista_espera (RESERVA usa '
  'create_public_reservation). tenant_id resolvido a partir de project_id '
  '(projects.tenant_id do projeto público/não-deletado), NUNCA aceito como '
  'parâmetro -- evita spoofing de tenant. Também insere em notifications '
  '(audience=ADMIN_ONLY, type=CRM) pra equipe interna ver o lead no mural -- '
  'achado de auditoria de 0064, portado em 0066. SECURITY DEFINER (dono '
  'postgres insere sem nenhum grant de INSERT a anon em public_leads/'
  'notifications).';

-- =======================================================================
-- create_public_reservation -- mesma alteração: insere notificação
-- ADMIN_ONLY ao final, texto fiel a LeadForm.jsx linhas 199-209
-- (handleReserva). Corpo idêntico ao de 0059, só com o bloco de
-- notificação adicionado antes do `return`.
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
  --    achado de auditoria registrado no comentário de topo de 0059).
  --    sales_stage='reservado' confirmado no enum deal_sales_stage (0014).
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

  -- 9. Notificação pra equipe interna (audience=ADMIN_ONLY) -- achado de
  --    auditoria de 0064, portado aqui. Texto fiel a LeadForm.jsx
  --    (handleReserva, linhas 199-209).
  insert into public.notifications (
    tenant_id, title, message, type, severity, audience, event_key,
    entity_type, entity_id
  ) values (
    v_tenant_id,
    'Nova reserva: ' || btrim(p_nome),
    'Reserva da unidade ' || v_unit.sku || ' por ' || btrim(p_nome)
      || ' — ' || p_telefone || '. Expira em '
      || to_char(v_reserva_expira_em, 'DD/MM/YYYY HH24:MI'),
    'CRM', 'ALERTA', 'ADMIN_ONLY', 'public_lead_reserva_' || v_lead_id,
    'PublicLead', v_lead_id
  );

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
  '(status=reservada, active_deal_id), loga status_transitions, converte '
  'public_leads e insere notifications (audience=ADMIN_ONLY, type=CRM, '
  'severity=ALERTA) -- achado de auditoria de 0064, portado em 0066. '
  'broker_id sempre null: projects.broker_responsavel_id não existe neste '
  'schema (0007_projects.sql). tenant_id resolvido de projects.tenant_id, '
  'nunca aceito como parâmetro. SECURITY DEFINER (dono postgres escreve nas '
  '5 tabelas sem nenhum grant a anon nelas).';

-- ---------------------------------------------------------------------
-- Grants de EXECUTE: já concedidos a anon/authenticated em 0059, e
-- `create or replace function` preserva grants existentes (não precisa
-- reconceder). Confirmado: nenhuma mudança de assinatura, só corpo.
--
-- Ver supabase/tests/0065_notifications_isolation.sql, seção final, para a
-- regressão de create_public_lead/create_public_reservation (0059) + prova
-- de que a notificação nova é inserida e visível pra equipe do tenant
-- certo.
-- ---------------------------------------------------------------------
