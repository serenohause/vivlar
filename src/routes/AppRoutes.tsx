import { Route, Routes } from 'react-router-dom';

import { AuthenticatedPlaceholder } from '@/features/auth/pages/AuthenticatedPlaceholder';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { OnboardingPage } from '@/features/auth/pages/OnboardingPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AuthenticatedPlaceholder />} />
      </Route>
    </Routes>
  );
}
