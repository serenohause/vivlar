import { Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { getAllNavPageNames } from '@/features/dashboard/navigation';
import { Dashboard } from '@/features/dashboard/pages/Dashboard';
import { pageUrl } from '@/lib/page-url';
import { AppShell } from '@/routes/AppShell';
import { ComingSoonPage } from '@/routes/ComingSoonPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

// Toda página referenciada pela navegação (qualquer perfil) que ainda não
// tem tela real vira uma rota "em construção" — gerada a partir da mesma
// lista usada para montar a sidebar, sem repetir 30 <Route> à mão. Ver
// convenção de URL em `src/lib/page-url.ts`.
const COMING_SOON_PAGE_NAMES = getAllNavPageNames().filter((name) => name !== 'Dashboard');

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />

          {COMING_SOON_PAGE_NAMES.map((pageName) => (
            <Route key={pageName} path={pageUrl(pageName)} element={<ComingSoonPage pageName={pageName} />} />
          ))}
        </Route>
      </Route>
    </Routes>
  );
}
