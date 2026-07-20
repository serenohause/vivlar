# Mapa de Domínio — projeto original (Base44)

> Levantado por engenharia reversa de `original-project/` (código-fonte
> React exportado do Base44) durante a etapa 1 do `/start-project`. Serve
> de insumo para o plano de schema (`schema-architect`) e para checar
> fidelidade das telas novas contra o comportamento original. Convenções
> de nomenclatura (inglês/português, singular/plural) serão normalizadas
> no schema Postgres — aqui os nomes são os do código-fonte original.

## 1. Entidades e campos

Convenção observada em quase todas as entidades do original: soft delete
(`is_deleted`, `deleted_at`, `deleted_by_user_id`), auditoria
(`created_by_user_id`, `updated_by_user_id`), timestamps automáticos do
Base44 (`created_date`, `updated_date`). Marcado abaixo como
**[soft-delete padrão]** em vez de repetir.

### Terrain — `src/pages/Terrains.jsx`, `TerrainDetail.jsx`
- `code`, `name`, `address`, `city`, `state` (string)
- `area_m2` (number)
- `status` (enum: `EM_PROSPECÇÃO`, `EM_NEGOCIAÇÃO`, `ADQUIRIDO`, `DESCARTADO`, `TRANSFORMADO_PROJETO`)
- `matrícula`, `proprietário_atual`, `observações_legais`, `forma_aquisição`, `notas` (string — nomes de campo com acento no original, normalizar no Postgres)
- `valor_aquisição`, `custos_itbi`, `custos_cartorio`, `custos_estudos`, `custos_corretagem`, `custos_outros` (number)
- `latitude`, `longitude` (geo — usado com Leaflet/polígono via `TerrainPolygonEditor.jsx`)
- `location_updated_at` (date), `location_updated_by_user_id` (FK → User)
- `projeto_origem_id` (FK → Project, setado quando `status = TRANSFORMADO_PROJETO`)
- [soft-delete padrão]

### Project — `src/pages/Projects.jsx`, `ProjectDetail.jsx`, `resultadoOperacional/*`
- `code`, `name`, `address`, `city`, `state`, `slug` (string)
- `total_units` (number)
- `status` (enum: `PLANEJAMENTO`, `EM_OBRAS`, `EM_VENDAS`, `100_VENDIDO`, `ENTREGUE`; legado `ENCERRADO` migrado via função `migrateProjectStatus`)
- `start_sales_at`, `closed_at`, `cycle_start_date`, `cycle_end_date` (date)
- `notes` (string)
- `is_public` (boolean — habilita o "espelho de vendas" público)
- Campos de marketing público: `description_public`, `caracteristicas` (array de strings), `implantacao_svg_url`, `mcmv_faixa`, `entrada_min`, `valor_min`, `valor_max`, `parcela_aprox`, `subsidio_aprox`, `reserva_horas` (default 24), `whatsapp_principal`, `broker_responsavel_id` (FK → Broker)
- Resultado operacional (manual): `total_construction_cost`, `total_indirect_costs` (number)
- [soft-delete padrão]

### Unit — `src/pages/Units.jsx`, `UnitDetail.jsx`, `src/components/unit/*`, `src/components/espelho/*`
- `sku` (string, código da unidade — também aparece como `unit_code` em alguns pontos, inconsistência de nome no original)
- `project_id` (FK → Project), `bloco` (string)
- `tipologia` (string: "Casa"/"Apartamento"/outros)
- `area_m2`, `area_lote_m2` (number)
- `quartos`, `vagas`, `suites`, `pavimentos` (number)
- `posicao_solar` (string)
- `list_price` (number)
- `status` (enum: `DISPONIVEL`, `RESERVADA`, `VENDIDA`, `BLOQUEADA`)
- `admin_status` (enum, pipeline MCMV: `LAUDO_ENGENHARIA` → `EM_CONFORMIDADE` → `CLIENTE_CONFORME` → `CONTRATO_CAIXA` → `CARTORIO` → `REGISTRO_PAGO` → `REGISTRADO` → `ENTREGA_CASA` → `ENTREGUE`, + `DISTRATO`)
- `active_deal_id` (FK → Deal, unidade só pode ter 1 negócio ativo por vez)
- `notes`, `observacoes_publica` (string)
- Simulação MCMV no site público: `entrada_minima`, `subsidio_simulado`, `parcela_simulada` (number, fallback para os equivalentes do Project)
- [soft-delete padrão]

### Client — `Clients.jsx`, `ClientDetail.jsx`, `clientService.jsx`, `LeadForm.jsx`
- `name`, `cpf`, `phone`, `email`, `address`, `notes` (string)
- `user_id` (FK → User, nullable — vínculo criado quando um Deal vira VENDIDO ou via convite manual em Settings)
- [soft-delete padrão]

### Broker — `Brokers.jsx`, `CreateBrokerInline.jsx`
- `name`, `cpf`, `phone`, `email` (string)
- `type` (enum: `AUTONOMO`, `IMOBILIARIA`)
- `real_estate_agency_id` (FK → RealEstateAgency, quando type=IMOBILIARIA)
- `commission_rate` (number, default 0.05), `commission_split` (number, default 70 — % que o corretor fica quando vinculado a imobiliária)
- `is_active` (boolean)
- [soft-delete padrão]

### RealEstateAgency — `RealEstateAgencies.jsx`
- `name`, `cnpj`, `email`, `phone`, `address`, `contact_person` (string)
- `commission_percentage` (number, default 30)
- `status` (enum: `ATIVA`, provavelmente `INATIVA`)
- [soft-delete padrão]

### Deal — `CRM.jsx`, `DealDetail.jsx`, `dealService.jsx`, `LeadForm.jsx`
- `project_id`, `unit_id`, `client_id`, `broker_id` (FK)
- `sales_stage` (enum: `LEAD`, `QUALIFICADO`, `RESERVADO`, `PROPOSTA`, `VENDIDO`, `DISTRATADO`; `PERDIDO` também rotulado mas controlado via `opportunity_status`)
- `opportunity_status` (enum: `EM_NEGOCIACAO`, `GANHA`, `PERDIDA` — dimensão paralela ao `sales_stage`, redundância a resolver no schema novo)
- `expected_sale_value`, `final_sale_value`, `commission_rate`, `commission_value` (number)
- `reserved_until` (date — expiração de reserva, usado por `dailyExpireReservations`)
- `sold_at`, `last_activity_date` (date)
- `lost_reason` (string), `distrato_at` (date), `distrato_reason` (string), `distrato_by_user_id` (FK → User)
- `is_active` (boolean — separado de `is_deleted`; indica se é o "negócio corrente" do funil)
- [soft-delete padrão]

### DealBroker — só `.filter()` em `src` (provável seed/backend)
- `deal_id`, `broker_id` (FK) + [soft-delete padrão]. Modela múltiplos corretores por negócio (co-corretagem).

### Activity — `CRM.jsx`, `DealDetail.jsx`, `unitStatusHelpers.jsx`
- **Inconsistência real no original**: 3 pontos de criação usam campos diferentes (kanban: `deal_id`,`client_id`,`activity_type`,`description`,`next_action_date`,`priority`,`completed`,`completed_at`; aba de atividades: `deal_id`,`type`,`title`,`due_date`,`description`,`status`; log automático: `unit_id`,`deal_id`,`type`,`title`,`description`,`created_by_user_id`).
- Decisão de schema: unificar em `title`, `type`, `description`, `due_date`, `priority`, `status`, `deal_id`, `client_id`, `unit_id`.

### StatusTransition — `UnitDetail.jsx`, `DealDetail.jsx`, backend
- `unit_id` (FK), `deal_id` (FK, opcional)
- `from_status`, `to_status` (string — usado tanto para `admin_status` de Unit quanto `sales_stage`)
- `transition_type` (enum: `ADMIN`, `COMERCIAL`)
- `note` (string)

### UnitCheck — `UnitDetail.jsx` (checklist interno)
- `unit_id` (FK), `check_code` (string, ex.: `CONF_CORRESPONDENTE_OK`)
- `required_for_status` (string, admin_status alvo)
- `status` (enum: `PENDENTE`, `CONCLUIDO`)
- `completed_at` (date)

### UnitStatus — só `.list()` em `src`; parece tabela de referência/lookup estática, não transacional.

### Commission — `Commissions.jsx`, `CommissionDetail.jsx`, `CRM.jsx`
- `broker_id`, `deal_id`, `unit_id`, `project_id` (FK)
- `base_value`, `gross_value`, `rate` (number)
- `saldo`, `total_pago` (number, calculados/mantidos via update)
- `status` (enum: `A_PAGAR`, `AGENDADO`, `PAGO`, `CANCELADO`)
- `due_date`, `finalized_at` (date)
- `is_finalizada` (boolean), `notes` (string)
- [soft-delete padrão]

### CommissionAdjustment — `CommissionDetail.jsx`
- `commission_id` (FK), `type` (enum: `DESCONTO`, `ACRESCIMO`, `BONUS`), `amount` (number), `reason` (string)
- `attachment_url`, `attachment_name`, `attachment_uploaded_at`, `attachment_uploaded_by_user_id`
- `created_by_user_id` (FK → User)

### CommissionPayment — `CommissionDetail.jsx`
- `commission_id` (FK), `valor_pago` (number), `data_pagamento` (date)
- `payment_method` (enum, ex.: `PIX`), `payment_reference`, `comprovante_url`, `observacoes` (string)
- `created_by_user_id` (FK → User)

### Contract — `Contracts.jsx`, `DealDetail.jsx`, `Units.jsx`
- `project_id`, `unit_id` (FK)
- `type` (enum: `COMPRA_VENDA`, `CAIXA`, `CORRETAGEM`, `PARCERIA`, `OUTRO`)
- `status` (enum: `EM_ELABORACAO`, `ASSINADO`, `REGISTRADO`)
- `signed_at` (date), `file_url` (string), `notes` (string)
- [soft-delete padrão]

### Document — `Documents.jsx`, `UnitDetail.jsx`, `DealDetail.jsx`
- `project_id`, `unit_id`, `deal_id` (FK, opcionais conforme contexto)
- `doc_type` (enum extenso — ver `DOC_TYPES` em `Constants.jsx`: `LAUDO_ENG`, `FORM_CAIXA_ASSINADO`, `CONTRATO_CAIXA_ASSINADO`, `ITBI`, `CERTIDAO_NEGATIVA`, `VALIDACAO_ASSINATURA_GOV`, `COMPROV_REGISTRO_PAGO`, `MATRICULA_AVERBADA`, `CONTRATO_CAIXA_SELO_CARTORIO`, `TERMO_VISTORIA`, `TERMO_ENTREGA`, `TERMO_DISTRATO`, `MATRICULA_IMOVEL`, `RG_CPF_CLIENTE`, `COMPROVANTE_RENDA`, `COMPROVANTE_RESIDENCIA`, `CERTIDAO_CASAMENTO`, `EXTRATO_FGTS`, `DECLARACAO_IR`, `ESCRITURA`, `AVERBACAO`, `HABITE_SE`, `OUTROS`)
- `title`, `notes` (string)
- `issued_at`, `received_at` (date)
- `status` (enum: `RECEBIDO`, `APROVADO`, `REJEITADO`)
- `file_url`, `file_name` (string, upload)
- Aprovação de documento pode disparar automação (ver `UnitDetail.jsx:231`)
- [soft-delete padrão]

### DocRequirement — `Settings.jsx` (config. de documentos obrigatórios por status)
- `admin_status` (enum, igual ao de Unit), `doc_type` (enum, igual ao de Document)
- CRUD parcial no original (create não usado por nenhuma UI, delete sim)

### FinanceAccount — `FinanceDetail.jsx`, `checkUnitAlerts` — **módulo financeiro canônico**
- `unit_id`, `client_id`, `deal_id`, `contract_id`, `project_id` (FK)
- `valor_venda_total` (number)
- `status` (enum: `ATIVA`)
- [soft-delete padrão]

### PaymentInstallment — `FinanceDetail.jsx`, `financeService.jsx`, `Finance.jsx`, `useProjectStats.jsx`
- `finance_account_id`, `unit_id`, `client_id` (FK)
- `tipo` (enum: `SINAL`, `ENTRADA`, `PARCELA`, `REFORCO`, `INTERMEDIARIA`, `VALOR_FINANCIADO`, `SUBSIDIO`, `OUTROS`)
- `descricao`, `numero_parcela`, `observacoes` (string)
- `vencimento` (date), `valor_previsto`, `valor_pago` (number)
- `status` (enum: `PREVISTO`, `PARCIAL`, `PAGO`, `EM_ATRASO`, `CANCELADO` — cron diário recalcula)
- `data_pagamento` (date), `comprovante_url`, `metodo_pagamento` (string)
- [soft-delete padrão]

### FinanceEvent — timeline de auditoria financeira (`FinanceDetail.jsx`)
- `finance_account_id`, `installment_id` (FK)
- `tipo_evento` (enum: `CRIACAO_PARCELA`, `EDICAO_PARCELA`, `CANCELAMENTO_PARCELA`, `BAIXA_PAGAMENTO`, `STATUS_FINANCIAMENTO`)
- `descricao` (string), `created_by_user_id` (FK → User)

### ~~VendaFinanceira~~ / ~~ParcelasEntrada~~ — modelo financeiro paralelo/legado (`FinanceTab.jsx`, não `FinanceTabNew.jsx`)
- **Não portado** — redundante com `FinanceAccount`/`PaymentInstallment`, que já é o módulo em uso ativo (`FinanceTabNew.jsx`). Ver decisão em `docs/ARCHITECTURE.md`.

### FinancingProcess — só leitura em `src` (`ClientFinance.jsx`, `FinanceDetail.jsx`) — processo de financiamento bancário associado a `finance_account_id`.

### CobrancaHistorico — `InadimplenciaManager.jsx`, função `dailyEscalonamentoCobranca`
- `installment_id` (FK)
- `acao` (enum: `LEMBRETE_AMIGAVEL`, `PRIMEIRA_COBRANCA`, `SEGUNDA_COBRANCA`, `COBRANCA_FORMAL`)
- `canal` (string: `EMAIL`, `WHATSAPP`, `MANUAL`, `sistema`)
- `data_execucao` (date), `status` (enum: `AGUARDANDO`, `ENVIADO`), `observacoes` (string)
- [soft-delete padrão]

### Investor — `Investors.jsx`
- `nome`, `documento` (CPF/CNPJ), `email`, `telefone` (string)
- `tipo` (enum: `PF`, `PJ`)
- `status` (enum: `ATIVO`, provavelmente `INATIVO`)
- `observacoes` (string)
- [soft-delete padrão]
- **Bug real do original**: nas telas do "portal do investidor" o filtro usado é `investor_id === currentUser.id` (compara com `User.id`); nas telas administrativas, `investor_id` referencia `Investor.id`. Decisão: `investors` ganha `user_id` (como `clients.user_id`); toda FK `investor_id` passa a apontar sempre para `investors.id`.

### ProjectInvestor — vínculo investidor↔projeto (`InvestorProjects.jsx`, `InvestorProjectDetail.jsx`)
- `project_id`, `investor_id` (FK)
- [soft-delete padrão]

### InvestmentContribution (aporte) — `InvestmentContributions.jsx`
- `project_id`, `investor_id` (FK, opcional — sem investidor = capital próprio)
- `valor` (number), `data` (date)
- `tipo` (enum: `APORTE`, `REFORCO`, `AJUSTE`)
- `status` (enum: `PREVISTO`, `CONFIRMADO`)
- `observacoes`, `comprovante_url`, `comprovante_nome` (string)
- [soft-delete padrão]

### InvestmentReturn (retorno/dividendo) — `InvestmentReturns.jsx`, `ReviewLegacyReturns.jsx`, função `migrateInvestmentReturns`
- `project_id`, `investor_id` (FK, opcional)
- `valor` (number), `data` (date)
- `return_type` (enum: `PRINCIPAL`, `DIVIDENDO_INVESTIDOR`, `DIVIDENDO_VIVLAR`)
- `status` (enum: `PREVISTO`, provavelmente `PAGO`/`CONFIRMADO`)
- `observacoes` (string)
- [soft-delete padrão]

### Inspection (vistoria) — `CreateInspection.jsx`, `InspectionDetail.jsx`
- `project_id`, `unit_id`, `client_id`, `template_id` (FK), `inspector_user_id` (FK → User)
- `inspection_date` (date)
- `status` (enum: `Rascunho`, `Aprovado`, `Concluído`, outros)
- `totals_conform`, `totals_nonconform`, `totals_notapplicable`, `totals_pending` (number)
- `score_conformity_percent` (number)
- `notes_general` (string)
- [soft-delete padrão]

### InspectionTemplate — `Templates.jsx`
- `name`, `description` (string), `is_active` (boolean)
- `created_by_user_id`, `updated_by_user_id`

### InspectionTemplateItem — `TemplateDetail.jsx`, `Templates.jsx`
- `template_id` (FK)
- `category`, `title`, `instructions` (string)
- `severity_default` (enum: `Baixa`, `Média`, `Crítica`)
- `requires_photo` (boolean)
- `order_index` (number)
- [soft-delete padrão]

### InspectionItemResult — `CreateInspection.jsx`, `InspectionDetail.jsx`
- `inspection_id`, `template_item_id` (FK)
- `result` (enum: `Pendente`, `Conforme`, `Não Conforme`, provavelmente `N/A`)
- `severity` (herdado do item de template)
- `comment` (string)
- `requires_fix` (boolean)
- `updated_by_user_id` (FK → User)
- [soft-delete padrão]

### InspectionMedia — `InspectionDetail.jsx`
- `inspection_id`, `item_result_id` (FK)
- `file_url`, `file_name`, `caption` (string)
- `taken_at` (date), `created_by_user_id` (FK → User)

### InspectionSignature — `InspectionDetail.jsx`
- `inspection_id` (FK)
- `signer_type` (string), `signer_name`, `signer_document` (string)
- `signature_file_url` (string)
- `signed_at` (date), `confirmation_checkbox` (boolean)

### MaintenanceRequest — `AdminMaintenance.jsx`, `ClientMaintenance.jsx`, `MaintenanceDetail.jsx`
- `unit_id`, `project_id`, `client_id` (FK)
- `title`, `description` (string)
- `category` (default `"Outros"`), `priority` (enum: `Baixa`, `Média`, `Alta`)
- `status` (enum: `ABERTO`, `AGENDADO`, `EM_ANDAMENTO`, `AGUARDANDO_CLIENTE`, `RESOLVIDO`, `CANCELADO`)
- `suggested_date`, `scheduled_date`, `resolved_at`, `opened_at` (date)
- `responsible_user_id`, `created_by_user_id` (FK → User)
- `operator_notes` (string), `photos` (array de URLs)
- [soft-delete padrão]

### ConstructionPhoto — só leitura em `ClientPortal.jsx` (`project_id`); nenhuma tela cria fotos. Campos prováveis (não confirmados): `photo_url`, `caption`, `taken_at`.

### Notification — `notificationService.jsx`, várias páginas, funções backend
- `title`, `message` (string)
- `type` (enum: `FINANCEIRO`, `COMISSAO`, `CRM`, `VENDA`, `DOCUMENTOS`, `SISTEMA`, `UNIDADE`, `INVESTIMENTO`, `INADIMPLENCIA`)
- `severity` (enum: `INFO`, `ALERTA`, `CRITICO`)
- `audience` (enum: `INTERNAL_ONLY`, `ADMIN_ONLY`)
- `target_role` (string, ex.: `ADMINISTRADOR`)
- `event_key` (string — idempotência dos crons)
- `entity_type`, `entity_id` (referência polimórfica)
- `link_route` (string), `meta` (JSON)
- `status` (enum: `NOVA`, provavelmente `LIDA`)
- Variante do portal do cliente: `user_id`, `related_id` — unificar num schema só.

### TeamsChannelConfig — `TeamsNotificationConfig.jsx`, funções `notifyTeams*`
- `team_id`, `team_name`, `channel_id`, `channel_name` (string)
- `notification_types` (array de enum, mesmo domínio de `Notification.type` + `VISTORIA`)
- `is_active` (boolean)

### WhatsAppSession — `WhatsAppSessions.jsx` (só leitura em `src`)
- `phone`, `flow_type`, `state`, `status` (string/enum)
- `last_message_at` (date)

### ClientMessage — só `.filter()` em `ClientPortal.jsx`; nenhum `.create()` em `src` — feature incompleta no original.

### SupportTicket — `Settings.jsx` (exclusão de conta)
- `user_id`, `user_email`, `user_name` (string)
- `type` (enum: `ACCOUNT_DELETION`, ...), `subject`, `description` (string)
- `priority` (enum: `HIGH`, ...)

### User (entidade de plataforma Base44, estendida)
- `id`, `email`, `full_name`, `role` (enum Base44: `admin`, `user`)
- `app_profile` (enum de negócio: `ADMINISTRADOR`, `USUARIO`, `CLIENTE`, `INVESTIDOR`)
- `client_id` (FK → Client, quando `app_profile = CLIENTE`)
- `apple_user_id`, `is_active`

### PublicLead (schema oficial em `base44/entities/PublicLead.jsonc`)
- `nome`, `telefone` (obrigatórios), `email`, `cpf` (string)
- `intent` (enum: `RESERVA`, `INTERESSE`, `LISTA_ESPERA`; default `INTERESSE`)
- `unit_id`, `project_id` (FK)
- `status` (enum: `NOVO`, `CONTATADO`, `QUALIFICADO`, `CONVERTIDO`, `DESCARTADO`, `EXPIRADO`)
- `reserva_expira_em` (date)
- `converted_to_deal_id`, `converted_to_client_id` (FK)
- `utm_source`, `utm_medium`, `utm_campaign`, `origem` (default `espelho_vendas`), `ip_address`, `user_agent`, `mensagem` (string)
- `contatado_em` (date), `contatado_por_user_id` (FK → User), `notas_internas` (string)
- [soft-delete padrão]
- Único exemplo de RLS explícito no original: create público (sem auth), read/update/delete só `app_profile = ADMINISTRADOR` — referência útil para a policy Supabase equivalente.

### Órfãos só em `base44/functions/` (não usados por nenhuma página em `src`) — não portados na fundação inicial:
- **Feasibility / FeasibilityCostItem / FeasibilityExport**: modelo rico de viabilidade econômica, substituído na prática pelos campos simplificados em `Project`. Ver decisão em `docs/ARCHITECTURE.md`.
- **ClientAccessToken / ClientSession**: fluxo de magic link do portal do cliente, desconectado do frontend. Ver decisão em `docs/ARCHITECTURE.md`.

## 2. Papéis de usuário e autorização (no original)

- Autenticação 100% Base44 (`AuthContext.jsx` + `ProtectedRoute.jsx`) — sem Supabase Auth, será reconstruída do zero.
- Duas dimensões de papel coexistindo: `role` nativo (`admin`/`user`, usado no backend) e `app_profile` de negócio (`ADMINISTRADOR`, `USUARIO`, `CLIENTE`, `INVESTIDOR`, usado no frontend/navegação). `USER_ROLES` (`admin`, `COMERCIAL`, `ADMINISTRATIVO`) é um terceiro enum praticamente morto (só citado em `UNIT_CHECKS.allowed_roles`, nunca reforçado).
- Cliente: vínculo via `Client.user_id` ↔ `User.id`, criado automaticamente quando um Deal vira `VENDIDO`.
- Investidor: sem fluxo de convite na UI — setado manualmente/backend; ver bug de `investor_id` acima.
- **Autorização é majoritariamente client-side no original** — `Layout.jsx` só filtra navegação e redireciona por UX; não há RLS/policy real além de `PublicLead`. No Supabase, toda a autorização real precisa ser criada do zero via RLS (não assumir nada como "já protegido").
- Apple Sign In cria usuário com `role: admin` e `app_profile: ADMINISTRADOR` por padrão no original — revisar essa política ao portar.

## 3. Fluxos principais (ponta a ponta)

1. **Captação pública → reserva/lead → negócio**: site público (`EspelhoVendas.jsx`, por `Project.slug`, exige `is_public=true`) → `LeadForm.jsx` cria `PublicLead`; se `intent=RESERVA`, cria/reaproveita `Client` (por CPF), cria `Deal` (`RESERVADO`), atualiza `Unit.status=RESERVADA`+`active_deal_id`, grava `StatusTransition`, dispara `Notification`. Reservas expiram via cron `dailyExpireReservations`.
2. **Funil comercial (CRM)**: kanban por `sales_stage` até `VENDIDO` → cria `Commission` para o `Broker`, `Unit.status=VENDIDA`, cria `User` (`app_profile=CLIENTE`) vinculado ao `Client`.
3. **Pipeline administrativo MCMV**: avança `admin_status` condicionado a `Document`s aprovados e `UnitCheck`s concluídos; cada avanço grava `StatusTransition` e pode notificar Teams. `DISTRATO` reseta o fluxo quando surge novo `Deal` ativo.
4. **Desenvolvimento imobiliário**: `Terrain` (prospecção→aquisição) vira `Project`; `Project` recebe `Unit`s; viabilidade simplificada direto em `Project`.
5. **Financeiro/cobrança**: `FinanceAccount`+`PaymentInstallment` por unidade/cliente; crons diários marcam parcelas vencidas e escalam régua de cobrança (`CobrancaHistorico`).
6. **Vistoria e manutenção pós-entrega**: `InspectionTemplate`+`InspectionTemplateItem` reutilizáveis → `Inspection`+`InspectionItemResult` por unidade, com fotos (`InspectionMedia`) e assinaturas (`InspectionSignature`). Depois da entrega, cliente abre `MaintenanceRequest` pelo portal.
7. **Investidores**: aporte em `Project` (`InvestmentContribution`), retorno via `InvestmentReturn` (`PRINCIPAL`/`DIVIDENDO_INVESTIDOR`/`DIVIDENDO_VIVLAR`), vínculo por `ProjectInvestor`.
8. **Comissão de corretores**: gerada ao vender (`Commission`), ajustável (`CommissionAdjustment`), paga parcial/total (`CommissionPayment`); corretores autônomos ou de `RealEstateAgency` (split).

## 4. Funções de backend do original (`base44/functions/`)

| Função | O que faz |
|---|---|
| `appleSignIn` | Login/registro via Sign in with Apple; cria `User` com `role=admin`/`app_profile=ADMINISTRADOR` se novo. |
| `checkUnitAlerts` | Alertas ad-hoc de 1 unidade (docs faltando, tempo na etapa, vistoria pendente, parcelas atrasadas). |
| `dailyEscalonamentoCobranca` | Cron: cria `CobrancaHistorico` escalonado para parcelas `EM_ATRASO`. |
| `dailyExpireReservations` | Cron: expira `Deal`s `RESERVADO` vencidos, libera `Unit`. |
| `dailyOverdueInstallments` | Cron: marca parcelas vencidas `EM_ATRASO`, notifica (idempotente via `event_key`). |
| `dailyUnitAlertsCheck` | Cron: roda `checkUnitAlerts` para todas unidades `VENDIDA`. |
| `exportFeasibilityExcel` / `exportFeasibilityPDF` | Exportam viabilidade econômica (modelo órfão `Feasibility`). |
| `generateClientMagicLink` / `getClientSession` / `validateClientToken` | Fluxo de magic link do portal do cliente — órfão no frontend. |
| `inadimplenciaAutomation` | Régua de cobrança completa multi-canal, restrito a admin. |
| `migrateInvestmentReturns` / `migrateProjectStatus` | Jobs one-off de migração de dados legados. |
| `notifyTeamsInadimplencia` / `notifyTeamsOnDocApproval` / `notifyTeamsOnNotification` / `notifyTeamsParcelaPaga` / `notifyTeamsRegistroPago` | Webhooks: postam no Microsoft Teams em eventos de negócio. |
| `sendTeamsPipelineUpdate` | Endpoint manual: resumo do funil de vendas no Teams. |
| `uploadDocumentToOneDrive` | Upload de arquivo para OneDrive via Microsoft Graph API. |

Quase todas usam `base44.asServiceRole` (bypass de RLS) + checagem manual de `role` — no Supabase isso vira RLS/policy real, e as integrações externas (Teams, OneDrive) viram Edge Functions implementadas feature a feature.

## 5. Multi-tenant

Confirmado: **o original é 100% single-tenant**, sem nenhum conceito de tenant/organização/empresa em nenhuma camada (nem entidades, nem RLS, nem rotas — nome "Vivlar" hardcoded em textos/URLs). `tenant_id` é introduzido do zero em todas as tabelas de domínio no schema novo.
