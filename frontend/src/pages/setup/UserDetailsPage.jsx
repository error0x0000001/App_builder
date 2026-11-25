import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS } from '@app/shared';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { setupApi, workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge, hueOf as badgeHue } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Section } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SwitchGroup } from '../../components/ui/SwitchGroup.jsx';
import { Popover } from '../../components/ui/Popover.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate, formatRelative } from '../../lib/format.js';
import { hueOf } from '../../lib/hue.js';
import { LoginAsButton } from './LoginAsButton.jsx';
import { invalidateSetupData } from './invalidate.js';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const ACTION_TONE = { create: 'success', update: 'accent', delete: 'danger', tool: 'warning' };

const Fact = ({ icon, label, children }) => (
  <div className="flex items-center gap-3 py-2.5 text-sm"><Icon name={icon} className="size-5 shrink-0 text-placeholder" /><dt className="w-24 shrink-0 text-muted">{label}</dt><dd className="min-w-0 flex-1 truncate font-medium text-ink">{children}</dd></div>
);

/** Role + profile: the two things that decide what this person can do. Saved through the same Users endpoint (and rules) as the list. */
function AccessCard({ user, onSaved }) {
  const profiles = useQuery({ queryKey: ['setup', 'records', 'profiles', 'options'], queryFn: () => setupApi.records('profiles', { limit: 200 }), staleTime: 60_000 });
  const [role, setRole] = useState(user.role);
  const [profile, setProfile] = useState(user.profile ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const options = [...new Set([...(profiles.data?.items ?? []).map((p) => p.profile_name).filter(Boolean), user.profile].filter(Boolean))];
  const changed = role !== user.role || profile !== (user.profile ?? '');
  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await setupApi.updateRecord('users', user.id, { ...(role !== user.role ? { role: ROLE_LABELS[role] } : {}), ...(profile !== (user.profile ?? '') ? { profile } : {}) });
      setSaved(true); await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Section title="Access" description="Role decides what this person can do in the organisation; the profile sets their permissions on each object.">
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {saved && !changed && <Alert tone="success">Saved.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
          <Select label="Profile" options={options} value={profile} onChange={setProfile} placeholder="Default for the role" />
        </div>
        <div className="flex justify-end"><Button size="sm" disabled={!changed} loading={busy} onClick={save}>Save changes</Button></div>
      </div>
    </Section>
  );
}

/** Permission-set add-ons: extra access on top of role + profile. Only exists when the organisation runs with ACCESS_ADDONS_ENABLED. */
function AddonsCard({ user, assigned, onChanged }) {
  const catalogue = useQuery({ queryKey: ['setup', 'access', 'permission-sets'], queryFn: setupApi.permissionSets, staleTime: 30_000 });
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const names = new Set(assigned.map((a) => a.name));
  const options = catalogue.data?.permissionSets ?? [];
  const toggle = async (name) => {
    setBusy(name); setError(null);
    try { await (names.has(name) ? setupApi.removePermissionSet(user.id, name) : setupApi.assignPermissionSet(user.id, name)); await onChanged(); await catalogue.refetch(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };
  return (
    <Section title="Add-ons" description="Extra permission sets on top of the role and profile. Access from every set is added together.">
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          {assigned.length === 0 && <span className="text-sm text-muted">No add-ons.</span>}
          {assigned.map((a) => <Tag key={a.name} dot="accent" closeLabel={`Remove ${a.name}`} onClose={busy ? undefined : () => toggle(a.name)}>{a.name}</Tag>)}
          <button ref={anchor} type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-2 py-1 text-sm font-medium text-muted outline-none hover:border-accent hover:text-link focus-visible:ring-2 focus-visible:ring-ring"><Icon name="plus" className="size-3.5" />Add</button>
        </div>
        <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} className="w-80 rounded-xl border border-line bg-surface p-1.5" role="group" aria-label="Permission sets">
          {options.length === 0 ? <p className="px-2 py-3 text-sm text-muted">No permission sets yet. Create one under Object Settings.</p> : (
            <SwitchGroup
              className="px-2.5" value={[...names]} isDisabled={(v) => busy === v} onChange={(_, changed) => toggle(changed)}
              options={options.map((o) => ({ value: o.name, label: o.name, description: `${o.users.toLocaleString()} ${o.users === 1 ? 'person' : 'people'}` }))}
            />
          )}
        </Popover>
      </div>
    </Section>
  );
}

/** Which workspaces this person may use (Odoo "allowed companies"). They always keep at least one. */
function WorkspacesCard({ user }) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant.id;
  const queryClient = useQueryClient();
  const all = useQuery({ queryKey: ['workspaces', tenantId, false], queryFn: () => workspacesApi.all(tenantId) });
  const mine = useQuery({ queryKey: ['workspaces', tenantId, 'of', user.id], queryFn: () => workspacesApi.assignmentsOf(tenantId, user.id) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (all.isPending || mine.isPending) return null;
  const options = all.data.workspaces.filter((w) => !w.archivedAt);
  const chosen = mine.data.workspaceIds;
  const change = async (next) => {
    setBusy(true); setError(null);
    try {
      await workspacesApi.setAssignments(tenantId, user.id, next);
      await Promise.all([mine.refetch(), queryClient.invalidateQueries({ queryKey: ['workspaces', tenantId, false] })]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Section title="Workspaces" description="The spaces this person can work in. Roles, profiles and settings are shared; the data they see follows the workspace they are in.">
      {error && <Alert tone="error">{error}</Alert>}
      <SwitchGroup
        value={chosen} isDisabled={(id) => busy || (chosen.length === 1 && chosen[0] === id)} onChange={change}
        options={options.map((w) => ({ value: w.id, label: w.name, description: w.isDefault ? 'Default workspace' : undefined }))}
      />
    </Section>
  );
}

function SessionsCard({ user, sessions, onChanged }) {
  const [busy, setBusy] = useState(null);
  const run = async (key, ids) => { setBusy(key); try { await setupApi.signOutUser(user.id, ids); await onChanged(); } finally { setBusy(null); } };
  return (
    <Section
      title="Devices and sessions" description="Where this person is signed in right now."
      action={sessions.length > 0 && <Button size="sm" variant="neutral" loading={busy === 'all'} onClick={() => run('all')}><Icon name="log-out" className="size-4" />Sign out everywhere</Button>}
    >
      {sessions.length === 0 ? <p className="py-4 text-center text-sm text-muted">Not signed in on any device.</p> : (
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <FeaturedIcon icon="monitor" color="blue" size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{s.browser} on {s.os}</p><p className="truncate text-xs text-muted">{s.ip} · active {formatRelative(s.lastUsedAt)}</p></div>
              <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => run(s.id, [s.id])}>Sign out</Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Untitled UI "activity feed – connected": avatar column with a dotted line between entries. */
function ChangesCard({ user, changes }) {
  return (
    <Section title="Setup changes" description={`Latest edits by ${user.firstName} in Setup.`} action={<Link to="/app/setup/view-setup-audit-trail" className="text-sm font-semibold text-link hover:underline">Audit trail</Link>}>
      {changes.length === 0 ? <p className="py-4 text-center text-sm text-muted">No changes yet.</p> : (
        <ul>
          {changes.map((c, i) => (
            <li key={c.id} className="flex gap-3">
              <div className="flex shrink-0 flex-col items-center"><Avatar name={user.name} src={user.avatar} size="size-9" />{i < changes.length - 1 && <span aria-hidden className="my-1 w-0 flex-1 border-l-2 border-dotted border-line-strong" />}</div>
              <div className="flex min-w-0 flex-1 items-start gap-3 pb-5">
                <div className="min-w-0 flex-1"><p className="text-xs text-muted">{formatRelative(c.at)}</p><p className="text-sm text-ink">{c.summary}</p></div>
                <Badge tone={ACTION_TONE[String(c.action).toLowerCase()] ?? 'neutral'}>{c.action}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Everything about one person in one place: who they are, what they can do, where they are signed in, what they changed, and the actions on them. */
export default function UserDetailsPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me, me: account } = useAuth();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const query = useQuery({ queryKey: ['setup', 'user', userId], queryFn: () => setupApi.user(userId) });
  const refresh = async () => { await Promise.all([query.refetch(), invalidateSetupData(queryClient)]); };

  if (query.isPending) return <div className="grid place-items-center py-24 text-muted"><Spinner className="size-6" /></div>;
  if (query.isError) return <div className="space-y-4"><BackLink /><Alert tone="error">{query.error.message}</Alert></div>;
  const { user, sessions, logins, changes, permissionSets } = query.data;
  const hue = hueOf(user.name);
  const isMe = user.id === me.id;
  const remove = async () => { await setupApi.deleteRecords('users', [user.id]); await invalidateSetupData(queryClient); navigate('/app/setup/users'); };

  return (
    <div className="space-y-5">
      <BackLink />
      <Card className="overflow-hidden p-0">
        <div aria-hidden="true" className="cover-banner h-32 w-full" style={{ background: `linear-gradient(to top right, hsl(${hue} 90% 80%), hsl(${(hue + 55) % 360} 100% 94%))` }} />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-5 sm:px-6">
          <div className="-mt-12 rounded-full bg-surface p-1 ring-1 ring-line"><Avatar name={user.name} src={user.avatar} size="size-24" status={sessions.length ? 'online' : undefined} className="text-3xl" /></div>
          <div className="min-w-0 flex-1 pt-3">
            <h1 className="truncate text-xl font-semibold text-ink">{user.name}{isMe && <span className="ml-2 text-sm font-normal text-muted">(you)</span>}</h1>
            <p className="truncate text-sm text-muted">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="accent">{user.roleLabel}</Badge>{user.profile && <Badge hue={badgeHue(user.profile)}>{user.profile}</Badge>}<Badge tone={user.active ? 'success' : 'neutral'} dot>{user.active ? 'Active' : 'Deactivated'}</Badge>{user.mfaEnabled && <Badge hue="teal">2-step on</Badge>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3"><LoginAsButton userId={user.id} />{!isMe && <Button size="sm" variant="neutral" className="text-danger!" onClick={() => setConfirmRemove(true)}><Icon name="trash" className="size-4" />Remove</Button>}</div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <AccessCard key={`${user.role}|${user.profile}`} user={user} onSaved={refresh} />
          {account?.features?.accessAddons && permissionSets && <AddonsCard user={user} assigned={permissionSets} onChanged={refresh} />}
          <WorkspacesCard user={user} />
          <SessionsCard user={user} sessions={sessions} onChanged={refresh} />
          <ChangesCard user={user} changes={changes} />
        </div>
        <div className="space-y-5">
          <Section title="About">
            <dl className="divide-y divide-line">
              <Fact icon="mail" label="Email">{user.emailVerified ? <Badge tone="success" dot>Verified</Badge> : <Badge tone="warning" dot>Unverified</Badge>}</Fact>
              <Fact icon="calendar" label="Joined">{formatDate(user.joinedAt)}</Fact>
              <Fact icon="clock" label="Last sign-in">{user.lastLogin ? formatRelative(user.lastLogin) : 'Never'}</Fact>
              <Fact icon="shield" label="2-step sign-in">{user.mfaEnabled ? 'On' : 'Off'}</Fact>
              <Fact icon="edit" label="Setup changes">{Number(user.changeCount).toLocaleString()}</Fact>
            </dl>
          </Section>
          <Section title="Recent sign-ins">
            {logins.length === 0 ? <p className="text-sm text-muted">No sign-ins recorded.</p> : (
              <ul className="space-y-3">
                {logins.map((l) => <li key={l.id} className="flex items-center gap-3"><span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-success')} /><div className="min-w-0 flex-1"><p className="truncate text-sm text-ink">{l.browser} on {l.os}</p><p className="truncate text-xs text-muted">{l.ip}</p></div><time dateTime={l.at} className="shrink-0 text-xs text-muted">{formatRelative(l.at)}</time></li>)}
              </ul>
            )}
          </Section>
        </div>
      </div>
      <ConfirmDialog open={confirmRemove} danger confirmLabel="Remove from organisation" title={`Remove ${user.name}?`} description="They lose access to this organisation and are signed out here. Their account and other tenants are not affected." onConfirm={remove} onClose={() => setConfirmRemove(false)} />
    </div>
  );
}

const BackLink = () => <Link to="/app/setup/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Users</Link>;
