-- 0047_restrict_project_cost_fields_to_admin.sql
-- Achado ALTO da auditoria de seguranca do Modulo 10 (Investidores,
-- 2026-07-23): `total_construction_cost`/`total_indirect_costs` (colunas
-- adicionadas em 0046_project_operational_result_costs.sql) herdam a
-- policy de UPDATE de `projects` (`projects_update_tenant_team`, 0010,
-- linhas 102-113), que libera admin/comercial/administrativo para
-- QUALQUER coluna -- inclusive essas duas, que alimentam diretamente o
-- calculo de "Resultado Operacional" do Dashboard de Investidores
-- (`src/features/investors/resultHelpers.ts`), usado para calcular quanto
-- cada investidor tem a receber. A regra de negocio explicita do usuario
-- pra todo o modulo de Investidores e "so admin mexe em dinheiro de
-- terceiros" (ja vale para investors/project_investors/
-- investment_contributions/investment_returns, RLS em
-- 0045_rls_investors.sql) -- essas duas colunas de `projects` deveriam
-- seguir a mesma regra, mas ficaram de fora porque `projects_update_
-- tenant_team` foi pensada pra edicao operacional normal do projeto
-- (nome, status, unidades, campos de marketing publico), nao pra dado
-- financeiro sensivel.
--
-- O frontend ja assume essa restricao (ProjectForm.tsx, comentario nas
-- linhas 92-97: "o banco ja rejeita a escrita de quem nao e admin") --
-- mas o banco nunca tinha implementado isso de fato. Esta migration fecha
-- a lacuna entre a intencao ja documentada no client e o que o banco
-- realmente impunha.
--
-- POR QUE TRIGGER, NAO SO WITH CHECK DECLARATIVO
-- --------------------------------------------------------------------
-- 0040_restrict_maintenance_soft_delete_to_admin.sql resolveu um problema
-- parecido (restringir uma sub-acao de UPDATE a admin) so com WITH CHECK,
-- porque bastava travar o valor NOVO de uma coluna booleana
-- (is_deleted = true), sem precisar do valor ANTIGO pra decidir.
--
-- Aqui a regra e diferente: nao e "bloquear um valor especifico gravado",
-- e "bloquear qualquer MUDANCA de valor" -- precisa comparar NEW contra
-- OLD (`NEW.total_construction_cost IS DISTINCT FROM OLD.total_
-- construction_cost`). RLS declarativa no Postgres nao expoe OLD e NEW
-- simultaneamente em nenhuma clausula de uma mesma policy de UPDATE:
-- USING e avaliada contra a linha ANTIGA (decide se a linha e alvo do
-- UPDATE) e WITH CHECK e avaliada contra a linha NOVA (decide se o
-- resultado e aceitavel) -- mas nenhuma expressao dentro de uma policy
-- consegue referenciar as duas versoes ao mesmo tempo pra fazer um diff.
-- Essa e uma limitacao conhecida do RLS do Postgres, nao uma escolha de
-- design deste projeto.
--
-- Um trigger BEFORE INSERT OR UPDATE, por outro lado, tem NEW e OLD (este
-- ultimo so em UPDATE) disponiveis na mesma execucao -- exatamente o que
-- a regra "bloquear mudanca de valor" precisa. Por isso a escolha aqui e
-- diferente da 0040: la, WITH CHECK sozinho ja expressava a regra
-- completa; aqui nao -- entao o trigger e a ferramenta certa pro
-- problema, nao um substituto por conveniencia.
--
-- ESCOPO: INSERT E UPDATE, NAO SO UPDATE
-- --------------------------------------------------------------------
-- O pedido original falava em "editar" (UPDATE), mas o mesmo buraco existe
-- em INSERT: `projects_insert_tenant_team` (0010) libera os 3 papeis
-- internos pra inserir qualquer coluna, entao um `comercial` chamando a
-- API diretamente (nao pela UI, que so envia '0' default no form de
-- criacao -- ProjectForm.tsx) poderia criar um projeto ja com custos
-- diferentes de zero. Mesma regra de negocio, mesma tabela, mesmo dado
-- sensivel -- por isso o trigger cobre os dois eventos: em INSERT,
-- bloqueia quem nao e admin de gravar um valor != 0 nessas colunas; em
-- UPDATE, bloqueia quem nao e admin de MUDAR o valor (pro que for,
-- inclusive de volta a 0).
--
-- SERVICE_ROLE: EXPLICITAMENTE ISENTO DO TRIGGER
-- --------------------------------------------------------------------
-- Triggers rodam pra QUALQUER role, inclusive `service_role` -- ao
-- contrario de RLS (USING/WITH CHECK), que `service_role` ignora
-- inteiramente por ter o atributo BYPASSRLS no Postgres. Sem uma isencao
-- explicita aqui, o trigger criaria uma inconsistencia: `service_role`
-- bypassa toda RLS de `projects` (insere/atualiza qualquer coluna, de
-- qualquer tenant) mas seria barrado por ESTE trigger especifico, porque
-- o claim `tenant_role` normalmente nao existe no JWT de service_role.
-- Isso quebraria silenciosamente qualquer Edge Function futura que
-- precise ajustar custos em nome do sistema (ex: importacao em lote), sem
-- que isso fosse a intencao pedida ("so admin mexe" e regra pra usuario
-- final, nao pro backend server-side de confianca). `auth.role() =
-- 'service_role'` (funcao padrao do Supabase, le o claim `role` do JWT) e
-- a saida -- mesmo padrao de confianca ja documentado em 0002/0045
-- ("bypass de service_role so e usado server-side, nunca exposto ao
-- client"). Nenhuma Edge Function usa isso hoje (nenhuma existe pra este
-- modulo) -- documentado aqui pra quando uma for criada.
--
-- SEM MUDANCA NA POLICY/GRANT EXISTENTES
-- --------------------------------------------------------------------
-- `projects_update_tenant_team`/`projects_insert_tenant_team` (0010) e o
-- grant de 0007_projects.sql continuam exatamente como estao --
-- comercial/administrativo continuam liberados por RLS pra INSERT/UPDATE
-- em `projects` como um todo (nome, status, unidades, campos de
-- marketing publico etc.). O trigger e uma camada ADICIONAL, especifica
-- dessas duas colunas, que roda depois que a RLS ja aprovou a linha --
-- nao substitui nem afrouxa a policy existente.

create or replace function public.enforce_project_cost_fields_admin_only()
returns trigger
language plpgsql
as $$
begin
  -- service_role (uso server-side, Edge Functions de confianca) nunca e
  -- barrado por este trigger -- ver nota da migration acima. O client
  -- nunca deve ter essa chave (isso e garantido fora deste trigger, pela
  -- convencao geral do projeto de nunca expor service_role ao frontend).
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if (new.total_construction_cost <> 0 or new.total_indirect_costs <> 0)
      and coalesce(auth.jwt() ->> 'tenant_role', '') <> 'admin'
    then
      raise exception
        'Somente admin pode definir total_construction_cost/total_indirect_costs ao criar um projeto.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE': bloqueia qualquer MUDANCA de valor (NEW <> OLD),
  -- nao um valor especifico -- por isso precisa do trigger (OLD nao esta
  -- disponivel em RLS declarativa, ver nota da migration acima).
  if (
    new.total_construction_cost is distinct from old.total_construction_cost
    or new.total_indirect_costs is distinct from old.total_indirect_costs
  )
  and coalesce(auth.jwt() ->> 'tenant_role', '') <> 'admin'
  then
    raise exception
      'Somente admin pode alterar total_construction_cost/total_indirect_costs de projects.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_project_cost_fields_admin_only() is
  'Trigger BEFORE INSERT OR UPDATE em projects: so admin (tenant_role no '
  'JWT) pode gravar valor != 0 em total_construction_cost/total_indirect_'
  'costs (INSERT) ou mudar o valor dessas colunas (UPDATE). Existe como '
  'trigger, nao como WITH CHECK de RLS, porque a regra precisa comparar '
  'NEW contra OLD -- RLS declarativo nao expoe as duas versoes da linha '
  'na mesma expressao. service_role e isento -- ver '
  '0047_restrict_project_cost_fields_to_admin.sql.';

create trigger projects_enforce_cost_fields_admin_only
  before insert or update on public.projects
  for each row
  execute function public.enforce_project_cost_fields_admin_only();

comment on trigger projects_enforce_cost_fields_admin_only on public.projects is
  'So admin grava/altera total_construction_cost/total_indirect_costs -- '
  'ver 0047_restrict_project_cost_fields_to_admin.sql pra justificativa '
  'completa (por que trigger, nao RLS declarativa, e por que INSERT '
  'tambem, nao so UPDATE).';
