# Arquitetura do Projeto

> Preenchido durante a etapa 1 do `/start-project`. Serve como registro das
> decisões específicas deste projeto — o `CLAUDE.md` tem as convenções
> gerais que valem para qualquer projeto do template.

## Domínio

- **Tipo de sistema**: SaaS de gestão para incorporadoras/construtoras
  residenciais, com foco em empreendimentos MCMV (Minha Casa Minha Vida).
  Cobre o ciclo completo: prospecção de terreno → viabilidade →
  empreendimento/unidades → funil de vendas (CRM) → pipeline administrativo
  e documental até a entrega → financeiro e cobrança → comissão de
  corretores → captação de investidores → vistoria e manutenção
  pós-entrega. Inclui também um site público de vendas ("espelho de
  vendas") com captura de leads e reserva temporária de unidade, e um
  portal para o cliente comprador acompanhar sua unidade.
- **Público/usuários finais**: equipe interna da incorporadora
  (administrador, comercial, administrativo), corretores (autônomos ou de
  imobiliárias parceiras), clientes compradores (portal do cliente),
  investidores do projeto (portal do investidor), e leads públicos
  anônimos (site de vendas, sem login).
- **O que representa um tenant aqui**: cada incorporadora/construtora que
  usa a plataforma. O projeto original (Base44, pasta `original-project/`)
  foi construído para uma única empresa fixa ("Vivlar") — não existe
  nenhum conceito de tenant/organização no código original. Essa é a
  principal mudança de escopo pedida: introduzir `tenant_id` do zero em
  toda tabela de domínio, com RLS de isolamento (ver `CLAUDE.md`).

## Origem: clonagem do projeto Base44

Este projeto não parte de um protótipo HTML novo. Por decisão explícita do
usuário, `original-project/` (o export completo do app React/Base44) é a
**fonte da verdade visual e funcional** — a etapa 2 do fluxo padrão
(`ui-prototyper` + aprovação de `prototypes/`) foi substituída por esta
pasta. Toda tela nova replica fielmente layout, copy e comportamento do
original, a menos que o usuário peça mudança.

Mapeamento completo de entidades, papéis, fluxos e funções de backend do
projeto original: **`docs/DOMAIN_MAP.md`**.

### Decisões de limpeza ao portar o schema

O projeto original tem redundâncias e inconsistências internas
(inevitável em algo construído incrementalmente no Base44). Decisões
tomadas ao desenhar o schema novo, documentadas para não haver dúvida
depois:

- **Financeiro**: existem dois modelos paralelos —
  `FinanceAccount`+`PaymentInstallment` (módulo financeiro principal,
  usado por `FinanceDetail.jsx`/`FinanceTabNew.jsx`) e
  `VendaFinanceira`+`ParcelasEntrada` (usado só pela aba antiga
  `FinanceTab.jsx`, não `FinanceTabNew.jsx`). Mantemos apenas
  `finance_accounts`/`payment_installments`; `VendaFinanceira` não é
  portado.
- **Investidor**: no original, `investor_id` significa coisas diferentes
  em telas diferentes (ora `Investor.id`, ora `User.id` direto — bug real
  do app original). No schema novo, `investors` ganha `user_id` (mesmo
  padrão de `clients.user_id`) e toda FK `investor_id` aponta sempre para
  `investors.id`.
- **Activity**: 3 pontos do código original criam registros com campos
  diferentes entre si. Unificamos em um único formato
  (`title`, `type`, `description`, `due_date`, `priority`, `status`,
  `deal_id`, `client_id`, `unit_id`).
- **Notification**: idem — variante admin (`audience`, `event_key`,
  `meta`) e variante do portal do cliente (`user_id`, `related_id`)
  unificadas em uma tabela só, com colunas nullable.
- **Feasibility/FeasibilityCostItem**: modelo rico de viabilidade
  econômica que existe só em `base44/functions/` (backend), nunca
  conectado a nenhuma tela do frontend — o app usa hoje um modelo
  simplificado direto em `Project` (`total_construction_cost`,
  `total_indirect_costs`). Não portamos o modelo órfão; mantemos o
  simplificado, que é o que está de fato em uso.
- **Magic link do portal do cliente** (`ClientAccessToken`,
  `ClientSession`, `generateClientMagicLink`, `validateClientToken`,
  `getClientSession`): existe no backend original mas nenhuma tela do
  frontend consome — feature incompleta/abandonada. Não portamos; o
  portal do cliente usa Supabase Auth normal (que já suporta magic link
  nativamente, se quisermos reviver a ideia depois).
- **Integrações externas** (Microsoft Teams, OneDrive, WhatsApp, Apple
  Sign In, Stripe): fazem parte do domínio, mas dependem de credenciais
  próprias do usuário. Ficam mapeadas no plano de schema/roadmap, porém
  são implementadas feature a feature via `/new-feature`, não na fundação
  inicial.

## Entidades centrais

| Entidade | Descrição | Tem tenant_id? |
|---|---|---|
| `tenants` | Incorporadora/construtora cliente da plataforma | — (é a raiz) |
| `tenant_users` | Vínculo usuário↔tenant, com role | sim |
| `terrains` | Terrenos em prospecção/aquisição | sim |
| `projects` | Empreendimentos | sim |
| `units` | Unidades de um empreendimento | sim |
| `clients` | Clientes compradores | sim |
| `deals` | Negócios do funil de vendas (CRM) | sim |
| `brokers` / `real_estate_agencies` | Corretores e imobiliárias parceiras | sim |
| `commissions` | Comissões de corretores | sim |
| `documents` | Documentos por unidade/negócio | sim |
| `finance_accounts` / `payment_installments` | Financeiro por unidade/cliente | sim |
| `investors` / `investment_contributions` / `investment_returns` | Investidores e aportes/retornos por projeto | sim |
| `inspections` / `inspection_templates` | Vistorias e templates de checklist | sim |
| `maintenance_requests` | Chamados de manutenção pós-entrega | sim |
| `notifications` | Notificações internas | sim |
| `public_leads` | Leads do site público (sem auth) | sim |

Lista completa (~35 entidades, campos e relacionamentos): `docs/DOMAIN_MAP.md`.

## Primeira feature (fatia vertical de validação)

Construção por módulos, cada um commitado e deployado separadamente na
Vercel antes de avançar (decisão do usuário, 2026-07-20): 1) auth +
multitenancy, 2) dashboard (shell/sidebar), 3) módulos seguintes (CRM,
unidades, financeiro etc.) via `/new-feature`, um de cada vez.

### Dashboard construído incrementalmente (decisão do usuário, 2026-07-20)

O Dashboard Executivo original (`original-project/src/pages/Dashboard.jsx`)
junta blocos que dependem de ~8 entidades diferentes (projetos, unidades,
deals, comissões, financeiro, vistorias, manutenção). Em vez de replicar
tudo de uma vez com dado nenhum por trás, o módulo de Dashboard entregou
só o shell (sidebar/navegação, `src/routes/AppShell.tsx`) + uma página
`src/features/dashboard/pages/Dashboard.tsx` vazia/mínima.

**Regra para todo módulo novo daqui pra frente**: se o módulo tiver um
bloco correspondente no Dashboard original (KPI, gráfico, seção), o
`/new-feature` desse módulo também adiciona esse bloco em
`src/features/dashboard/pages/Dashboard.tsx`, na mesma ordem em que
aparece no original — não fica para depois, é parte do próprio módulo.
Exemplos: módulo de Projetos/Unidades adiciona os KPIs de unidades;
CRM adiciona o funil de vendas; Financeiro adiciona o gráfico de receita;
Vistorias/Manutenção adicionam a seção "Operacional e Pós-Venda".

## Riscos aceitos (não corrigidos, decisão consciente do usuário)

Da auditoria de segurança do módulo de auth (2026-07-20), nenhum achado
crítico/alto. Dois achados médios foram aceitos como risco por ora:

- **Enumeração de e-mail no signup**: a tela informa explicitamente
  "este e-mail já está cadastrado" quando o e-mail já existe
  (`src/features/auth/errors.ts`). Aceito porque o cadastro ainda não é
  público — revisar antes de abrir signup para fora da equipe.
- **Sem limite de criação de tenants**: a RPC `create_tenant_with_admin`
  não limita quantos tenants um mesmo usuário pode criar. Aceito pelo
  mesmo motivo (signup não é público ainda) — adicionar limite antes de
  abrir cadastro público.

Achado baixo não corrigido: `EXECUTE` de `set_updated_at()` sobrando para
`anon`/`PUBLIC` no banco (não explorável na prática, função de trigger
sem lógica de negócio).

## Desvios do padrão do CLAUDE.md

- Etapa 2 (`ui-prototyper` + `prototypes/`) substituída por
  `original-project/` como fonte visual — ver seção "Origem" acima.
- Domínio não foi levantado por perguntas ao usuário, e sim por
  engenharia reversa do código-fonte de `original-project/` (pedido
  explícito do usuário).

## Status

- [x] Domínio definido
- [x] Plano de schema aprovado
- [x] Scaffold criado
- [x] Auth + RLS + isolamento validado
- [x] Módulo 1 (auth + multitenancy) implementado, auditado e em produção — https://vivlar.vercel.app
- [ ] Módulo 2 (dashboard)
- [ ] Demais módulos (via `/new-feature`)
- [ ] Auditoria de arquitetura geral rodada
