import { useState } from 'react';
import { Badge, hueOf } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Pane, PaneGroup } from '../../../components/ui/Panes.jsx';
import { ProfileHeader } from '../../../components/ui/ProfileHeader.jsx';
import { LoginAsButton } from '../LoginAsButton.jsx';
import SetupFormPage from '../SetupFormPage.jsx';
import SetupListPage from '../SetupListPage.jsx';
import { SetupRecordDialog } from '../SetupRecordDialog.jsx';
import { StatusBanner } from '../StatusBanner.jsx';
import { useSetupPage } from '../useSetupPage.js';

const ROWS = [['mail', 'Email', 'email'], ['user', 'Username', 'username'], ['key', 'Alias', 'alias']];

/** Untitled UI "user profile" drawer content, opened on the right of the list: cover banner, avatar, tags, actions, then the facts. */
function UserDetails({ user, page, onClose }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex h-full flex-col overflow-y-auto pb-6">
      <div className="flex items-center justify-between px-4 pb-3 pt-4"><h2 className="text-base font-semibold text-ink">User details</h2><button type="button" aria-label="Close details" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-5" /></button></div>
      <ProfileHeader
        name={user.full_name} subtitle={user.email} status={user.active ? 'online' : undefined}
        tags={<div className="flex flex-wrap gap-1.5">{user.role && <Badge tone="accent">{user.role}</Badge>}{user.profile && <Badge hue={hueOf(user.profile)}>{user.profile}</Badge>}<Badge tone={user.active ? 'success' : 'neutral'} dot>{user.active ? 'Active' : 'Invited'}</Badge></div>}
        actions={<Button size="sm" onClick={() => setEditing(true)}><Icon name="edit" className="size-4" />Edit user</Button>}
      />
      <section aria-label="About" className="mt-5 px-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">About</h3>
        <dl className="space-y-3">
          {ROWS.map(([icon, label, key]) => user[key] && (
            <div key={key} className="flex items-center gap-3 text-sm"><Icon name={icon} className="size-5 shrink-0 text-placeholder" /><dt className="sr-only">{label}</dt><dd className="min-w-0 truncate text-muted">{user[key]}</dd></div>
          ))}
        </dl>
      </section>
      {editing && (
        <SetupRecordDialog pageKey="users" collection={page} mode="edit" record={user} title="Edit Users" extra={<LoginAsButton userId={user.id} />} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/**
 * Users and User Management Settings are one thing, so they are one page: the people (click one for a details panel on the right,
 * Untitled's user profile drawer) and, below them, the switches that govern how people are managed.
 */
export default function UsersPage() {
  const [user, setUser] = useState(null);
  const users = useSetupPage('users');
  const settings = useSetupPage('user-management-settings');
  return (
    <PaneGroup className="h-auto items-start gap-6">
      <Pane className="min-w-0 flex-1 space-y-8">
        <SetupListPage pageKey="users" embedded onOpen={setUser} />
        <section aria-label="User management settings" className="space-y-3">
          <StatusBanner status={settings.data?.status} />
          <SetupFormPage pageKey="user-management-settings" />
        </section>
      </Pane>
      {user && users.data?.page && <Pane as="aside" side="right" aria-label="User details" className="sticky top-0 hidden w-80 shrink-0 self-start border-l pl-0 lg:block xl:w-96"><UserDetails key={user.id} user={user} page={users.data.page} onClose={() => setUser(null)} /></Pane>}
    </PaneGroup>
  );
}
