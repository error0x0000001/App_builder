import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@app/shared';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';

export default function HomePage() {
  const { user, activeTenant, tenants } = useAuth();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Welcome back, {user.firstName}</h1>
        <p className="mt-1 text-sm text-muted">{activeTenant ? `You’re working in ${activeTenant.name}.` : 'You aren’t part of an organisation yet.'}</p>
      </div>
      {activeTenant ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-ink">{activeTenant.name}</p>
            <p className="text-sm text-muted">{activeTenant.slug}.quelli.app</p>
          </div>
          <Badge tone="accent">{ROLE_LABELS[activeTenant.role]}</Badge>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-sm text-muted">Create an organisation, or ask an administrator to invite you to one.</p>
          <Button as={Link} to="/app/tenants/new">Create an organisation</Button>
        </Card>
      )}
      <p className="text-sm text-muted">You belong to {tenants.length} tenant{tenants.length === 1 ? '' : 's'}. Use the organisation switcher to move between them.</p>
    </>
  );
}
