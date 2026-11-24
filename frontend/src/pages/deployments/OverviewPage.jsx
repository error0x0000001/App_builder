import { useQueryClient } from '@tanstack/react-query';
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
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
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

export default function OverviewPage() {
  const query = useDeploymentsOverview();
  const [creating, setCreating] = useState(false);
  const can = useCan();
  const data = query.data;
  return (
    <div className="space-y-6">
      <PageToolbar meta={data ? `${data.projects.length} project${data.projects.length === 1 ? '' : 's'} · ${data.servers.length} server${data.servers.length === 1 ? '' : 's'}` : undefined}>
        <Button as={Link} to="/app/deployments/templates" size="sm" variant="neutral"><Icon name="grid" className="size-4" />Templates</Button>
        {can('manager') && <Button as={Link} to="/app/deployments/credentials" size="sm" variant="neutral"><Icon name="key" className="size-4" />Credentials</Button>}
        {can('manager') && <Button as={Link} to="/app/deployments/access" size="sm" variant="neutral"><Icon name="users" className="size-4" />Access</Button>}
        {can('manager') && <Button as={Link} to="/app/deployments/servers" size="sm" variant="neutral"><Icon name="server" className="size-4" />Servers</Button>}
        {can('manager') && <Button size="sm" onClick={() => setCreating(true)}><Icon name="plus" className="size-4" />New project</Button>}
      </PageToolbar>
      {query.isPending && <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {data && (
        <>
          {data.servers.length === 0 && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-line-strong p-5">
              <FeaturedIcon icon="server" color="brand" size="lg" />
              <div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-ink">Connect your first server</h2><p className="text-sm text-muted">Deployments run on machines you own. Add one over SSH, and Quelli sets up Docker and HTTPS on it.</p></div>
              <Button as={Link} to="/app/deployments/servers" size="sm">Add a server</Button>
            </div>
          )}
          {data.projects.length === 0 ? (
            <div className="grid place-items-center gap-3 py-16 text-center"><FeaturedIcon icon="rocket" color="brand" size="xl" /><div><p className="text-base font-semibold text-ink">No projects yet</p><p className="text-sm text-muted">Create a project, then add an application or a database to it.</p></div>{can('manager') && <Button size="sm" onClick={() => setCreating(true)}>New project</Button>}</div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/deployments/p/${p.id}`} className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                    <div className="flex items-start justify-between gap-3"><FeaturedIcon icon="package" color="brand" /><span className="text-xs text-muted">{p.environments} env{p.environments === 1 ? '' : 's'}</span></div>
                    <h3 className="mt-4 text-base font-semibold text-ink">{p.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description || 'No description'}</p>
                    <div className="mt-auto flex items-center gap-3 pt-5 text-xs text-muted">
                      <span>{p.services} service{p.services === 1 ? '' : 's'}</span>
                      <span className="flex items-center gap-1">{Object.entries(p.statuses).flatMap(([status, n]) => Array.from({ length: Math.min(n, 6) }, (_, i) => <span key={`${status}${i}`} title={status} className={`size-2 rounded-full ${DOTS[status] ?? 'bg-line-strong'}`} />))}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.recent.length > 0 && (
            <section aria-label="Recent deployments" className="rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-4 text-base font-semibold text-ink">Recent activity</h2>
              <ul className="divide-y divide-line">
                {data.recent.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge status={d.status} of="deployment" />
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{d.serviceName ?? 'Server'}</span><span className="text-muted"> · {d.title}</span></span>
                    <time className="shrink-0 text-xs text-muted" dateTime={d.startedAt}>{ago(d.startedAt)}</time>
                    {d.serviceId && <Link to={`/app/deployments/s/${d.serviceId}/deployments`} className="text-xs font-semibold text-link hover:underline">Log</Link>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
