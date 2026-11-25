import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectBodySchema } from '@app/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Hero, Kpi, KpiStrip, Panel, hueFor, tint } from './ui.jsx';
import { TemplateLogo } from './TemplatesPage.jsx';
import { StatusBadge, ago, useDeploymentsOverview, useCan } from './parts.jsx';

function NewProjectDialog({ open, onClose }) {
  const queryClient = useQueryClient(); const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: projectBodySchema, defaultValues: { name: '', description: '' },
    onSubmit: async (values) => { const { project } = await deploymentsApi.addProject(values); await queryClient.invalidateQueries({ queryKey: ['deployments'] }); onClose(); navigate(`/app/deployments/p/${project.id}`); },
  });
  return (
    <Dialog open={open} onClose={onClose} label="New project" className="max-w-md">
      <div className="space-y-4 p-5">
        <div><h2 className="text-base font-semibold text-ink">New project</h2><p className="mt-1 text-sm text-muted">A project groups the services of one product. It starts with a “production” environment.</p></div>
        <Form form={form} onSubmit={submit} error={formError}>
          <TextField name="name" label="Name" placeholder="Online shop" autoFocus required />
          <TextField name="description" label="Description" placeholder="Optional" />
          <div className="flex justify-end gap-2"><Button variant="neutral" size="sm" type="button" onClick={onClose}>Cancel</Button><SubmitButton size="sm">Create project</SubmitButton></div>
        </Form>
      </div>
    </Dialog>
  );
}

const DOTS = { done: 'bg-success', running: 'bg-warning', error: 'bg-danger', stopped: 'bg-line-strong', idle: 'bg-line-strong' };

function ProjectCard({ p }) {
  const color = hueFor(p.name);
  return (
    <Link to={`/app/deployments/p/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
      <div style={tint(color, 18)} className="flex items-center gap-3 px-4 py-3">
        <span style={{ '--c': `var(--fi-${color})` }} className="grid size-10 place-items-center rounded-lg bg-surface text-(--c) ring-1 ring-line"><Icon name="package" className="size-5" /></span>
        <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-ink">{p.name}</h3><p className="text-xs text-muted">{p.environments} environment{p.environments === 1 ? '' : 's'}</p></div>
        <Icon name="chevron-right" className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm text-muted">{p.description || 'No description'}</p>
        <div className="mt-auto flex items-center justify-between text-xs text-muted">
          <span className="font-medium text-ink">{p.services} service{p.services === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-1">{Object.entries(p.statuses).flatMap(([status, n]) => Array.from({ length: Math.min(n, 8) }, (_, i) => <span key={`${status}${i}`} title={status} className={`size-2.5 rounded-full ${DOTS[status] ?? 'bg-line-strong'}`} />))}</span>
        </div>
      </div>
    </Link>
  );
}

const POPULAR = ['ghost', 'plausible', 'n8n', 'umami', 'uptime-kuma', 'minio', 'wordpress', 'grafana'];

function QuickStart({ data }) {
  const steps = [
    [data.servers.length > 0, 'Connect a server', 'Add a machine over SSH; Quelli installs Docker and HTTPS.', '/app/deployments/servers', 'server', 'purple'],
    [data.projects.length > 0, 'Create a project', 'A project groups the services of one product.', null, 'package', 'blue'],
    [data.projects.some((p) => p.services > 0), 'Deploy something', 'An image, a Git repository, a database or a template.', '/app/deployments/templates', 'rocket', 'orange'],
  ];
  if (steps.every(([done]) => done)) return null;
  return (
    <Panel icon="check-square" color="success" title="Get started" description={`${steps.filter(([d]) => d).length} of 3 done`}>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map(([done, title, text, to, icon, color], i) => (
          <li key={title} style={tint(done ? 'success' : color, 8)} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2"><FeaturedIcon icon={done ? 'check-circle' : icon} color={done ? 'success' : color} size="sm" /><span className="text-xs font-medium text-muted">Step {i + 1}</span></div>
            <p className="text-sm font-semibold text-ink">{title}</p><p className="text-xs text-muted">{text}</p>
            {!done && to && <Link to={to} className="mt-auto text-xs font-semibold text-link hover:underline">Open</Link>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function PopularTemplates() {
  const query = useQuery({ queryKey: ['deployments', 'templates'], queryFn: deploymentsApi.templates, staleTime: 3_600_000 });
  const list = POPULAR.map((id) => (query.data?.templates ?? []).find((t) => t.id === id)).filter(Boolean);
  if (!list.length) return null;
  return (
    <Panel icon="grid" color="indigo" title="Popular templates" description="One click each" action={<Link to="/app/deployments/templates" className="text-xs font-semibold text-link hover:underline">Browse all</Link>}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {list.map((t) => (
          <li key={t.id}><Link to={`/app/deployments/templates?q=${encodeURIComponent(t.name)}`} className="flex flex-col items-center gap-2 rounded-lg border border-line p-3 text-center transition-colors hover:border-line-strong hover:bg-surface-2"><TemplateLogo template={t} /><span className="w-full truncate text-xs font-medium text-ink">{t.name}</span></Link></li>
        ))}
      </ul>
    </Panel>
  );
}

export default function OverviewPage() {
  const query = useDeploymentsOverview();
  const [creating, setCreating] = useState(false);
  const can = useCan();
  const data = query.data;
  const services = data ? data.projects.reduce((n, p) => n + p.services, 0) : 0;
  const running = data ? data.projects.reduce((n, p) => n + (p.statuses.done ?? 0), 0) : 0;
  const failing = data ? data.projects.reduce((n, p) => n + (p.statuses.error ?? 0), 0) : 0;
  const ready = data ? data.servers.filter((s) => s.status === 'ready').length : 0;
  const failed24 = data ? data.recent.filter((d) => d.status === 'error').length : 0;
  return (
    <div className="space-y-4">
      <Hero icon="rocket" color="brand" title="Deployments" subtitle="Run apps, databases and one-click templates on your own servers."
        actions={<>
          <Button as={Link} to="/app/deployments/templates" size="sm" variant="neutral"><Icon name="grid" className="size-4" />Templates</Button>
          {can('manager') && <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" className="size-4" />New project</Button>}
        </>}>
        <KpiStrip>
          <Kpi icon="cube" color="blue" label="Services" value={data ? services : '–'} caption={data ? `${data.projects.length} project${data.projects.length === 1 ? '' : 's'}` : undefined} />
          <Kpi icon="check-circle" color="success" label="Running" value={data ? running : '–'} caption={failing ? `${failing} failing` : 'All healthy'} />
          <Kpi icon="server" color="purple" label="Servers ready" value={data ? `${ready}/${data.servers.length}` : '–'} />
          <Kpi icon="activity" color={failed24 ? 'error' : 'teal'} label="Recent deployments" value={data ? data.recent.length : '–'} caption={failed24 ? `${failed24} failed` : 'None failed'} />
        </KpiStrip>
      </Hero>
      {query.isPending && <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {data && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {data.servers.length === 0 && (
              <div style={tint('orange', 10)} className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
                <FeaturedIcon icon="server" color="orange" size="lg" />
                <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-ink">Connect your first server</h2><p className="text-sm text-muted">Deployments run on machines you own. Add one over SSH and Quelli sets up Docker and HTTPS on it.</p></div>
                <Button as={Link} to="/app/deployments/servers" size="sm">Add a server</Button>
              </div>
            )}
            {data.projects.length === 0 ? (
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line-strong py-14 text-center"><FeaturedIcon icon="rocket" color="brand" size="xl" /><div><p className="text-base font-semibold text-ink">No projects yet</p><p className="text-sm text-muted">Create a project, then add an application, a database or a template.</p></div>{can('manager') && <Button size="sm" onClick={() => setCreating(true)}>New project</Button>}</div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">{data.projects.map((p) => <li key={p.id}><ProjectCard p={p} /></li>)}{can('manager') && <li><button type="button" onClick={() => setCreating(true)} className="grid h-full min-h-28 w-full place-items-center rounded-xl border border-dashed border-line-strong text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-4 focus-visible:ring-ring"><span className="flex items-center gap-2"><Icon name="plus" className="size-4" />New project</span></button></li>}</ul>
            )}
            <QuickStart data={data} />
            <PopularTemplates />
          </div>
          <div className="space-y-4">
            <Panel icon="server" color="purple" title="Servers" action={can('manager') && <Link to="/app/deployments/servers" className="text-xs font-semibold text-link hover:underline">Manage</Link>} bodyClassName="p-0">
              {data.servers.length === 0 ? <p className="p-4 text-sm text-muted">No servers yet.</p> : (
                <ul className="divide-y divide-line">{data.servers.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className={`size-2.5 rounded-full ${s.status === 'ready' ? 'bg-success' : s.status === 'error' ? 'bg-danger' : 'bg-warning'}`} /><span className="min-w-0 flex-1 truncate font-medium text-ink">{s.name}</span><span className="text-xs text-muted">{s.services} svc</span></li>
                ))}</ul>
              )}
            </Panel>
            <Panel icon="activity" color="teal" title="Recent activity" action={<Link to="/app/deployments/queue" className="text-xs font-semibold text-link hover:underline">All</Link>} bodyClassName="p-0">
              {data.recent.length === 0 ? <p className="p-4 text-sm text-muted">Nothing deployed yet.</p> : (
                <ul className="divide-y divide-line">{data.recent.slice(0, 8).map((d) => (
                  <li key={d.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium text-ink">{d.serviceName ?? 'Server'}</span><StatusBadge status={d.status} of="deployment" /></div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted"><span className="min-w-0 flex-1 truncate">{d.title}</span><time dateTime={d.startedAt}>{ago(d.startedAt)}</time></div>
                  </li>
                ))}</ul>
              )}
            </Panel>
          </div>
        </div>
      )}
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
