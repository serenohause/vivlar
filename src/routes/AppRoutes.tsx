import { Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { ClientDetailPage } from '@/features/clients/pages/ClientDetailPage';
import { ClientFormPage } from '@/features/clients/pages/ClientFormPage';
import { ClientsListPage } from '@/features/clients/pages/ClientsListPage';
import { getAllNavPageNames } from '@/features/dashboard/navigation';
import { Dashboard } from '@/features/dashboard/pages/Dashboard';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { ProjectFormPage } from '@/features/projects/pages/ProjectFormPage';
import { ProjectsListPage } from '@/features/projects/pages/ProjectsListPage';
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
// fechando o módulo de catálogo, e agora "Clients" (Clientes), primeira
// tela do módulo de CRM/Vendas — todas seguem a mesma convenção de
// sub-rota: detalhe em "/<slug>/:id", criação em "/<slug>/novo" (edição não
// tem rota própria — é um dialog, fiel ao original).
const PAGES_WITH_REAL_ROUTE = ['Terrains', 'Projects', 'Units', 'Clients'];
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

          {COMING_SOON_PAGE_NAMES.map((pageName) => (
            <Route key={pageName} path={pageUrl(pageName)} element={<ComingSoonPage pageName={pageName} />} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
