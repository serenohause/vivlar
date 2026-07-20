# Plano de Schema — aprovado

> Produzido pelo subagente `schema-architect` na etapa 3 do `/start-project`,
> a partir de `docs/DOMAIN_MAP.md`. Aprovado pelo usuário em 2026-07-20.
> As migrations SQL (`supabase/migrations/`) implementam este plano.

## 1. Modelo multitenant

- **`tenants`** — raiz do sistema (uma incorporadora/construtora cliente da
  plataforma). Não tem `tenant_id` — é a própria raiz.
- **`tenant_users`** — vínculo humano↔tenant, usado para **todo** tipo de
  pessoa associada a um tenant (equipe interna, cliente comprador,
  investidor), não só a equipe interna. É essa tabela que alimenta o
  custom claim `tenant_id` no JWT (hook de access token do Supabase) —
  sem uma linha aqui, ninguém carrega `tenant_id` no token, e toda a RLS
  do `CLAUDE.md` depende desse claim.
  - `tenant_id`, `user_id` (FK `auth.users`), `role`, `status`
    (`invited`/`active`/`suspended`), `invited_by_user_id`, `invited_at`,
    `joined_at`. `unique(tenant_id, user_id)`.
  - `role` (enum `tenant_role`): `admin`, `comercial`, `administrativo`,
    `cliente`, `investidor`.
- O que diferencia cliente/investidor de fato não é a tabela de vínculo, é
  a **RLS**: além de `tenant_id = claim`, a policy também exige
  `clients.user_id = auth.uid()` (ou `investors.user_id = auth.uid()`)
  nas tabelas de negócio. A fonte da verdade do vínculo é
  `clients.user_id`/`investors.user_id`; `tenant_users.role` só serve
  para bootstrap do claim e telas administrativas de "quem tem acesso".
- **Brokers não entram em `tenant_users`** — no original não têm
  login/portal. Se isso mudar, entra via `/new-feature`.
- **Acesso público sem JWT** (site "espelho de vendas" + `public_leads`):
  RLS permite `select` anônimo em `projects`/`units` restrito a
  `is_public = true`, e `insert` anônimo em `public_leads` validando por
  `WITH CHECK` que o `tenant_id` enviado bate com o `tenant_id` do
  `project`/`unit` referenciado — nunca confiar no `tenant_id` mandado
  pelo cliente anônimo.

## 2. Decisões confirmadas com o usuário

- **`deals`**: unifica `sales_stage` + `opportunity_status` (redundantes
  no original) em um único enum `deal_sales_stage`, absorvendo `perdido`.
  Pequeno desvio da fidelidade 1:1 — decisão consciente para eliminar uma
  inconsistência real do app original.
- **Delete de tenant**: `RESTRICT`, não `CASCADE`. Não é possível apagar
  um tenant que ainda tem dados; offboarding é um processo manual, não uma
  operação de um clique.
- **`support_tickets`**: fila da própria plataforma (SaaS), **sem**
  `tenant_id` — pedido de exclusão de conta é sobre a relação
  usuário↔plataforma, não sobre o negócio de uma incorporadora específica.
- Demais pontos técnicos seguidos pela recomendação do `schema-architect`
  sem necessidade de decisão explícita: `UnitStatus` não vira tabela (é
  enum/constante), nomes normalizados para snake_case ASCII sem acento,
  `units.active_deal_id` mantido como coluna (com dependência circular
  resolvida via `ALTER TABLE` em migration separada), `financing_processes`
  e `construction_photos` adiados para quando a tela real for construída
  via `/new-feature` (schema incerto no original), `teams_channel_configs`
  e `whatsapp_sessions` adiados para quando a integração for implementada,
  colunas de auditoria (`created_by_user_id` etc.) apontam direto para
  `auth.users(id)`.

## 3. Tabelas por módulo (leva fundacional)

- **Catálogo**: `terrains`, `projects`, `units`
- **CRM/Vendas**: `clients`, `real_estate_agencies`, `brokers`, `deals`,
  `deal_brokers`, `activities`, `status_transitions`, `unit_checks`
- **Documentos**: `contracts`, `documents`, `doc_requirements`
- **Financeiro**: `finance_accounts`, `payment_installments`,
  `finance_events`, `cobranca_historico`
- **Comissões**: `commissions`, `commission_adjustments`,
  `commission_payments`
- **Investidores**: `investors`, `project_investors`,
  `investment_contributions`, `investment_returns`
- **Vistoria/Manutenção**: `inspection_templates`,
  `inspection_template_items`, `inspections`, `inspection_item_results`,
  `inspection_media`, `inspection_signatures`, `maintenance_requests`
- **Notificações**: `notifications`
- **Público**: `public_leads`
- **Plataforma (sem tenant_id)**: `tenants`, `support_tickets`

Detalhamento de colunas, enums e FKs de cada tabela: ver o relatório
completo do `schema-architect` referenciado a partir deste plano — campos
replicados em `docs/DOMAIN_MAP.md` (entidade por entidade) com os nomes já
normalizados aplicados nas migrations.

## 4. Índices compostos além do padrão `(tenant_id, created_at)`

- `units`: `(tenant_id, project_id)`, `(tenant_id, status)`, `(tenant_id, admin_status)`
- `deals`: `(tenant_id, unit_id)`, `(tenant_id, client_id)`, `(tenant_id, sales_stage)`, `(tenant_id, broker_id)`; índice único parcial `(unit_id) WHERE is_active` (reforça em nível de banco a regra "uma unidade só pode ter 1 negócio ativo por vez")
- `clients`: `(tenant_id, cpf)` único parcial, `(tenant_id, user_id)`
- `documents`: `(tenant_id, unit_id)`, `(tenant_id, deal_id)`, `(tenant_id, doc_type)`
- `payment_installments`: `(tenant_id, vencimento)`, `(tenant_id, status)`, `(tenant_id, finance_account_id)`
- `commissions`: `(tenant_id, broker_id)`, `(tenant_id, status)`
- `notifications`: `(tenant_id, user_id, status)`, `(tenant_id, event_key)` único parcial onde `event_key is not null`
- `investment_contributions`/`investment_returns`: `(tenant_id, project_id)`, `(tenant_id, investor_id)`
- `inspections`: `(tenant_id, unit_id)`, `(tenant_id, project_id)`
- `maintenance_requests`: `(tenant_id, unit_id)`, `(tenant_id, status)`
- `terrains`: `(tenant_id, status)`
- `projects`: `(tenant_id, slug)` único, `(tenant_id, status)`
- `public_leads`: `(tenant_id, project_id)`, `(tenant_id, status)`
- `tenant_users`: `(tenant_id, role)`

## 5. Ordem de migrations

1. `0001_tenants_and_tenant_users.sql`
2. `0002_projects.sql`
3. `0003_units.sql` (sem `active_deal_id` ainda)
4. `0004_terrains.sql`
5. `0005_clients.sql`
6. `0006_real_estate_agencies_and_brokers.sql`
7. `0007_deals.sql` (`deals`, `deal_brokers`, enum `deal_sales_stage` já unificado)
8. `0008_units_active_deal_id.sql` (`ALTER TABLE units ADD COLUMN active_deal_id ...`)
9. `0009_crm_support.sql` (`activities`, `status_transitions`, `unit_checks`)
10. `0010_documents.sql` (`contracts`, `documents`, `doc_requirements`)
11. `0011_finance.sql`
12. `0012_commissions.sql`
13. `0013_investors.sql`
14. `0014_inspections.sql`
15. `0015_maintenance.sql`
16. `0016_notifications.sql`
17. `0017_public_leads.sql`
18. `0018_support_tickets.sql` (tabela de plataforma, sem `tenant_id`)

**Primeira fatia vertical de validação**: `0001` (fundação) + `0002`/`0003`
(`projects`/`units`) — é a base da qual quase tudo mais depende, inclusive
o próprio mecanismo de RLS/claim. Schema → RLS (`rls-guardian`) → hooks/UI
(`frontend-builder`) validados ponta a ponta antes de seguir para os
módulos seguintes.

Cada tabela criada por estas migrations **ainda não tem RLS** — isso é
responsabilidade do `rls-guardian` na etapa 5, tabela por tabela, com
teste de isolamento correspondente.
