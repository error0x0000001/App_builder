import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';

/** Users page: sign in as this person for 30 minutes (allowed by Login Access Policies; audited; they can see it in their activity). */
export function LoginAsButton({ userId }) {
  const { activeTenant, startImpersonation, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (userId === user.id) return null;
  const go = async () => {
    setBusy(true); setError(null);
    try { await startImpersonation(activeTenant.id, userId); navigate('/app'); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Button size="sm" variant="neutral" onClick={go} loading={busy}>Log in as this user</Button>
    </div>
  );
}
