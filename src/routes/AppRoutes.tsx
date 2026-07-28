import { Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { BrokerDetailPage } from '@/features/brokers/pages/BrokerDetailPage';
import { BrokerFormPage } from '@/features/brokers/pages/BrokerFormPage';
import { BrokersListPage } from '@/features/brokers/pages/BrokersListPage';
import { ClientFinancePage } from '@/features/client-portal/pages/ClientFinancePage';
import { ClientMaintenancePage } from '@/features/client-portal/pages/ClientMaintenancePage';
import { ClientUnitPage } from '@/features/client-portal/pages/ClientUnitPage';
import { ClientDetailPage } from '@/features/clients/pages/ClientDetailPage';
import { ClientFormPage } from '@/features/clients/pages/ClientFormPage';
import { ClientsListPage } from '@/features/clients/pages/ClientsListPage';
import { CommissionDetailPage } from '@/features/commissions/pages/CommissionDetailPage';
import { CommissionsListPage } from '@/features/commissions/pages/CommissionsListPage';
import { getAllNavPageNames } from '@/features/dashboard/navigation';
import { Dashboard } from '@/features/dashboard/pages/Dashboard';
import { CRMPage } from '@/features/deals/pages/CRMPage';
import { DealDetailPage } from '@/features/deals/pages/DealDetailPage';
import { DocumentsListPage } from '@/features/documents/pages/DocumentsListPage';
import { EspelhoVendasPage } from '@/features/espelho-vendas/pages/EspelhoVendasPage';
import { FinanceAccountDetailPage } from '@/features/finance/pages/FinanceAccountDetailPage';
import { FinanceDashboardPage } from '@/features/finance/pages/FinanceDashboardPage';
import { FinanceListPage } from '@/features/finance/pages/FinanceListPage';
import { InadimplenciaManagerPage } from '@/features/finance/pages/InadimplenciaManagerPage';
import { InvestorContributionsPage } from '@/features/investor-portal/pages/InvestorContributionsPage';
import { InvestorProjectDetailPage } from '@/features/investor-portal/pages/InvestorProjectDetailPage';
import { InvestorProjectsPage } from '@/features/investor-portal/pages/InvestorProjectsPage';
import { InvestorReturnsPage } from '@/features/investor-portal/pages/InvestorReturnsPage';
import { TemplateDetailPage } from '@/features/inspection-templates/pages/TemplateDetailPage';
import { TemplatesListPage } from '@/features/inspection-templates/pages/TemplatesListPage';
import { CreateInspectionPage } from '@/features/inspections/pages/CreateInspectionPage';
import { InspectionDetailPage } from '@/features/inspections/pages/InspectionDetailPage';
import { InspectionsListPage } from '@/features/inspections/pages/InspectionsListPage';
import { InvestmentContributionsListPage } from '@/features/investors/pages/InvestmentContributionsListPage';
import { InvestmentReturnsListPage } from '@/features/investors/pages/InvestmentReturnsListPage';
import { InvestorDashboardPage } from '@/features/investors/pages/InvestorDashboardPage';
import { InvestorDetailPage } from '@/features/investors/pages/InvestorDetailPage';
import { InvestorsListPage } from '@/features/investors/pages/InvestorsListPage';
import { MaintenanceDetailPage } from '@/features/maintenance/pages/MaintenanceDetailPage';
import { MaintenanceListPage } from '@/features/maintenance/pages/MaintenanceListPage';
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { ProjectFormPage } from '@/features/projects/pages/ProjectFormPage';
import { ProjectsListPage } from '@/features/projects/pages/ProjectsListPage';
import { RealEstateAgencyDetailPage } from '@/features/real-estate-agencies/pages/RealEstateAgencyDetailPage';
import { RealEstateAgencyFormPage } from '@/features/real-estate-agencies/pages/RealEstateAgencyFormPage';
import { RealEstateAgenciesListPage } from '@/features/real-estate-agencies/pages/RealEstateAgenciesListPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { TerrainDetailPage } from '@/features/terrains/pages/TerrainDetailPage';
import { TerrainFormPage } from '@/features/terrains/pages/TerrainFormPage';
import { TerrainsListPage } from '@/features/terrains/pages/TerrainsListPage';
import { UnitDetailPage } from '@/features/units/pages/UnitDetailPage';
import { UnitFormPage } from '@/features/units/pages/UnitFormPage';
import { UnitsComparisonPage } from '@/features/units/pages/UnitsComparisonPage';
import { UnitsListPage } from '@/features/units/pages/UnitsListPage';
import { pageUrl } from '@/lib/page-url';
import { AppShell } from '@/routes/AppShell';
import { ComingSoonPage } from '@/routes/ComingSoonPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

// Toda página referenciada pela navegação (qualquer perfil) que ainda não
// tem tela real vira uma rota "em construção" — gerada a partir da mesma
// lista usada para montar a sidebar, sem repetir 30 <Route> à mão. Ver
// convenção de URL em `src/lib/page-url.ts`.
//
// Páginas com tela real própria (fora do padrão "em construção" genérico)
// saem desta lista e ganham `<Route>` explícita abaixo — começou por
// "Terrains" (Terrenos), depois "Projects" (Projetos) e "Units" (Unidades),
// fechando o módulo de catálogo, depois "Clients" (Clientes), "Brokers"
// (Corretores) e "RealEstateAgencies" (Imobiliárias), depois "CRM" (Kanban
// do funil de vendas + detalhe do negócio), fechando o módulo CRM/Vendas, e
// agora "Finance" (Contas a Receber: lista + detalhe da carteira financeira
// de uma unidade/cliente) — todas seguem a mesma convenção de sub-rota:
// detalhe em "/<slug>/:id", criação em "/<slug>/novo" (edição não tem rota
// própria — é um dialog, fiel ao original quando ele existe;
// "Brokers"/"RealEstateAgencies" não tinham detalhe no original, só lista +
// dialog — ganharam um aqui para manter a mesma convenção de navegação do
// resto do app). "CRM" e "Finance" fogem um pouco do padrão: nenhum dos dois
// tem "/crm/novo"/"/finance/novo" — criar negócio é um dialog dentro do
// próprio Kanban (fiel ao original), e uma carteira financeira nasce a
// partir de uma unidade vendida, não de uma tela de criação isolada (ver
// `CreateFinanceAccountDialog`, acionado a partir de `UnitDetailPage`) — só
// "/finance" (lista) e "/finance/:id" (detalhe da carteira). Fechando o
// módulo Financeiro: "FinanceDashboard" (análises/tendências — sem sub-rota,
// sem link na sidebar no original também, só um botão "Financeiro
// Detalhado" a partir do Dashboard Executivo, ver `features/dashboard/pages/Dashboard.tsx`)
// e "InadimplenciaManager" (já tinha item na sidebar, ver
// `features/dashboard/navigation.ts`, mas caía em "em construção" até agora),
// e agora "Commissions" (Comissões: lista + detalhe de pagamento de
// comissão a corretor). Mesma convenção de sub-rota do resto do app
// ("/commissions/:id" para detalhe), sem "/commissions/novo": a `Commission`
// nasce automaticamente dentro da RPC `update_deal_stage` quando um negócio
// vira "vendido" (ver `supabase/migrations/0028_update_deal_stage_commission.sql`)
// — não existe `Commission.create(...)` em lugar nenhum do original
// (`src/pages/Commissions.jsx`/`CommissionDetail.jsx`), só edição
// (ajuste/pagamento/agendamento/cancelamento/finalização) da comissão já
// existente. Depois "Documents" (Documentos: gestão documental MCMV, com
// upload real via Supabase Storage) — só "/documents" (lista), sem
// sub-rota de detalhe (o original só tem lista + dialog de criar/editar,
// mesma convenção de "Brokers" antes de ganhar detalhe — aqui optamos por
// não criar um detalhe que o original também não tem). E agora "Templates"
// (Templates de Checklist de Vistoria: lista + detalhe com abas
// Itens/Configurações) — mesma convenção "/templates" (lista) +
// "/templates/:id" (detalhe) do resto do app, sem "/templates/novo": criar
// template é um dialog dentro da própria lista (fiel ao
// `showCreateModal` de `Templates.jsx`), mesma escolha já feita para
// "CRM"/"Finance" acima. E agora a execução de vistorias em si:
// "Inspections" (lista, "/inspections") e "InspectionDetail" (checklist
// completo, fotos e assinaturas, "/inspections/:id") seguem a mesma
// convenção `/<slug>` + `/<slug>/:id` do resto do app. E agora "AdminMaintenance"
// (Manutenção pós-entrega: lista com KPIs/filtros/dialog de criação,
// "/admin-maintenance") + detalhe do chamado ("/admin-maintenance/:id") —
// mesma convenção `/<slug>` + `/<slug>/:id`, nome de página herdado 1:1 do
// original (`AdminMaintenance.jsx`, já usado pelo item "Manutenções" da
// sidebar em `features/dashboard/navigation.ts`) em vez de um "Maintenance"
// mais curto, para não divergir da URL que o restante do app (breadcrumbs,
// nav) já espera. "CreateInspection"
// foge dessa convenção de propósito: diferente de "Terrains"/"Projects"/
// etc (onde a criação é sempre "/<slug>/novo", um sub-recurso da própria
// entidade), `CreateInspection` já era uma PÁGINA PRÓPRIA no original
// (`src/pages/CreateInspection.jsx`, um wizard de 3 passos, com link direto
// a partir de `UnitDetail.jsx` incluindo query string —
// `CreateInspection?unit=<id>`) — é o único "Create*" que existe como
// página de verdade no `original-project` inteiro (todo outro fluxo de
// criação do app é um dialog). Por isso usa `pageUrl('CreateInspection')`
// (tradução mecânica 1:1 do nome da página original, `/create-inspection`,
// mesma convenção documentada em `src/lib/page-url.ts`) em vez de
// "/inspections/novo" — e não "/inspections/novo" — preservando também a
// query string `?unit=<id>` que `UnitDetailPage` usa para pré-selecionar a
// unidade no passo 1 do wizard. Fechando o módulo 10 (Investidores):
// "InvestorDashboard" (resultado operacional x investimentos, sem sub-rota),
// "Investors" (lista, "/investors") + "InvestorDetail" ("/investors/:id" —
// só "InvestorDetail" não tinha item de nav próprio, é navegação a partir da
// lista, mesma convenção de detalhe do resto do app; sem "/investors/novo":
// criar investidor é um dialog dentro da própria lista, fiel ao original,
// mesma escolha já feita para "CRM"/"Finance"/"Templates" acima),
// "InvestmentContributions" (lista, "/investment-contributions") e
// "InvestmentReturns" (lista, "/investment-returns") — ambas também só
// dialog de criação, sem sub-rota de detalhe própria (o original não tinha
// `InvestmentContributionDetail`/`InvestmentReturnDetail` como páginas de
// fato conectadas, só links quebrados — a lista já cobre visualização/edição
// via dialog inline, mesmo padrão de "Commissions"). Fechando o módulo 11
// (Portal do Cliente): "ClientUnit" (Minha Unidade, sem sub-rota — igual ao
// original, `ClientUnit.jsx` nunca teve `ClientUnitDetail`), "ClientFinance"
// (Financeiro, sem sub-rota — mesmo critério) e "ClientMaintenance"
// (Manutenções, sem sub-rota própria: diferente de "AdminMaintenance", NÃO
// ganha "/client-maintenance/:id" nesta rodada — ver comentário completo em
// `ClientMaintenancePage.tsx`, o cliente reaproveitaria a MESMA
// `MaintenanceDetailPage`/`/admin-maintenance/:id` do lado admin, que já
// esconde os controles internos por `tenantRole`, mas foi decidido não
// linkar por enquanto para não confundir a navegação — "Voltar" daquela
// tela aponta para uma rota fora de `CLIENT_ALLOWED_PAGES`). As 3 páginas
// deste módulo, ao contrário de todo o resto do app, não seguem
// `admin`/`comercial`/`administrativo` como público — são as ÚNICAS 3
// páginas liberadas para `tenant_role = 'cliente'` (ver
// `CLIENT_ALLOWED_PAGES`, `features/dashboard/navigation.ts`, e o redirect
// em `AppShell.tsx`). Fechando o módulo 12 (Portal do Investidor): diferente
// do Portal do Cliente, aqui não existem páginas novas no original — as
// mesmas 4 telas (`InvestorProjects`/`InvestorProjectDetail`/
// `InvestorContributions`/`InvestorReturns`) já existiam como conceito desde
// o módulo 10, só sem rota própria (caíam em "em construção"). "InvestorProjects"
// (lista, "/investor-projects") + "InvestorProjectDetail"
// ("/investor-projects/:id" — path param, não a query string `?projectId=`
// do original, mesma convenção `/<slug>/:id` do resto do app, ver
// `InvestorProjectDetailPage.tsx`), "InvestorContributions" (lista,
// "/investor-contributions" — kebab-case mecânico de "InvestorContributions",
// não confundir com "/investment-contributions" do módulo 10, admin) e
// "InvestorReturns" (idem, "/investor-returns" vs. "/investment-returns" do
// módulo 10) — nenhuma das duas com sub-rota, só leitura. "InvestorDashboard"
// NÃO ganha rota nova aqui — já existe desde o módulo 10 e passa a
// renderizar conteúdo diferente por `tenantRole` dentro do próprio
// `InvestorDashboardPage.tsx` (equipe interna vê o dashboard consolidado de
// sempre; `tenant_role = 'investidor'` vê um resumo pessoal novo,
// `InvestorDashboardInvestorView`) — ver comentário completo naquele
// arquivo. Mesmo critério do módulo 11: estas 4 páginas, para
// `tenant_role = 'investidor'`, são as únicas liberadas (`INVESTOR_ALLOWED_PAGES`).
// Fechando o módulo 14 (Configurações): "Settings" (sem sub-rota — 3 abas
// dentro da mesma página, `Usuários`/`Documentos`/`Conta`, ver
// `SettingsPage.tsx`; "Teams" do original ficou de fora por decisão já
// tomada, não vira aba nem rota — "Notificações" (módulo 15, abaixo) É uma
// rota própria, diferente do que essa nota antiga dizia). Já tinha item de
// nav (`features/dashboard/navigation.ts`, só para `admin`) mas caía em "em
// construção" até agora. E agora o módulo 15 (Notificações): "Notifications"
// ("/notifications" — mural interno + sino, ver `NotificationsPage.tsx`/
// `src/components/shared/NotificationBell.tsx`), sem sub-rota (mesma
// convenção de "Settings"/"ClientUnit" acima, sem detalhe próprio — cada
// notificação já linka direto para a tela do recurso relacionado via
// `link_route`, não para um "NotificationDetail"). Item de nav só para
// `admin`/`comercial`/`administrativo` (não aparece para `cliente`/
// `investidor` — mesmo critério de acesso do original, aqui garantido pelo
// redirect de `AppShell.tsx` em vez de um "Acesso Negado" dentro da própria
// página, ver `NotificationsPage.tsx`).
const PAGES_WITH_REAL_ROUTE = [
  'Terrains',
  'Projects',
  'Units',
  'Clients',
  'Brokers',
  'RealEstateAgencies',
  'CRM',
  'Finance',
  'FinanceDashboard',
  'InadimplenciaManager',
  'Commissions',
  'Documents',
  'Templates',
  'Inspections',
  'CreateInspection',
  'AdminMaintenance',
  'InvestorDashboard',
  'Investors',
  'InvestmentContributions',
  'InvestmentReturns',
  'ClientUnit',
  'ClientFinance',
  'ClientMaintenance',
  'InvestorProjects',
  'InvestorProjectDetail',
  'InvestorContributions',
  'InvestorReturns',
  'Settings',
  'Notifications',
];
const COMING_SOON_PAGE_NAMES = getAllNavPageNames().filter(
  (name) => name !== 'Dashboard' && !PAGES_WITH_REAL_ROUTE.includes(name)
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Módulo 13 (Espelho de Vendas): rota PÚBLICA, sem login — site de
          vendas visitado por qualquer pessoa da internet (`anon`, sem
          sessão). Fica fora de `ProtectedRoute`/`AppShell` de propósito,
          mesmo nível de `/login`/`/signup` acima, não dentro do app
          autenticado. Path fixo (`/e/:slug`, tradução do `Espelho de Vendas
          (/e/:slug)` do original), não usa `pageUrl()` — esse helper é só
          para páginas do app autenticado (ver comentário de topo de
          `src/lib/page-url.ts`). Ver `EspelhoVendasPage.tsx` para o
          racional completo. */}
      <Route path="/e/:slug" element={<EspelhoVendasPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />

          <Route path={pageUrl('Terrains')} element={<TerrainsListPage />} />
          <Route path={`${pageUrl('Terrains')}/novo`} element={<TerrainFormPage />} />
          <Route path={`${pageUrl('Terrains')}/:id`} element={<TerrainDetailPage />} />

          <Route path={pageUrl('Projects')} element={<ProjectsListPage />} />
          <Route path={`${pageUrl('Projects')}/novo`} element={<ProjectFormPage />} />
          <Route path={`${pageUrl('Projects')}/:id`} element={<ProjectDetailPage />} />

          <Route path={pageUrl('Units')} element={<UnitsListPage />} />
          <Route path={`${pageUrl('Units')}/novo`} element={<UnitFormPage />} />
          {/* Alcançada só pelo botão "Comparar" de UnitsListPage — sem item de nav próprio, fiel ao original (ver comentário em UnitsComparisonPage.tsx). Path próprio (`/units-comparison`), não colide com `/units/:id`. */}
          <Route path={pageUrl('UnitsComparison')} element={<UnitsComparisonPage />} />
          <Route path={`${pageUrl('Units')}/:id`} element={<UnitDetailPage />} />

          <Route path={pageUrl('Clients')} element={<ClientsListPage />} />
          <Route path={`${pageUrl('Clients')}/novo`} element={<ClientFormPage />} />
          <Route path={`${pageUrl('Clients')}/:id`} element={<ClientDetailPage />} />

          <Route path={pageUrl('Brokers')} element={<BrokersListPage />} />
          <Route path={`${pageUrl('Brokers')}/novo`} element={<BrokerFormPage />} />
          <Route path={`${pageUrl('Brokers')}/:id`} element={<BrokerDetailPage />} />

          <Route path={pageUrl('RealEstateAgencies')} element={<RealEstateAgenciesListPage />} />
          <Route path={`${pageUrl('RealEstateAgencies')}/novo`} element={<RealEstateAgencyFormPage />} />
          <Route path={`${pageUrl('RealEstateAgencies')}/:id`} element={<RealEstateAgencyDetailPage />} />

          <Route path={pageUrl('CRM')} element={<CRMPage />} />
          <Route path={`${pageUrl('CRM')}/:id`} element={<DealDetailPage />} />

          <Route path={pageUrl('Finance')} element={<FinanceListPage />} />
          <Route path={`${pageUrl('Finance')}/:id`} element={<FinanceAccountDetailPage />} />
          <Route path={pageUrl('FinanceDashboard')} element={<FinanceDashboardPage />} />
          <Route path={pageUrl('InadimplenciaManager')} element={<InadimplenciaManagerPage />} />

          <Route path={pageUrl('Commissions')} element={<CommissionsListPage />} />
          <Route path={`${pageUrl('Commissions')}/:id`} element={<CommissionDetailPage />} />

          <Route path={pageUrl('Documents')} element={<DocumentsListPage />} />

          <Route path={pageUrl('Templates')} element={<TemplatesListPage />} />
          <Route path={`${pageUrl('Templates')}/:id`} element={<TemplateDetailPage />} />

          <Route path={pageUrl('Inspections')} element={<InspectionsListPage />} />
          <Route path={pageUrl('CreateInspection')} element={<CreateInspectionPage />} />
          <Route path={`${pageUrl('Inspections')}/:id`} element={<InspectionDetailPage />} />

          <Route path={pageUrl('AdminMaintenance')} element={<MaintenanceListPage />} />
          <Route path={`${pageUrl('AdminMaintenance')}/:id`} element={<MaintenanceDetailPage />} />

          <Route path={pageUrl('InvestorDashboard')} element={<InvestorDashboardPage />} />
          <Route path={pageUrl('Investors')} element={<InvestorsListPage />} />
          <Route path={`${pageUrl('Investors')}/:id`} element={<InvestorDetailPage />} />
          <Route path={pageUrl('InvestmentContributions')} element={<InvestmentContributionsListPage />} />
          <Route path={pageUrl('InvestmentReturns')} element={<InvestmentReturnsListPage />} />

          <Route path={pageUrl('ClientUnit')} element={<ClientUnitPage />} />
          <Route path={pageUrl('ClientFinance')} element={<ClientFinancePage />} />
          <Route path={pageUrl('ClientMaintenance')} element={<ClientMaintenancePage />} />

          <Route path={pageUrl('InvestorProjects')} element={<InvestorProjectsPage />} />
          <Route path={`${pageUrl('InvestorProjects')}/:id`} element={<InvestorProjectDetailPage />} />
          <Route path={pageUrl('InvestorContributions')} element={<InvestorContributionsPage />} />
          <Route path={pageUrl('InvestorReturns')} element={<InvestorReturnsPage />} />

          <Route path={pageUrl('Settings')} element={<SettingsPage />} />

          <Route path={pageUrl('Notifications')} element={<NotificationsPage />} />

          {COMING_SOON_PAGE_NAMES.map((pageName) => (
            <Route key={pageName} path={pageUrl(pageName)} element={<ComingSoonPage pageName={pageName} />} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
