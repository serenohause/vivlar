# Vivlar

Plataforma multitenant de gestão para incorporadoras/construtoras
residenciais (foco MCMV): do terreno à entrega da unidade — CRM de vendas,
pipeline administrativo e documental, financeiro e cobrança, corretores e
comissões, investidores, vistorias e manutenção pós-entrega, portal do
cliente e site público de vendas com captura de leads.

> Clonagem fiel de um projeto original construído no Base44
> (`original-project/`), adaptado para multitenancy — cada incorporadora
> que usa a plataforma é um tenant isolado. Ver `docs/ARCHITECTURE.md` e
> `docs/DOMAIN_MAP.md` para o detalhamento do domínio.

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com as credenciais do seu projeto Supabase
npm run dev
```

Outros scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run preview`.

## Produção

**https://vivlar.vercel.app** — Vercel (deploy automático a cada push em `main`) + Supabase (projeto `vivlar`, região `sa-east-1`, ref `hppeqpmxupfghymkulne`).

Construído por módulos, cada um deployado separadamente. Status atual e
lista completa: **`docs/STATUS.md`** (é o que fica atualizado — não
duplicar a lista aqui). Entrega em produção mais recente: Sessões
WhatsApp (item de menu "Sistema" — tela admin-only somente leitura
sobre `whatsapp_sessions`, monitorando o estado de sessões de um bot de
WhatsApp externo que nunca foi integrado a este repositório nem ao
original — feature que já estava pela metade lá, schema+tela existiam
sem o bot; replicada tão funcional quanto o original, sem inventar a
integração que falta; migrations 0072-0073; deploy de 2026-07-28).
Migrations `0072`-`0073` confirmadas sincronizadas entre local e
remoto (`npx supabase migration list --linked`) antes do deploy. RLS
confirmada habilitada na prática (`relrowsecurity = true` via consulta
a `pg_class` contra o projeto remoto) na tabela nova — SELECT
restrito a `tenant_role = 'admin'` do tenant do claim, sem nenhuma
policy de INSERT/UPDATE/DELETE (tabela genuinamente só-leitura por
desenho: nenhum código, no original ou aqui, cria/atualiza esta
entidade). Grants de `insert`/`update` concedidos por engano numa
migration anterior foram revogados de `authenticated` na mesma
migration da RLS, e `anon` segue sem nenhum privilégio (default já
bloqueado desde a migration `0003`). Auditoria de segurança deste
módulo sem achado nenhum, de nenhuma severidade. Smoke test pós-deploy:
chamada anônima direta a `whatsapp_sessions` via REST em produção
recusada (`401`/`permission denied for table whatsapp_sessions`,
`42501`, sem `GRANT` pra `anon`), confirmando que o isolamento por RLS
segue ativo, não só localmente.

Entrega anterior: Automação de Distrato + Checkup Distrato (dentro de
Unidades/Módulo 3 — distrato manual/automático de unidade ao aprovar
Termo de Distrato, reset reativo de fluxo MCMV pós-distrato,
reconciliação em lote admin-only corrigindo um bug real do original —
a tela mostrava "Inconsistências Detectadas" mas o botão nunca
reconciliava de verdade; RPCs
`apply_unit_distrato`/`check_and_reset_unit_mcmv_flow`/
`run_distrato_checkup`, migrations 0069-0071; deploy de 2026-07-28).
Migrations `0069`-`0071` confirmadas sincronizadas entre local e
remoto (`npx supabase migration list --linked` e
`supabase_migrations.schema_migrations` via Management API) antes do
deploy. RLS confirmada habilitada (`relrowsecurity = true`) nas 37
tabelas com `tenant_id` do projeto remoto — nenhuma tabela nova criada
por esta feature, só 3 RPCs `security definer` sobre tabelas já
existentes. Autorização real das 3 RPCs vive dentro da função (checagem
explícita de `tenant_role`: `admin`/`comercial`/`administrativo` para
`apply_unit_distrato`/`check_and_reset_unit_mcmv_flow`, `admin` exato
para `run_distrato_checkup`), não no `GRANT`: `anon` sem `EXECUTE`,
`authenticated` com `EXECUTE` (confirmado via
`information_schema.role_routine_grants` contra produção). Auditoria de
segurança deste módulo sem achado crítico/alto (um achado baixo aceito
e documentado: `run_distrato_checkup` devolve o texto cru de `sqlerrm`
por unidade que falha, mas só dados do próprio tenant do admin que
chamou, sem vazamento cross-tenant). Smoke test pós-deploy: chamada
anônima às 3 RPCs novas em produção recusada (`401`/`permission
denied`, sem `GRANT` pra `anon`) e leitura anônima de `units` segue
recusada (`401 permission denied`), confirmando que o isolamento por
RLS segue ativo, não só localmente.

Entrega anterior a essa: Checkup Financeiro (dentro do Financeiro/Módulo 5 —
saneamento transacional de carteiras/parcelas duplicadas, campos
inconsistentes e atraso não marcado, via RPC `run_finance_checkup`,
admin-only; deploy de 2026-07-28).

Entrega anterior a essa: Comparador de Unidades (dentro do Catálogo/Módulo 3 —
ranking de unidades por score composto: progresso administrativo 40% +
documentos 30% + saúde financeira 30%; deploy de 2026-07-28). Só
leitura, sem migration nova. Auditoria de segurança deste módulo sem
achado crítico/alto/médio/baixo. Smoke test pós-deploy: `units` segue
recusando leitura anônima em produção (`401 permission denied`,
sem `GRANT` pra `anon`), confirmando que o isolamento por RLS/tenant
segue ativo, não só localmente.

Checklist seguido a cada deploy (ver `deploy-engineer`): auditoria de
segurança sem achado crítico/alto em aberto, migrations aplicadas na
ordem certa, RLS habilitada em toda tabela com `tenant_id` (não só
policies criadas), variáveis de ambiente client (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) na Vercel, `SUPABASE_SERVICE_ROLE_KEY` restrita
a contexto server-side, e smoke test pós-deploy confirmando isolamento
entre tenants em produção.

---

## Desenvolvimento com IA

Esta pasta foi criada a partir do **Arkeo AI Starter** — um kit reutilizável
(React + Vite + TypeScript + Tailwind + Supabase, multitenant) com Claude
Code configurado para guiar da definição do domínio até o deploy.

### Fluxo

Digite `/start-project` (ou descreva a ideia do projeto — a skill dispara
automaticamente) e o Claude Code conduz, nesta ordem, com um commit ao
final de cada etapa:

1. Perguntas sobre o domínio (usuários, o que é um tenant, entidades centrais, telas principais).
2. **Protótipo visual em HTML** (`prototypes/`) — aprovação sua antes de qualquer schema ou código React.
3. Plano de schema, para aprovação, antes de gerar SQL.
4. Scaffold do projeto (Vite + Tailwind v4 + Supabase + React Query + Zod + Lucide) e tradução do protótipo aprovado para React.
5. Fundação de auth + RLS + teste de isolamento entre tenants.
6. Primeira feature implementada ponta a ponta, conectando dado real à UI já traduzida.
7. Auditoria de arquitetura e de segurança.
8. Deploy (Vercel + Supabase), quando você pedir.

Depois disso:
- Features novas: `/new-feature`.
- Auditar arquitetura a qualquer momento: `/audit-architecture`.
- Auditar segurança a qualquer momento: `/security-audit`.
- Publicar: `/deploy`.

### O que tem aqui dentro

- **`CLAUDE.md`** — stack padrão, modelo de multitenancy, convenção de
  commits e convenções gerais. É a primeira coisa que o Claude Code lê.
- **`.claude/agents/`** — subagentes especializados: `ui-prototyper`,
  `schema-architect`, `rls-guardian`, `frontend-builder`,
  `security-auditor`, `deploy-engineer` — cada um com escopo e ferramentas
  restritas ao que precisa fazer.
- **`.claude/skills/`** — os fluxos de trabalho (`start-project`,
  `new-feature`, `audit-architecture`, `security-audit`, `deploy`),
  invocáveis por `/comando` ou disparados automaticamente.
- **`docs/ARCHITECTURE.md`** — decisões específicas deste domínio.
- **`.env.example`** — variáveis do stack padrão (Supabase).

### Se o stack padrão não servir para este projeto

Edite o `CLAUDE.md` **antes** de rodar `/start-project` — por exemplo, se o
projeto vai ter mobile desde o início, ou single-tenant em vez de
multitenant. As skills e subagentes leem esse arquivo, então uma mudança
ali já reflete em todo o fluxo.

### Por que essa estrutura

O ponto central é não precisar redecidir arquitetura a cada projeto novo:
protótipo aprovado antes de código, multitenancy via `tenant_id` + RLS +
JWT claim, camadas separadas (schema → RLS → hooks → UI), auditoria de
segurança antes do deploy, e histórico de commits granular por etapa/módulo.
Isso reduz retrabalho, risco de vazamento de dados entre clientes, e torna
mais fácil entender o histórico do projeto depois — inclusive para outro
desenvolvedor que entre no meio do caminho.
