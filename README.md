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
duplicar a lista aqui). Módulo em produção mais recente: Módulo 9 —
Manutenção pós-entrega (migrations `0037` a `0040` aplicadas ao banco
remoto, deploy de 2026-07-23).

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
