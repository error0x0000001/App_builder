import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth, RequireOnboarding } from './auth/guards.jsx';
import { PageSpinner } from './components/ui/Spinner.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { AuthLayout } from './layouts/AuthLayout.jsx';

// Route-level code splitting keeps the first load small.
const page = (loader) => lazy(loader);
const LoginPage = page(() => import('./pages/auth/LoginPage.jsx'));
const WorkspaceLoginPage = page(() => import('./pages/auth/WorkspaceLoginPage.jsx'));
const MfaChallengePage = page(() => import('./pages/auth/MfaChallengePage.jsx'));
const SignupPage = page(() => import('./pages/auth/SignupPage.jsx'));
const VerifyEmailPage = page(() => import('./pages/auth/VerifyEmailPage.jsx'));
const ForgotPasswordPage = page(() => import('./pages/auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = page(() => import('./pages/auth/ResetPasswordPage.jsx'));
const AcceptInvitePage = page(() => import('./pages/auth/AcceptInvitePage.jsx'));
const OAuthCallbackPage = page(() => import('./pages/auth/OAuthCallbackPage.jsx'));
const OnboardingPage = page(() => import('./pages/onboarding/OnboardingPage.jsx'));
const HomePage = page(() => import('./pages/app/HomePage.jsx'));
const MembersPage = page(() => import('./pages/app/MembersPage.jsx'));
const ProfilePage = page(() => import('./pages/app/ProfilePage.jsx'));
const SecurityPage = page(() => import('./pages/app/SecurityPage.jsx'));
const NewWorkspacePage = page(() => import('./pages/app/NewWorkspacePage.jsx'));

export default function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/workspace" element={<WorkspaceLoginPage />} />
            <Route path="/login/mfa" element={<MfaChallengePage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<RequireOnboarding />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="workspaces/new" element={<NewWorkspacePage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  );
}
