import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { appsApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { isVisibleTo, NAV } from '../../layouts/navigation.js';
import { hueOf } from '../../lib/hue.js';
import { AppSheet } from '../apps/studio/AppSheet.jsx';
import { useAppMeta, useApps } from '../apps/useApps.js';

const COLORS = ['brand', 'blue', 'purple', 'pink', 'orange', 'teal', 'indigo'];
const FI = { brand: 'brand', gray: 'gray', blue: 'blue', green: 'success', amber: 'warning', red: 'error', purple: 'purple', pink: 'pink', teal: 'teal', indigo: 'indigo', orange: 'orange', success: 'success' };
const BLURB = { Documents: 'Files and folders, shared with the right people.', Chat: 'Conversations and calls with your team.', Deployments: 'Servers, projects and one-click templates.', Members: 'Who is in this organisation.', Workspaces: 'The spaces people work in.', Integrations: 'Connect email, storage, maps and chat tools.', Account: 'Your profile and security.', Setup: 'Configure people, access, objects and more.' };

function Tile({ to, icon, color, label, description, onHover }) {
  return (
    <Link to={to} onMouseEnter={onHover} onFocus={onHover} className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 outline-none transition-colors hover:border-accent hover:bg-accent-soft focus-visible:ring-4 focus-visible:ring-ring">
      <FeaturedIcon icon={icon} color={FI[color] ?? 'brand'} size="lg" shape="square" />
      <span className="min-w-0"><span className="block truncate text-base font-semibold text-ink">{label}</span><span className="mt-0.5 line-clamp-2 block text-sm text-muted">{description}</span></span>
    </Link>
  );
}

/** The landing page: a welcome banner and, below it, every app the person can open. */
export default function LauncherPage() {
  const { user, activeTenant, tenants } = useAuth();
  const apps = useApps(); const meta = useAppMeta(); const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const admin = ['owner', 'admin'].includes(activeTenant?.role);
  const system = [
    ...NAV.main.filter((i) => i.to !== '/app').map((i) => ({ to: i.to, icon: i.icon, label: i.label, item: i })),
    ...NAV.groups.map((g) => ({ to: g.items[0].to, icon: g.icon, label: g.label, item: g.items[0] })),
    ...NAV.bottom.map((i) => ({ to: i.to, icon: i.icon, label: i.label, item: i })),
  ].filter((t) => isVisibleTo(t.item, activeTenant));
  const prefetch = (key) => () => qc.prefetchQuery({ queryKey: ['app', key], queryFn: () => appsApi.app(key), staleTime: 60_000 });
  if (!activeTenant) return <Card className="space-y-3 p-6"><p className="text-sm text-muted">Create an organisation, or ask an administrator to invite you to one.</p><Button as={Link} to="/app/tenants/new">Create an organisation</Button>{tenants.length === 0 && null}</Card>;
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-line px-6 py-8 sm:px-8 sm:py-10" style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 20%, var(--surface)), color-mix(in srgb, var(--fi-blue) 12%, var(--surface)) 55%, color-mix(in srgb, var(--fi-pink) 12%, var(--surface)))' }}>
        <p className="text-sm font-medium text-muted">{activeTenant.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Welcome back, {user.firstName}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Pick an app to get started{admin ? ', or build your own in Studio.' : '.'}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Your apps</h2>
        {apps.isPending ? <div className="py-6"><Spinner /></div> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {apps.data.apps.map((a) => <Tile key={a.id} to={`/app/a/${a.key}`} icon={a.icon} color={a.color} label={a.label} description={a.description || 'Custom app'} onHover={prefetch(a.key)} />)}
            {admin && meta.data && (
              <button type="button" onClick={() => setCreating(true)} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-sm font-semibold text-muted outline-none transition-colors hover:border-accent hover:text-link focus-visible:ring-4 focus-visible:ring-ring">
                <span className="grid size-10 place-items-center rounded-full border border-line-strong"><Icon name="plus" className="size-5" /></span>New app
              </button>
            )}
          </div>
        )}
        {apps.data?.apps.length === 0 && !admin && <p className="text-sm text-muted">No custom apps have been shared with you yet.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Workspace tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {system.map((t) => <Tile key={t.to} to={t.to} icon={t.icon} color={COLORS[COLORS.indexOf(hueOf(t.label)) >= 0 ? COLORS.indexOf(hueOf(t.label)) : 0]} label={t.label} description={BLURB[t.label] ?? ''} />)}
        </div>
      </section>
      {creating && meta.data && <AppSheet meta={meta.data} onClose={() => setCreating(false)} />}
    </div>
  );
}
