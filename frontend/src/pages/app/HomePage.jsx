import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@app/shared';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';

export default function HomePage() {
  const { user, activeWorkspace, workspaces } = useAuth();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Welcome back, {user.firstName}</h1>
        <p className="mt-1 text-sm text-muted">{activeWorkspace ? `You’re working in ${activeWorkspace.name}.` : 'You aren’t part of a workspace yet.'}</p>
      </div>
      {activeWorkspace ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-ink">{activeWorkspace.name}</p>
            <p className="text-sm text-muted">{activeWorkspace.slug}.quelli.app</p>
          </div>
          <Badge tone="accent">{ROLE_LABELS[activeWorkspace.role]}</Badge>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-sm text-muted">Create a workspace, or ask an administrator to invite you to one.</p>
          <Button as={Link} to="/app/workspaces/new">Create a workspace</Button>
        </Card>
      )}
      <p className="text-sm text-muted">You belong to {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}. Use the workspace switcher to move between them.</p>
    </>
  );
}
