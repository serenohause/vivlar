import { Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { BrokerDetailPage } from '@/features/brokers/pages/BrokerDetailPage';
import { BrokerFormPage } from '@/features/brokers/pages/BrokerFormPage';
import { BrokersListPage } from '@/features/brokers/pages/BrokersListPage';
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
import { FinanceAccountDetailPage } from '@/features/finance/pages/FinanceAccountDetailPage';
import { FinanceDashboardPage } from '@/features/finance/pages/FinanceDashboardPage';
import { FinanceListPage } from '@/features/finance/pages/FinanceListPage';
import { InadimplenciaManagerPage } from '@/features/finance/pages/InadimplenciaManagerPage';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { ProjectFormPage } from '@/features/projects/pages/ProjectFormPage';
import { ProjectsListPage } from '@/features/projects/pages/ProjectsListPage';
import { RealEstateAgencyDetailPage } from '@/features/real-estate-agencies/pages/RealEstateAgencyDetailPage';
import { RealEstateAgencyFormPage } from '@/features/real-estate-agencies/pages/RealEstateAgencyFormPage';
import { RealEstateAgenciesListPage } from '@/features/real-estate-agencies/pages/RealEstateAgenciesListPage';
import { TerrainDetailPage } from '@/features/terrains/pages/TerrainDetailPage';
import { TerrainFormPage } from '@/features/terrains/pages/TerrainFormPage';
import { TerrainsListPage } from '@/features/terrains/pages/TerrainsListPage';
import { UnitDetailPage } from '@/features/units/pages/UnitDetailPage';
import { UnitFormPage } from '@/features/units/pages/UnitFormPage';
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
// existente. Por fim, "Documents" (Documentos: gestão documental MCMV, com
// upload real via Supabase Storage) — só "/documents" (lista), sem
// sub-rota de detalhe (o original só tem lista + dialog de criar/editar,
// mesma convenção de "Brokers" antes de ganhar detalhe — aqui optamos por
// não criar um detalhe que o original também não tem).
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

          {COMING_SOON_PAGE_NAMES.map((pageName) => (
            <Route key={pageName} path={pageUrl(pageName)} element={<ComingSoonPage pageName={pageName} />} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
