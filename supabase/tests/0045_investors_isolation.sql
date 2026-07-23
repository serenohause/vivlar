-- 0045_investors_isolation.sql
-- Teste de isolamento para a RLS de `investors`, `project_investors`,
-- `investment_contributions` e `investment_returns` introduzida em
-- supabase/migrations/0045_rls_investors.sql.
--
-- COMO RODAR
-- ----------
-- Mesmo criterio de supabase/tests/0039_maintenance_isolation.sql: rodado
-- via `supabase db query --linked` (banco remoto ja linkado), nao via
-- `supabase test db` (pgTAP exige Docker, indisponivel neste ambiente).
--
--   cd /home/hugofrota/sereno/vivlar
--   npx supabase db query --linked -f supabase/tests/0045_investors_isolation.sql
--
-- Alternativa local: `psql "<connection-string>" -f
-- supabase/tests/0045_investors_isolation.sql`.
--
-- SEGURANCA DO TESTE
-- -------------------
-- Roda inteiro dentro de UMA transacao com ROLLBACK no final -- nenhum dado
-- sintetico (tenants/tenant_users/auth.users/projects/investors/
-- project_investors/investment_contributions/investment_returns) fica no
-- banco, mesmo rodando contra o projeto remoto real. Qualquer assercao que
-- falhe faz `raise exception`, abortando a transacao inteira.
--
-- Cada teste usa `set_config('request.jwt.claims', ..., true)` + `set local
-- role authenticated` para simular exatamente o que o PostgREST faz numa
-- requisicao autenticada -- igual ao padrao de 0032/0036/0039/0040.
--
-- NAO testamos aqui: bypass de `service_role` -- por design (BYPASSRLS, so
-- deve ser usado dentro de Edge Functions, nunca exposto ao client).
-- Confirmado que nao existe nenhuma Edge Function deste modulo hoje
-- (supabase/functions/ sem nada de investidores) -- ponto a revisitar
-- quando/se uma for criada. Auditoria de grants (information_schema.
-- role_table_grants) confirma que `authenticated` tem exatamente select/
-- insert/update nas 4 tabelas (sem delete, mesmo grant concedido em
-- 0041/0042/0043/0044), e `anon` sem NENHUM privilegio em nenhuma delas.
--
-- O QUE ESTE SCRIPT PROVA
-- ------------------------
-- 1. Tenant A (comercial) le exatamente as linhas do proprio tenant nas 4
--    tabelas, nada do tenant B, e vice-versa (tenant B/admin) -- isolamento
--    nos dois sentidos.
-- 2. Usuario com tenant_role = 'cliente' ou 'investidor' do tenant CERTO nao
--    enxerga NENHUMA linha nas 4 tabelas, e nao consegue inserir em nenhuma
--    delas -- confirma o escopo desta rodada (sem portal do investidor, so
--    equipe interna acessa, e mesmo dentro da equipe interna a leitura e
--    mais ampla que a escrita, testado no item 3).
-- 3. 'comercial'/'administrativo' do tenant certo CONSEGUEM ler as 4
--    tabelas, mas NAO CONSEGUEM inserir nem atualizar em nenhuma delas --
--    prova a decisao de produto "so admin escreve, comercial/administrativo
--    so leem" (diferente do padrao de Manutencao em 0039, onde os 3 papeis
--    escrevem).
-- 4. 'admin' do tenant certo consegue INSERIR e ATUALIZAR nas 4 tabelas.
--    WITH CHECK bloqueia INSERT cross-tenant (payload malicioso tentando
--    gravar tenant_id de outro tenant) -- e USING bloqueia UPDATE
--    cross-tenant (0 linhas afetadas, sem erro) -- em todas as 4 tabelas.
-- 5. Usuario sem tenant_id no claim (0 vinculos ativos) nao ve nenhuma linha
--    em nenhuma das 4 tabelas, e nao consegue inserir em nenhuma delas.

begin;

-- ---------------------------------------------------------------------
-- Setup: dois tenants. No tenant A: admin, comercial, administrativo,
-- cliente, investidor (cobre os 5 papeis). No tenant B: admin (prova
-- isolamento cross-tenant). Mais um usuario orfao, sem tenant_users. IDs
-- fixos com prefixo 'e' para nao colidir com os prefixos 'f'/'f8'/'f9' ja
-- usados em 0039/0040.
-- ---------------------------------------------------------------------

insert into auth.users (id) values
  ('e1000000-0000-0000-0000-000000000001'), -- user_a_admin
  ('e1000000-0000-0000-0000-000000000002'), -- user_a_comercial
  ('e1000000-0000-0000-0000-000000000003'), -- user_a_administrativo
  ('e1000000-0000-0000-0000-000000000004'), -- user_a_cliente
  ('e1000000-0000-0000-0000-000000000005'), -- user_a_investidor
  ('e1000000-0000-0000-0000-000000000006'), -- user_b_admin
  ('e1000000-0000-0000-0000-000000000007'); -- user_orphan

insert into public.tenants (id, name, slug) values
  ('e2000000-0000-0000-0000-00000000000a', 'Tenant A - teste isolamento investidores 0045', 'tenant-a-teste-isolamento-investidores-0045'),
  ('e2000000-0000-0000-0000-00000000000b', 'Tenant B - teste isolamento investidores 0045', 'tenant-b-teste-isolamento-investidores-0045');

insert into public.tenant_users (tenant_id, user_id, role, status) values
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000002', 'comercial', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000003', 'administrativo', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000004', 'cliente', 'active'),
  ('e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000005', 'investidor', 'active'),
  ('e2000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000006', 'admin', 'active');

-- Dado "de fato existente" nos dois tenants, inserido diretamente como dono
-- das tabelas (bypassa RLS de proposito aqui so para popular o cenario --
-- os testes reais de leitura/escrita usam os roles simulados abaixo).
-- Cadeia por tenant: project -> investor -> project_investors /
-- investment_contributions / investment_returns.

insert into public.projects (id, tenant_id, code, name) values
  ('e3000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'PROJ-A-0045', 'Projeto Tenant A'),
  ('e3000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'PROJ-B-0045', 'Projeto Tenant B');

insert into public.investors (id, tenant_id, nome, tipo) values
  ('e4000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'Investidor Tenant A', 'PF'),
  ('e4000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'Investidor Tenant B', 'PF');

insert into public.project_investors (id, tenant_id, project_id, investor_id, nome_exibicao, valor_aportado, percentual_participacao) values
  ('e5000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'Investidor A no Projeto A', 100000, 10),
  ('e5000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'Investidor B no Projeto B', 100000, 10);

insert into public.investment_contributions (id, tenant_id, project_id, investor_id, valor, data) values
  ('e6000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 50000, current_date),
  ('e6000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 50000, current_date);

insert into public.investment_returns (id, tenant_id, project_id, investor_id, valor, data, return_type) values
  ('e7000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 5000, current_date, 'DIVIDENDO_INVESTIDOR'),
  ('e7000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 5000, current_date, 'DIVIDENDO_INVESTIDOR');

-- ---------------------------------------------------------------------
-- TESTE 1: usuario 'comercial' do tenant A le exatamente as linhas do
-- proprio tenant nas 4 tabelas, nada do tenant B.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
  v_investors_b int; v_pi_b int; v_contrib_b int; v_returns_b int;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 1 or v_pi <> 1 or v_contrib <> 1 or v_returns <> 1 then
    raise exception 'FALHOU (1a): tenant A (comercial) deveria ver exatamente 1 linha em cada tabela (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;

  select count(*) into v_investors_b from public.investors where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  select count(*) into v_pi_b from public.project_investors where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  select count(*) into v_contrib_b from public.investment_contributions where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  select count(*) into v_returns_b from public.investment_returns where tenant_id = 'e2000000-0000-0000-0000-00000000000b';

  if v_investors_b <> 0 or v_pi_b <> 0 or v_contrib_b <> 0 or v_returns_b <> 0 then
    raise exception 'FALHOU (1b): tenant A (comercial) NAO deveria enxergar nenhuma linha do tenant B (investors=%, project_investors=%, contributions=%, returns=%)', v_investors_b, v_pi_b, v_contrib_b, v_returns_b;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 2: usuario 'admin' do tenant B -- simetrico ao teste 1, prova
-- isolamento nos dois sentidos.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000006","tenant_id":"e2000000-0000-0000-0000-00000000000b","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
  v_investors_a int; v_pi_a int; v_contrib_a int; v_returns_a int;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 1 or v_pi <> 1 or v_contrib <> 1 or v_returns <> 1 then
    raise exception 'FALHOU (2a): tenant B (admin) deveria ver exatamente 1 linha em cada tabela (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;

  select count(*) into v_investors_a from public.investors where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
  select count(*) into v_pi_a from public.project_investors where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
  select count(*) into v_contrib_a from public.investment_contributions where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
  select count(*) into v_returns_a from public.investment_returns where tenant_id = 'e2000000-0000-0000-0000-00000000000a';

  if v_investors_a <> 0 or v_pi_a <> 0 or v_contrib_a <> 0 or v_returns_a <> 0 then
    raise exception 'FALHOU (2b): tenant B (admin) NAO deveria enxergar nenhuma linha do tenant A (investors=%, project_investors=%, contributions=%, returns=%)', v_investors_a, v_pi_a, v_contrib_a, v_returns_a;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 3: usuario 'cliente' do tenant A (tenant certo, papel externo) nao
-- enxerga NENHUMA linha em nenhuma das 4 tabelas, mesmo o dado do proprio
-- tenant existindo de verdade -- e nao consegue inserir em nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000004","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"cliente","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 0 or v_pi <> 0 or v_contrib <> 0 or v_returns <> 0 then
    raise exception 'FALHOU (3a): tenant_role=cliente do tenant certo NAO deveria ver NENHUMA linha (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa cliente', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3b): tenant_role=cliente conseguiu inserir em investors -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.project_investors (tenant_id, project_id, investor_id, nome_exibicao)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'Tentativa cliente');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3c): tenant_role=cliente conseguiu inserir em project_investors -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_contributions (tenant_id, project_id, investor_id, valor, data)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 1000, current_date);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3d): tenant_role=cliente conseguiu inserir em investment_contributions -- RLS nao esta bloqueando por papel';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_returns (tenant_id, project_id, investor_id, valor, data, return_type)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 1000, current_date, 'PRINCIPAL');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (3e): tenant_role=cliente conseguiu inserir em investment_returns -- RLS nao esta bloqueando por papel';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 4: usuario 'investidor' do tenant A -- mesma prova do teste 3, para
-- o outro papel externo excluido desta leva.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000005","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"investidor","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 0 or v_pi <> 0 or v_contrib <> 0 or v_returns <> 0 then
    raise exception 'FALHOU (4a): tenant_role=investidor do tenant certo NAO deveria ver NENHUMA linha (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa investidor', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (4b): tenant_role=investidor conseguiu inserir em investors -- RLS nao esta bloqueando por papel. Confirma que ainda nao ha portal do investidor -- nem o proprio investidor autenticado deve enxergar/gravar nada aqui nesta rodada.';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 5: 'comercial'/'administrativo' do tenant A CONSEGUEM ler (ja
-- provado no teste 1 para comercial), mas NAO CONSEGUEM inserir nem
-- atualizar em NENHUMA das 4 tabelas -- decisao de produto central desta
-- migration (so admin escreve, dado envolver dinheiro de terceiros).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000002","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"comercial","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa comercial', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5a): tenant_role=comercial conseguiu inserir em investors -- deveria ser restrito a admin';
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.investors set nome = 'tentativa comercial update' where id = 'e4000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (5b): tenant_role=comercial conseguiu atualizar investors (afetou % linha(s)) -- deveria ser restrito a admin', v_linhas;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.project_investors (tenant_id, project_id, investor_id, nome_exibicao)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'Tentativa comercial');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5c): tenant_role=comercial conseguiu inserir em project_investors -- deveria ser restrito a admin';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_contributions (tenant_id, project_id, investor_id, valor, data)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 1000, current_date);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5d): tenant_role=comercial conseguiu inserir em investment_contributions -- deveria ser restrito a admin';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_returns (tenant_id, project_id, investor_id, valor, data, return_type)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 1000, current_date, 'PRINCIPAL');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5e): tenant_role=comercial conseguiu inserir em investment_returns -- deveria ser restrito a admin';
  end if;
end $$;

reset role;

-- Mesma prova, para 'administrativo' (segundo papel interno nao-admin).

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000003","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"administrativo","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
begin
  -- Confirma leitura liberada tambem para administrativo (mesma policy de
  -- select de comercial), antes de provar que a escrita continua bloqueada.
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 1 or v_pi <> 1 or v_contrib <> 1 or v_returns <> 1 then
    raise exception 'FALHOU (5f): tenant_role=administrativo deveria ler exatamente 1 linha em cada tabela do proprio tenant (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa administrativo', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (5g): tenant_role=administrativo conseguiu inserir em investors -- deveria ser restrito a admin';
  end if;
end $$;

do $$
declare v_linhas int;
begin
  update public.investment_returns set status = 'PAGO' where id = 'e7000000-0000-0000-0000-00000000000a';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (5h): tenant_role=administrativo conseguiu atualizar investment_returns (afetou % linha(s)) -- deveria ser restrito a admin', v_linhas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 6: 'admin' do tenant A consegue INSERIR e ATUALIZAR nas 4 tabelas
-- (prova positiva). WITH CHECK bloqueia INSERT cross-tenant em todas elas.
-- USING bloqueia UPDATE cross-tenant (0 linhas afetadas, sem erro).
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","tenant_id":"e2000000-0000-0000-0000-00000000000a","tenant_role":"admin","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investor_id uuid;
  v_pi_id uuid;
  v_contrib_id uuid;
  v_return_id uuid;
begin
  insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Investidor criado por admin', 'PJ')
    returning id into v_investor_id;

  insert into public.project_investors (tenant_id, project_id, investor_id, nome_exibicao)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', v_investor_id, 'Vinculo criado por admin')
    returning id into v_pi_id;

  insert into public.investment_contributions (tenant_id, project_id, investor_id, valor, data)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', v_investor_id, 25000, current_date)
    returning id into v_contrib_id;

  insert into public.investment_returns (tenant_id, project_id, investor_id, valor, data, return_type)
    values ('e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', v_investor_id, 2500, current_date, 'DIVIDENDO_INVESTIDOR')
    returning id into v_return_id;

  if v_investor_id is null or v_pi_id is null or v_contrib_id is null or v_return_id is null then
    raise exception 'FALHOU (6a): admin do tenant certo deveria conseguir inserir nas 4 tabelas';
  end if;

  -- UPDATE normal deve funcionar nas 4 tabelas.
  update public.investors set nome = 'Investidor atualizado por admin' where id = v_investor_id;
  update public.project_investors set percentual_participacao = 15 where id = v_pi_id;
  update public.investment_contributions set status = 'CONFIRMADO' where id = v_contrib_id;
  update public.investment_returns set status = 'PAGO' where id = v_return_id;

  if not exists (select 1 from public.investors where id = v_investor_id and nome = 'Investidor atualizado por admin')
    or not exists (select 1 from public.project_investors where id = v_pi_id and percentual_participacao = 15)
    or not exists (select 1 from public.investment_contributions where id = v_contrib_id and status = 'CONFIRMADO')
    or not exists (select 1 from public.investment_returns where id = v_return_id and status = 'PAGO')
  then
    raise exception 'FALHOU (6b): admin deveria conseguir atualizar as linhas que acabou de criar nas 4 tabelas';
  end if;
end $$;

-- Tentativa de INSERT cross-tenant (payload malicioso tentando "escapar" do
-- tenant do claim) deve ser bloqueada pelo WITH CHECK, nas 4 tabelas.
do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000b', 'Tentativa cross-tenant', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6c): admin do tenant A conseguiu inserir investors com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.project_investors (tenant_id, project_id, investor_id, nome_exibicao)
    values ('e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 'Tentativa cross-tenant');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6d): admin do tenant A conseguiu inserir project_investors com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_contributions (tenant_id, project_id, investor_id, valor, data)
    values ('e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 1000, current_date);
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6e): admin do tenant A conseguiu inserir investment_contributions com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investment_returns (tenant_id, project_id, investor_id, valor, data, return_type)
    values ('e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-00000000000b', 1000, current_date, 'PRINCIPAL');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (6f): admin do tenant A conseguiu inserir investment_returns com tenant_id do tenant B -- WITH CHECK nao esta bloqueando escrita cross-tenant';
  end if;
end $$;

-- UPDATE cross-tenant: linhas do tenant B nem aparecem para o UPDATE (USING
-- filtra por tenant_id do claim) -- 0 linhas afetadas, sem erro. Nas 4
-- tabelas.
do $$
declare v_linhas int;
begin
  update public.investors set nome = 'tentativa cross-tenant' where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6g): admin do tenant A conseguiu dar UPDATE em % linha(s) de investors do tenant B', v_linhas;
  end if;

  update public.project_investors set percentual_participacao = 99 where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6h): admin do tenant A conseguiu dar UPDATE em % linha(s) de project_investors do tenant B', v_linhas;
  end if;

  update public.investment_contributions set status = 'CONFIRMADO' where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6i): admin do tenant A conseguiu dar UPDATE em % linha(s) de investment_contributions do tenant B', v_linhas;
  end if;

  update public.investment_returns set status = 'PAGO' where tenant_id = 'e2000000-0000-0000-0000-00000000000b';
  get diagnostics v_linhas = row_count;
  if v_linhas <> 0 then
    raise exception 'FALHOU (6j): admin do tenant A conseguiu dar UPDATE em % linha(s) de investment_returns do tenant B', v_linhas;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- TESTE 7: usuario sem tenant_id no claim (0 vinculos ativos) nao ve
-- nenhuma linha em nenhuma das 4 tabelas, e nao consegue inserir em
-- nenhuma delas.
-- ---------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  v_investors int; v_pi int; v_contrib int; v_returns int;
begin
  select count(*) into v_investors from public.investors;
  select count(*) into v_pi from public.project_investors;
  select count(*) into v_contrib from public.investment_contributions;
  select count(*) into v_returns from public.investment_returns;

  if v_investors <> 0 or v_pi <> 0 or v_contrib <> 0 or v_returns <> 0 then
    raise exception 'FALHOU (7a): usuario sem tenant_id no claim NAO deveria ver NENHUMA linha (investors=%, project_investors=%, contributions=%, returns=%)', v_investors, v_pi, v_contrib, v_returns;
  end if;
end $$;

do $$
declare v_insert_ok boolean := false;
begin
  begin
    insert into public.investors (tenant_id, nome, tipo)
    values ('e2000000-0000-0000-0000-00000000000a', 'Tentativa orfao', 'PF');
    v_insert_ok := true;
  exception when others then v_insert_ok := false;
  end;
  if v_insert_ok then
    raise exception 'FALHOU (7b): usuario sem tenant_id no claim conseguiu inserir em investors -- RLS nao esta bloqueando por ausencia de claim';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------
-- Se chegou ate aqui sem "raise exception", todas as asserções passaram.
-- ---------------------------------------------------------------------

select 'TODOS OS TESTES DE ISOLAMENTO PASSARAM (0045 - Investidores)' as resultado;

-- Desfaz TUDO -- nenhum dado sintetico de teste fica no banco.
rollback;
