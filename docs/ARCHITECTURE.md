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

## Débito técnico por módulo (o que cada módulo deixou para depois)

Registro consolidado, atualizado a cada módulo (pedido do usuário,
2026-07-21: "documente isso" para não deixar o sistema incompleto sem
perceber). Cada item aqui é uma simplificação deliberada — sempre porque
a peça que faltava é o assunto de um módulo futuro — não um bug
esquecido. Ao construir o módulo que resolve um item, risque-o daqui.

**Módulo 1 — Auth**
- Fluxo de aceitar convite de colaborador para um tenant já existente
  (hoje só dá para criar tenant novo como admin; convite de outros
  usuários para um tenant existente não está implementado).
- Nome de exibição do usuário: usa o e-mail (antes do `@`) como iniciais/
  nome no shell — não há campo de nome próprio no perfil ainda.
- Enumeração de e-mail no signup e ausência de rate limit na criação de
  tenants — riscos aceitos, ver seção "Riscos aceitos" abaixo.

**Módulo 3 — Catálogo (Terrenos/Projetos/Unidades)**
- Terrenos: sem mapa/editor de polígono (Leaflet); localização é só
  lat/lng em inputs simples.
- Terrenos: botão "Transformar em Projeto" fica desabilitado (depende de
  um fluxo de criação de projeto vinculado ao terreno).
- Projetos: sem aba "Resultado Operacional" (viabilidade econômica),
  sem `broker_responsavel_id`, sem cards de Negociações/Documentos/
  Contratos no detalhe.
- Unidades: sem aba financeira, sem aba de vistoria, sem checklist de
  documentos, sem timeline de atividades — essas abas do `UnitDetail.jsx`
  original chegam com os módulos de Financeiro, Vistorias, Documentos e
  CRM respectivamente.
- Unidades: `active_deal_id` não existe na tabela (dependia de `deals`,
  que já existe desde o módulo 4 — **candidato a resolver na próxima
  migration de unidades**, ver nota abaixo).
- Unidades: pipeline `admin_status` sem validação de documentos
  obrigatórios antes de avançar (avisado discretamente na UI); mudança
  de estágio não grava em `status_transitions` ainda (só o módulo de
  CRM grava lá, para `sales_stage`).
- Unidades: sem validação de capacidade do projeto (`total_units`) ao
  criar unidade nova.
- Unidades: exclusão (soft delete) não bloqueia mais se a unidade tem
  negócio ativo — **isso já é possível verificar agora que `deals`
  existe (módulo 4), mas ainda não foi implementado**; era esperado
  quando `units` foi construído (deals não existia ainda), continua
  pendente.

**Módulo 4 — CRM (Clientes/Corretores/Imobiliárias/Deals)**
- `DealDetail`: sem aba "Documentos" (depende do módulo de Documentos).
- Sem criação automática de `Commission` ao marcar negócio como vendido
  (módulo de Comissões).
- Sem convite de portal para o cliente ao vender (módulo de Portal do
  Cliente — também listado no módulo 1).
- Sem notificação/integração com Microsoft Teams (não existe tabela
  `notifications`, e a integração externa em si é feature à parte).
- `deal_brokers` (co-corretagem) não foi criado — nenhuma tela do
  original de fato o usa hoje.
- `unit_checks`: esta seção afirmava que também não era usada em
  nenhuma tela — **incorreto**, corrigido no módulo 11. `UnitDetail.jsx`
  do original grava e lê de verdade (`createCheckMutation`/
  `updateCheckMutation`/`checkCanAdvance`, gate de avanço de
  `admin_status`), só nunca tinha sido conferido linha a linha até então.
  Tabela criada em `0048_unit_checks.sql`.

**Módulo 5 — Financeiro (Contas a Receber, Dashboard Financeiro, Inadimplência)**
- Sem `FinancingProcess` (processo de financiamento bancário) — schema
  incerto no original (só leitura em `src`, sem `.create()`). Criada no
  módulo 11 (`0052_financing_process.sql`), motivada pelo Portal do
  Cliente; continua só leitura (nenhum `.create()`/`.update()` em
  lugar nenhum do original, nem admin nem cliente).
- `finance_accounts` sem `contract_id` — `contracts` não existe ainda
  (módulo futuro de Documentos/Contratos).
- Sem `DistratoCheckup`/`FinanceCheckup` — ferramentas de auditoria/
  revisão de dados do original, não telas de operação do dia a dia.
- `cobranca_historico` só registra ações manuais (ligação/WhatsApp/
  e-mail/outro) que o usuário loga na hora — sem escalonamento
  automático por cron (`dailyEscalonamentoCobranca`/
  `inadimplenciaAutomation` do original) e sem envio real de e-mail/
  WhatsApp pelo sistema (os atalhos abrem `mailto:`/`wa.me` do
  navegador, não enviam nada pelo backend).
- Criação de `finance_account` não tem tela própria — nasce a partir de
  `UnitDetailPage` ("Criar Carteira Financeira"), diferente do original,
  que criava silenciosamente na primeira parcela adicionada.
- `metodo_pagamento` e `canal` de cobrança são texto livre no banco
  (não enum), diferente do original — normalizados na apresentação
  (gráfico de formas de pagamento) em vez de restringidos na entrada.

**Módulo 6 — Comissões**
- Sem `entities.Notification` em `CommissionDetail.jsx` (tabela não
  existe ainda, mesmo padrão dos módulos anteriores).
- Anexos (`attachment_url`/`comprovante_url`) são texto/URL, sem upload
  real de arquivo — mesmo padrão do financeiro.
- **Fechado nesta leva**: a criação automática de `Commission` ao
  vender um negócio, que tinha ficado pendente no módulo de CRM, agora
  acontece dentro da própria RPC `update_deal_stage`
  (`supabase/migrations/0028_*.sql`) — atômica junto com a troca de
  estágio, sem precisar de uma chamada solta do client.
- Não há criação manual de comissão avulsa (confirmado: nem o original
  tem essa tela — comissão só nasce da venda de um negócio).
- Sem bloco de comissões no Dashboard Executivo: `Dashboard.jsx`
  original importa dados de comissões (`useDashboardData`) mas nunca os
  renderiza — mesmo código morto já visto em `DashboardStats`/
  `DashboardCharts` — então não há nada real para replicar aqui.

**Módulo 7 — Documentos**
- Primeiro módulo com upload real de arquivo (Supabase Storage, bucket
  privado `documents`, path `{tenant_id}/{arquivo}`, RLS de
  `storage.objects` isolando por tenant) — todos os módulos anteriores
  tratavam anexo como texto/URL.
- `document_status` tem 4 valores (`pendente`, `recebido`, `aprovado`,
  `rejeitado`) — os docs de plano (`DOMAIN_MAP.md`/`SCHEMA_PLAN.md`)
  citavam só 3, corrigido ao confirmar contra o código-fonte real.
- Objeto no Storage não é removido quando o documento é soft-deletado
  na tabela — fica órfão no bucket; rotina de limpeza é decisão de
  produto futura, não implementada.
- Upload que falha no INSERT da tabela tenta remover o arquivo já
  enviado ao bucket (best-effort, não bloqueia o erro original) — 2
  escritas não-atômicas, mesmo padrão já aceito em `finance_accounts`
  (a segunda escrita não envolve valor financeiro, então uma RPC
  dedicada não se justificou aqui).
- Sem `DocRequirement` (configuração de quais documentos são
  obrigatórios por `admin_status`) — pertence ao original a uma tela de
  Configurações separada de `Documents.jsx`, fora de escopo. Sem isso,
  a validação de documentos obrigatórios no pipeline `admin_status` de
  `units` continua não implementada (débito já registrado no módulo 3).
- **Fechado nesta leva**: aba "Documentos" no detalhe do negócio (CRM,
  módulo 4) e seção "Documentos" no detalhe da unidade (Catálogo,
  módulo 3) — ambas usando o mesmo `DocumentFormDialog` com contexto
  travado (projeto/unidade/negócio pré-preenchidos).
- Edição de documento é só metadados (tipo/título/data/observações) —
  sem reenvio de arquivo nem troca de projeto/unidade/status, diferente
  do original, que reaproveita o mesmo formulário de criação inteiro
  para edição.

**Módulo 8 — Vistorias (Pós-Venda)**
- Segundo bucket de Storage do projeto (`inspection-media`, privado,
  aceita `image/jpeg`/`image/png`/`application/pdf`, até 20MB) — fotos
  de item de checklist e o PDF da vistoria assinado pelo cliente
  (assinatura do vistoriador não anexa arquivo, só um checkbox de
  confirmação).
- `src/components/unit/InspectionDashboard.jsx` e
  `src/components/dashboard/InspectionsDashboard.jsx` do original **não
  foram portados de propósito**: confirmado que são 100% locais
  (`localStorage`, checklist hardcoded), nunca tocam nenhuma entidade
  `Inspection*` do backend — órfãos no próprio original, não uma
  simplificação nossa.
- `inspection_item_results.due_date`/`resolved_at` não existem no
  schema — lidos em condicionais defensivas no original, mas sem
  nenhum `.create()`/`.update()` que os preencha (mesmo critério de
  `commissions.paid_at`, módulo 6). Sem prazo de correção de pendência
  implementado.
- Sem geração de PDF da vistoria (`inspectionPdf.jsx` do original).
- Sem auto-criação de "template padrão" na primeira visita à lista de
  templates (comportamento de dado de demonstração do Base44
  single-tenant, não faz sentido replicar num SaaS multitenant — cada
  tenant cria seu primeiro template explicitamente).
- Índice único parcial em `inspection_item_results` (1 resultado ativo
  por item por vistoria) fecha uma classe de bug de duplicação que o
  original só contornava via `normalizeResults` (dedupe reativo no
  frontend) — a UI nova nem precisa dessa rotina.
- **Fechado nesta leva**: seção "Vistorias" no detalhe da Unidade
  (Catálogo, módulo 3) — lista simples com link para o detalhe
  completo, sem duplicar a lógica de checklist ali.
- Sem bloco de vistorias no Dashboard Executivo: mesmo padrão de código
  morto já visto em `DashboardStats`/comissões — `Dashboard.jsx`
  original importa `inspections` de `useDashboardData` mas nunca
  renderiza.
- Vistoriador exibido pelo e-mail do usuário logado (sem diretório de
  usuários do tenant consultável pelo frontend ainda — mesma lacuna já
  registrada no módulo 1, nome de exibição).

**Módulo 9 — Manutenção pós-entrega**
- Escopo desta leva é só o lado interno/admin (`AdminMaintenance.jsx` +
  `MaintenanceDetail.jsx`) — decisão explícita do usuário (2026-07-23).
  `ClientMaintenance.jsx` (cliente abre o próprio chamado) fica para um
  futuro módulo de Portal do Cliente, que ainda não existe no projeto
  (hoje a navegação do perfil "cliente" é toda "em construção").
- Terceiro bucket de Storage do projeto (`maintenance-photos`, privado,
  só `image/jpeg`/`image/png`, até 20MB) — `photos` fica como array de
  paths direto na própria tabela (sem tabela de mídia separada, diferente
  de Vistorias), porque o original não tem entidade de mídia própria
  pra manutenção.
- Sem criação de `Notification` ao mudar status/agendar (mesmo critério
  já usado nos módulos anteriores — tabela não existe no projeto novo).
- Sem exportação em PDF (`exportMaintenanceToPDF`,
  `exportMaintenanceRequestToPDF` do original) — funcionalidade
  secundária, não essencial ao fluxo abrir → agendar → resolver.
- `suggested_date` existe no schema (documentado desde a migration como
  "sugerida pelo cliente ao abrir o chamado") mas sem write path nesta
  rodada, já que a criação é só pelo lado admin — só ganha uso real
  quando/se o Portal do Cliente for construído.
- Sem bloco de manutenção no Dashboard Executivo: confirmado que
  `Dashboard.jsx` original desestrutura `maintenance` de
  `useDashboardData` mas nunca renderiza nada com isso — mesmo padrão
  de código morto já visto em Comissões/Vistorias.
- **Achado transversal, não específico deste módulo**: o badge de
  contagem da sidebar (`useNavigationBadges`,
  `src/features/dashboard/hooks.ts`) nunca foi implementado de verdade
  em nenhum módulo anterior — `crm`/`finance`/`inspections`/`units`
  continuam sempre zerados, apesar dos módulos que os alimentariam já
  estarem em produção. Corrigido só o badge `maintenance` nesta leva
  (contagem real de chamados não resolvidos/cancelados); os demais
  seguem como débito técnico pendente, fora do escopo desta rodada.
- **Fechado nesta leva**: seção "Manutenções" no detalhe da Unidade
  (Catálogo, módulo 3), mesmo padrão da seção "Vistorias" — lista com
  link pro detalhe completo e botão de novo chamado (desabilitado se a
  unidade não tiver negócio vendido associado).

**Módulo 10 — Investidores**
- Escopo desta leva é só o lado interno/admin — decisão explícita do
  usuário (2026-07-23), mesmo critério da Manutenção. `InvestorProjects.jsx`,
  `InvestorProjectDetail.jsx`, `InvestorContributions.jsx`,
  `InvestorReturns.jsx` (portal de autoatendimento do investidor, role
  `investidor` logando pra ver só os próprios dados) ficam para um
  futuro módulo de Portal, junto com o do Cliente.
- **Achado real do original, não uma simplificação nossa**: `ProjectInvestor`
  (vínculo investidor↔projeto, com o % de participação) não tinha
  nenhuma tela de criação em `original-project/src` — só era lido, nunca
  criado por nenhuma página. Aparentemente era escrito direto no banco
  pela equipe técnica do Base44. Como a plataforma nova não tem esse
  acesso, criamos do zero o dialog "Vincular a Projeto" em
  `InvestorDetailPage` (com criar/editar/remover vínculo) — sem
  equivalente visual no original para copiar.
- **Fechado nesta leva, antes mesmo de ir para produção**: os campos
  `total_construction_cost`/`total_indirect_costs` de `projects`, que
  tinham ficado de fora no módulo 3 ("módulo futuro", comentário em
  `0007_projects.sql`), foram adicionados (`0046_project_operational_result_costs.sql`)
  e conectados ao formulário de Projeto — sem eles, o cálculo de
  Resultado Operacional do Dashboard de Investidores ficaria
  artificialmente otimista (só descontaria comissão, nunca o custo real
  da obra). Decisão do usuário: corrigir antes do deploy, não aceitar
  como risco.
- `calculateParticipationPercentages` (recalcular % de participação
  automaticamente a partir do valor aportado de todos os investidores de
  um projeto) existe no original mas nunca está conectado a nenhum
  `.update()` real — código morto no próprio original. Não implementado;
  `percentual_participacao` continua sendo definido manualmente por quem
  cadastra o vínculo. Candidato a um botão "Recalcular automaticamente"
  em uma rodada futura.
- `calculateROI`/`aggregateReturnsByInvestor` foram portados por
  completude (mesmas funções do original), mas — fiel ao próprio
  original, que os importa sem usar o resultado no JSX renderizado —
  não são exercidos pela UI nova também.
- Sem exportação em PDF, sem criação de `Notification`, sem upload real
  de comprovante de aporte (`comprovante_url`/`comprovante_nome`
  continuam texto/URL simples, mesmo padrão de `commissions.attachment_url`
  — nenhuma tela do original faz upload de fato, só exibe se preenchido).
- Sem bloco de investimentos no Dashboard Executivo: confirmado que
  `Dashboard.jsx` original não referencia nada de investidores (nem como
  código morto) — o Dashboard de Investidores é uma página própria, não
  um bloco do executivo.
- Controle de acesso por papel refletido na UI (botões de
  criar/editar/excluir só para `admin`, mesmo padrão da Manutenção) —
  `comercial`/`administrativo` só consultam, decisão de produto do
  usuário porque envolve dinheiro de terceiros, sem equivalente no
  original (o app antigo não tinha controle de acesso por papel).

**Módulo 11 — Portal do Cliente**
- **Correção de escopo no meio do módulo**: a fonte inicial usada
  (`original-project/src/pages/ClientPortal.jsx`) acabou sendo uma
  página órfã — não referenciada em nenhuma navegação do original
  (confirmado por grep em todo `original-project/src`). O portal do
  cliente de fato usado é outro conjunto de 3 páginas, linkadas em
  `Layout.jsx` ("PORTAL DO CLIENTE"): `ClientUnit` (minha unidade),
  `ClientFinance` (financeiro + financiamento) e `ClientMaintenance`
  (abrir/acompanhar/cancelar chamado de manutenção, com foto
  obrigatória). São essas 3 que foram portadas.
- **`construction_photos`/`client_messages`**: tabelas criadas (com RLS)
  antes de descobrir que `ClientPortal.jsx` era órfã. Decisão do usuário
  (2026-07-27): manter no schema sem UI correspondente, como preparação
  não utilizada — não são lidas nem escritas por nenhuma tela hoje.
  Revisitar se um dia a galeria de fotos de obra ou o mural de mensagens
  virar prioridade de produto (no original, nenhuma tela cria esses
  dados também — seriam features novas, não uma restauração).
- **Fechado nesta leva**: `unit_checks` (ver correção acima, módulo 4) —
  criada e com RLS, mas nenhuma tela nova (admin ou cliente) foi
  construída para lê-la/escrevê-la neste módulo; o gate de avanço de
  `admin_status` por checklist continua não implementado no admin
  (`UnitDetailPage`). Schema pronto para quando isso for priorizado.
- **`status_transitions` do `admin_status`**: continua não gravando
  (só `sales_stage` do CRM grava lá) — lacuna de UI no admin
  (`UnitDetailPage`), não de schema (tabela já suporta
  `transition_type = 'admin'` desde o módulo 3). `ClientUnit` mostra o
  `admin_status` atual direto da unidade, sem depender dessa lacuna.
- Sem convite automático de portal: criar um `tenant_users` com
  `role='cliente'` vinculado ao `user_id` de um `clients` continua
  manual (mesma lacuna já apontada no módulo 1/4) — sem RPC/fluxo de
  "criar acesso do cliente" ao vender. Confirmado que também não existe
  no original (nenhum `.create()` de convite em `src`).
- Sem `Notification` (entidade não existe no projeto, débito transversal
  já conhecido desde módulos anteriores) — `ClientMaintenance.jsx`
  cria uma ao abrir chamado no original, não portado.
- Link "ver detalhe" de um chamado de manutenção, na lista do cliente,
  não foi implementado — decisão deliberada do `frontend-builder`: a
  página de detalhe existente (`MaintenanceDetailPage`, módulo 9) tem
  "Voltar" apontando para `AdminMaintenance` (fora de
  `CLIENT_ALLOWED_PAGES`), o que redirecionaria o cliente de volta pra
  "Minha Unidade" de forma confusa. A lista já mostra status/prioridade/
  agendamento/cancelar inline. Candidato a um detalhe próprio do
  cliente numa rodada futura, se o volume de informação justificar.
- `FinancingProcess` continua só leitura pelo cliente (fiel ao
  original — nenhuma tela, nem admin, cria/edita) — se o produto quiser
  que a própria equipe registre o processo de financiamento, precisa de
  uma aba nova em `FinanceAccountDetailPage`, fora do escopo deste
  módulo.

**Módulo 12 — Portal do Investidor**
- **Sem tabela nova**: diferente do Portal do Cliente, nenhuma migration
  de schema foi necessária — `investors.user_id` já existia desde o
  módulo 10, pensado exatamente para este vínculo.
- **Desvio deliberado do original, motivado por segurança, não um bug
  corrigido por acaso**: `InvestorDashboard.jsx` (a página consolidada
  de 512 linhas) lista TODOS os investidores lado a lado, com nome e
  saldo de cada um (`investorBalances`) — sem nenhum filtro por usuário
  logado no próprio original. Portar isso literalmente pro papel
  `investidor` vazaria dado financeiro privado de terceiros pro
  primeiro investidor que logasse. A RLS nova (`0055_rls_investor_portal.sql`)
  bloqueia isso de propósito (só as próprias linhas de
  `investment_contributions`/`investment_returns`/`project_investors`),
  e a rota `InvestorDashboard` passou a renderizar dois conteúdos
  diferentes por `tenantRole`: equipe interna continua vendo o
  consolidado de sempre (sem nenhuma mudança); `investidor` vê um
  resumo pessoal novo (`InvestorDashboardInvestorView`, sem
  equivalente visual no original — mesma categoria de decisão já
  tomada no módulo 10 para os campos de custo de obra, "envolve
  dinheiro de terceiros").
- **`deals`/`commissions` não expostos ao papel investidor**: as 4
  telas do original cruzam essas 2 tabelas no client para calcular o
  "Resultado Operacional" (receita, custos, lucro, margem) por
  projeto — dado comercial granular (valor de venda por unidade, etc.)
  que não deve ser lido linha a linha por alguém externo ao tenant.
  Criada a função `get_project_operational_result` (SECURITY DEFINER,
  `0056_investor_operational_result.sql`), que replica exatamente
  `calculateProjectResults` (`src/features/investors/resultHelpers.ts`)
  dentro do banco e devolve só o agregado, autorizada apenas para quem
  tem vínculo ativo no projeto (ou é equipe interna).
- Dashboard pessoal (`InvestorDashboardInvestorView`) não soma "Lucro
  Esperado" agregado de todos os projetos na tela de entrada —
  exigiria uma chamada de RPC por projeto já na landing page. Os cards
  de projeto linkam direto para "Meus Projetos", que já mostra
  Lucro Esperado/Margem por projeto (via a mesma RPC, uma chamada por
  card).
- Sem convite automático de portal (mesma lacuna do módulo 11/4): criar
  um `tenant_users` com `role='investidor'` vinculado ao `user_id` de
  um `investors` continua manual.
- Sem exportação em PDF, sem criação de `Notification` — mesmas
  decisões já tomadas no módulo 10.

## Achados de segurança corrigidos (não aceitos como risco)

- **Módulo 6 — Comissões** (auditoria de 2026-07-21): achado **alto**
  de atomicidade em `useCreateAdjustment`/`useCreatePayment`/
  `useUpdatePayment`/`useSoftDeletePayment` (2 escritas sequenciais sem
  transação, sendo a segunda o próprio valor pago ao corretor —
  diferente do financeiro, onde a segunda escrita era só um log).
  Corrigido movendo as 4 mutations para RPCs transacionais
  (`supabase/migrations/0029_commission_transactional_rpcs.sql`), mesmo
  padrão de `update_deal_stage` (módulo 4).
- **Módulo 7 — Documentos** (auditoria de 2026-07-21): achado **médio**
  de upload sem validação real de tipo/tamanho (`accept` do
  `<input type="file">` é só dica de UI, contornável). Corrigido com
  validação no client (PDF/JPG/PNG, até 20MB,
  `DocumentFormDialog.tsx`) espelhada no bucket via
  `allowed_mime_types`/`file_size_limit`
  (`supabase/migrations/0033_documents_bucket_limits.sql`).
- **Módulo 9 — Manutenção** (auditoria de 2026-07-23): achado **baixo**
  de regra de negócio ("`scheduled_date` obrigatória ao agendar") só
  existir no client. Corrigido reforçando a checagem também no hook
  (`useUpdateMaintenanceRequest`), segunda camada de defesa.
- **Módulo 9 — Manutenção** (auditoria de 2026-07-23): achado **baixo**
  de a RLS de UPDATE permitir soft-delete (`is_deleted = true`) para
  `comercial`/`administrativo`, enquanto a tela só mostra "Excluir" pro
  Admin — regra de segurança mais permissiva que a intenção de produto.
  Corrigido restringindo no `WITH CHECK` da policy: só `admin` pode
  marcar `is_deleted = true` (os outros dois papéis continuam podendo
  fazer updates normais — status, agendamento, notas — só não excluir)
  (`supabase/migrations/0040_restrict_maintenance_soft_delete_to_admin.sql`).
  Efeito colateral aceito, documentado na própria migration:
  `comercial`/`administrativo` também não conseguem editar uma linha já
  excluída (mas podem desfazer a exclusão, já que a regra travou quem
  marca `true`, não quem reverte).
- **Módulo 10 — Investidores** (auditoria de 2026-07-23): achado **alto**
  de `total_construction_cost`/`total_indirect_costs` (campos de
  `projects` adicionados neste mesmo módulo) herdarem a policy geral de
  INSERT/UPDATE de `projects` (`admin`/`comercial`/`administrativo`),
  apesar de alimentarem diretamente o cálculo de quanto pagar a cada
  investidor — deveriam seguir a mesma regra "só admin mexe em dinheiro
  de terceiros" já aplicada ao resto do módulo. Corrigido com um trigger
  `BEFORE INSERT OR UPDATE` em `projects`
  (`supabase/migrations/0047_restrict_project_cost_fields_to_admin.sql`)
  que bloqueia `comercial`/`administrativo` de gravar valor diferente de
  zero nesses campos (INSERT) ou de alterá-los (UPDATE) — RLS declarativa
  não resolve aqui porque a regra precisa comparar o valor antigo com o
  novo, e nenhuma policy consegue ver as duas versões da linha ao mesmo
  tempo. `comercial`/`administrativo` continuam editando os demais campos
  de `projects` normalmente. Reforçado também na UI (campos desabilitados
  no formulário de projeto para quem não é admin,
  `ProjectForm.tsx`). Testado contra o banco remoto
  (`supabase/tests/0047_project_cost_fields_isolation.sql`).
- **Módulo 11 — Portal do Cliente**: achado **alto** de `financing_process`
  (tabela nova deste módulo, `0052`) ter ficado sem NENHUMA policy de RLS
  por um commit inteiro — qualquer `authenticated`, de qualquer tenant,
  podia ler/gravar qualquer linha. Corrigido na mesma leva de RLS deste
  módulo (`supabase/migrations/0053_rls_client_portal_access.sql`), antes
  de qualquer deploy.
- **Módulo 11 — Portal do Cliente**: achado **médio** de vazamento
  potencial entre clientes do mesmo tenant no bucket `maintenance-photos`
  — a policy de SELECT da equipe interna isola só por `tenant_id`, e
  copiá-la 1:1 para `tenant_role='cliente'` permitiria um cliente ler
  foto de OUTRO cliente do mesmo tenant (o path do objeto não codifica
  dono, só tenant). Corrigido com policy própria para `cliente`, exigindo
  posse real (`owner_id = auth.uid()` do próprio upload OU o path constar
  no `photos` de um chamado do próprio cliente via função
  `client_owns_maintenance_photo`) — nunca chegou a produção
  (`supabase/migrations/0054_rls_maintenance_photos_client.sql`).

## Riscos aceitos (não corrigidos, decisão consciente do usuário)

Achados médios/baixos aceitos como risco por ora, por módulo (achados
críticos/altos são sempre corrigidos antes do deploy, não aceitos —
ver seção acima para o único caso alto até agora):

**Transversal — referência cross-tenant via FK não validada** (achado da
auditoria do módulo 8, mas não específico dele)
- As policies de INSERT em toda tabela do projeto checam
  `tenant_id = claim` da própria linha, mas não que as FKs referenciadas
  (`unit_id`, `project_id`, `deal_id` etc.) pertencem ao mesmo tenant. Um
  usuário autorizado do tenant A que adivinhe/enumere um UUID de outro
  tenant (B) poderia, em tese, inserir uma linha com `tenant_id = A`
  referenciando uma entidade de B. Não vaza leitura (RLS de SELECT
  continua filtrando por `tenant_id` da própria linha) — é uma falha de
  integridade referencial, não de confidencialidade. Presente
  potencialmente em várias tabelas com FK, não só em Vistorias. Aceito
  por ora (severidade baixa/média, exige adivinhar UUID de outro
  tenant); revisar com o `rls-guardian` se vale a pena um trigger/CHECK
  validando `tenant_id` cruzado nas FKs mais sensíveis.

**Módulo 1 — Auth** (auditoria de 2026-07-20)
- **Enumeração de e-mail no signup**: a tela informa explicitamente
  "este e-mail já está cadastrado" quando o e-mail já existe
  (`src/features/auth/errors.ts`). Aceito porque o cadastro ainda não é
  público — revisar antes de abrir signup para fora da equipe.
- **Sem limite de criação de tenants**: a RPC `create_tenant_with_admin`
  não limita quantos tenants um mesmo usuário pode criar. Aceito pelo
  mesmo motivo (signup não é público ainda) — adicionar limite antes de
  abrir cadastro público.
- Baixo: `EXECUTE` de `set_updated_at()` sobrando para `anon`/`PUBLIC`
  no banco (não explorável na prática, função de trigger sem lógica de
  negócio).

**Módulo 5 — Financeiro** (auditoria de 2026-07-21)
- **Sem transação em `useCreateInstallment`/`useUpdateInstallment`/
  `useRegisterPayment`/`useCancelInstallment`**: cada uma faz 2 escritas
  sequenciais (a parcela + o log em `finance_events`) sem RPC
  transacional — diferente do padrão adotado em `update_deal_stage`
  (módulo 4), aqui aceito conscientemente porque uma falha no meio só
  afeta o log de auditoria (`finance_events` não alimenta nenhum
  total/KPI), não corrompe valor financeiro nem quebra regra de
  negócio. Pior caso prático: usuário tenta de novo após erro e duplica
  uma parcela (sem idempotência). Revisitar se aparecer na prática.
- Baixo: `valor_pago` em `useRegisterPayment` não é validado contra
  `valor_previsto` da parcela (lacuna de regra de negócio, não de
  autorização).
- Baixo: `useUpdateInstallment`/`useRegisterPayment`/`useCancelInstallment`
  filtram só por `id` da parcela, sem redundância por
  `finance_account_id` (não explorável via UI normal, RLS já isola por
  tenant).

**Módulo 9 — Manutenção** (auditoria de 2026-07-23)
- Baixo: `responsible_user_id` na mutation de atualização não é validado
  contra os usuários do tenant (não é FK pra `tenant_users`, só pra
  `auth.users`). A tela só oferece "Nenhum"/"Eu" como opções, mas uma
  chamada direta à API poderia setar qualquer UUID. Não expõe dado, só
  permite um "responsável" inconsistente (exibido como "Outro
  colaborador" na UI). Revisitar se/quando existir um diretório de
  usuários do tenant consultável pelo frontend (mesma lacuna já
  registrada nos módulos 1 e 8).
- Também transversal (não específico deste módulo): o badge de
  contagem da sidebar (`useNavigationBadges`) nunca foi implementado
  pra `crm`/`finance`/`inspections`/`units` em nenhum módulo anterior —
  ver seção "Débito técnico" acima, onde isso já está registrado.

**Módulo 11 — Portal do Cliente** (auditoria de 2026-07-27)
- Alto (dependência, não código do projeto): `react-router-dom@7.18.1`
  tem advisory ativo (GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass") no
  `npm audit`. Avaliado e aceito: a classe de exploração é específica do
  modo RSC/Framework do React Router — este projeto usa `<BrowserRouter>`
  (SPA client-side clássico), fora do vetor descrito. Não corrigido
  porque a correção automática (`npm audit fix --force`) força downgrade
  com breaking change. Acompanhar e atualizar quando sair uma versão
  corrigida sem regressão.
- Redirecionamento de papel `cliente`/`investidor` para fora de rotas
  não permitidas (`AppShell.tsx`) roda em `useEffect`, então há um
  instante de render antes do redirect ao acessar uma URL admin
  diretamente. Não é vazamento de dado (RLS já filtra o que qualquer
  hook devolve, independente da tela), só um flash visual de layout
  errado. Mesmo padrão de comportamento herdado do original.

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
- [x] Módulo 1 (auth + multitenancy) implementado, auditado e em produção
- [x] Módulo 2 (dashboard: shell/sidebar + página mínima) implementado e em produção
- [x] Módulo 3 (catálogo: terrenos, projetos, unidades + bloco de KPIs no dashboard) implementado, auditado e em produção
- [x] Módulo 4 (CRM: clientes, corretores, imobiliárias, kanban de negócios + bloco de funil no dashboard) implementado, auditado e em produção
- [x] Módulo 5 (Financeiro: contas a receber, dashboard financeiro, inadimplência + bloco de KPIs executivos no dashboard) implementado, auditado e em produção
- [x] Módulo 6 (Comissões: lista + detalhe com ajustes/pagamentos, criação automática ao vender fechando loop do CRM) implementado, auditado e em produção
- [x] Módulo 7 (Documentos: upload real via Storage, fechando loops de Unidade e Negócio) implementado, auditado e em produção
- [x] Módulo 8 (Vistorias: templates de checklist, execução com fotos e assinaturas, fechando loop da Unidade) implementado — https://vivlar.vercel.app
- [x] Módulo 9 (Manutenção pós-entrega: lista + detalhe, upload de fotos, fechando loop da Unidade) implementado, auditado e em produção — https://vivlar.vercel.app
- [x] Módulo 10 (Investidores: cadastro, vínculo a projetos, aportes, retornos, dashboard consolidado) implementado — https://vivlar.vercel.app
- [x] Módulo 11 (Portal do Cliente: minha unidade, financeiro + financiamento, manutenções com abertura/cancelamento de chamado) implementado, auditado e em produção — https://vivlar.vercel.app
- [x] Módulo 12 (Portal do Investidor: dashboard pessoal, meus projetos com resultado operacional, meus aportes, meus retornos) implementado, pendente de auditoria e deploy
- [ ] Auditoria de arquitetura geral rodada
