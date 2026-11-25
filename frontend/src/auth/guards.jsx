import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasRole } from '@app/shared';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { useAuth } from './AuthProvider.jsx';
import { nextPath } from './redirects.js';

/** Signed-in only; remembers where the visitor was heading. */
export function RequireAuth() {
  const { status, signedOut } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={signedOut ? undefined : { from: { pathname: location.pathname, search: location.search } }} />;
  return <Outlet />;
}

/** Owners/admins of a tenant that hasn't finished setup are routed through onboarding first. */
export function RequireOnboarding() {
  const { activeTenant } = useAuth();
  const needsOnboarding = activeTenant && !activeTenant.onboarded && hasRole(activeTenant.role, 'admin');
  return needsOnboarding ? <Navigate to="/onboarding" replace /> : <Outlet />;
}

/** Sign-in / sign-up pages: signed-in visitors are sent onward. */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner />;
  if (status === 'authenticated') return <Navigate to={nextPath(location) ?? '/app'} replace />;
  return <Outlet />;
}

/** Routes only admins/owners may open (the API enforces the same rule; this just avoids showing a dead page). */
export function RequireRole({ minimumRole }) {
  const { activeTenant } = useAuth();
  if (!activeTenant || !hasRole(activeTenant.role, minimumRole)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
