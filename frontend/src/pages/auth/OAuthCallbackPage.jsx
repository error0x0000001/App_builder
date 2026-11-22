import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageSpinner } from '../../components/ui/Spinner.jsx';

/** Landing page after the provider redirect: the API already set the session cookie; bootstrap picks it up. */
export default function OAuthCallbackPage() {
  const { status } = useAuth();
  if (status === 'loading') return <PageSpinner />;
  return <Navigate to={status === 'authenticated' ? '/app' : '/login?error=oauth'} replace />;
}
