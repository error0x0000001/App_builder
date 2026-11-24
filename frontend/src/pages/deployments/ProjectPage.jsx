import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATABASE_KINDS, serviceCreateSchema } from '@app/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, SwitchField, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { KINDS, KindTile, StatusBadge, ago } from './parts.jsx';

/** Drops what the form left empty or does not apply to the chosen kind, so the shared schema sees only real input. */
const clean = (v) => {
  const out = { kind: v.kind, name: v.name, autoDeploy: v.autoDeploy ?? true };
  if (v.serverId) out.serverId = v.serverId;
  if (v.kind === 'application') {
    const s = v.source ?? {};
    out.source = s.type === 'git'
      ? { type: 'git', repository: s.repository, branch: s.branch || 'main', buildType: s.buildType || 'dockerfile', buildPath: s.buildPath || '.', dockerfile: s.dockerfile || 'Dockerfile', ...(s.token ? { token: s.token } : {}), ...(s.publishDirectory ? { publishDirectory: s.publishDirectory } : {}) }
      : { type: 'docker', image: s.image, ...(s.registryUser ? { registryUser: s.registryUser, registryPassword: s.registryPassword, registryUrl: s.registryUrl || undefined } : {}) };
    if (v.config?.port) out.config = { port: v.config.port };
  }
  if (v.kind === 'compose') out.config = { composeFile: v.config?.composeFile };
  if (DATABASE_KINDS.includes(v.kind) && v.config?.database) out.config = { database: { ...(v.config.database.name ? { name: v.config.database.name } : {}), ...(v.config.database.user ? { user: v.config.database.user } : {}) } };
  return out;
};
const formSchema = z.preprocess(clean, serviceCreateSchema);

function NewServiceSheet({ environment, servers, onClose, onCreated }) {
  const [kind, setKind] = useState(null);
  const { form, submit, formError } = useAppForm({
    schema: formSchema,
    defaultValues: { kind: 'application', name: '', serverId: '', autoDeploy: true, source: { type: 'docker', image: '', repository: '', branch: 'main', buildType: 'dockerfile', buildPath: '.', dockerfile: 'Dockerfile', token: '' }, config: { port: '', composeFile: '', database: { name: '', user: '' } } },
    onSubmit: async (values) => { const { service } = await deploymentsApi.addService(environment.id, values); onCreated(service); },
  });
  const sourceType = form.watch('source.type');
  const ready = servers.filter((s) => s.status === 'ready');
  const options = [{ value: '', label: ready.length ? 'Choose a server' : 'No ready server yet' }, ...ready.map((s) => ({ value: s.id, label: s.name }))];
  return (
    <Sheet open onClose={onClose} title={kind ? `New ${KINDS[kind].label.toLowerCase()}` : 'New service'} description={kind ? undefined : `In ${environment.name}`} width="w-[30rem]"
      footer={kind && <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setKind(null)}>Back</Button><span className="ml-auto" /><SubmitButton size="sm" form="new-service">Create</SubmitButton></div>}>
      {!kind ? (
        <ul className="grid gap-3">
          {Object.entries(KINDS).map(([key, k]) => (
            <li key={key}><button type="button" onClick={() => { setKind(key); form.setValue('kind', key); }} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left outline-none transition-colors hover:border-accent focus-visible:ring-4 focus-visible:ring-ring"><KindTile kind={key} /><span><span className="block text-sm font-semibold text-ink">{k.label}</span><span className="block text-xs text-muted">{k.blurb}</span></span></button></li>
          ))}
        </ul>
      ) : (
        <Form form={form} onSubmit={submit} error={formError} id="new-service">
          <TextField name="name" label="Name" placeholder={kind === 'application' ? 'web' : KINDS[kind].label} required autoFocus />
          <SelectField name="serverId" label="Server" options={options} hint={ready.length ? undefined : 'Add a server and run its setup first (Deployments › Servers).'} />
          {kind === 'application' && (
            <>
              <SelectField name="source.type" label="Source" options={[{ value: 'docker', label: 'Docker image' }, { value: 'git', label: 'Git repository' }]} />
              {sourceType === 'docker' ? (
                <TextField name="source.image" label="Image" placeholder="ghcr.io/acme/web:latest" required />
              ) : (
                <>
                  <TextField name="source.repository" label="Repository URL" placeholder="https://github.com/acme/web.git" required />
                  <div className="grid grid-cols-2 gap-3"><TextField name="source.branch" label="Branch" /><SelectField name="source.buildType" label="Build" options={[{ value: 'dockerfile', label: 'Dockerfile' }, { value: 'nixpacks', label: 'Nixpacks' }, { value: 'railpack', label: 'Railpack' }, { value: 'static', label: 'Static site' }]} /></div>
                  <div className="grid grid-cols-2 gap-3"><TextField name="source.buildPath" label="Build path" /><TextField name="source.dockerfile" label="Dockerfile" /></div>
                  <TextField name="source.token" label="Access token" type="password" autoComplete="off" hint="Only for a private repository. Stored encrypted." />
                </>
              )}
              <TextField name="config.port" label="Container port" type="number" placeholder="3000" hint="The port the app listens on, used when you add a domain." />
            </>
          )}
          {kind === 'compose' && <TextareaField name="config.composeFile" label="docker-compose.yml" rows={10} className="font-mono text-xs" required />}
          {DATABASE_KINDS.includes(kind) && kind !== 'redis' && <div className="grid grid-cols-2 gap-3"><TextField name="config.database.name" label="Database" placeholder="app" /><TextField name="config.database.user" label="User" placeholder="app" /></div>}
          {DATABASE_KINDS.includes(kind) && <p className="text-xs text-muted">A strong password is generated for you. You can view the connection string on the service page.</p>}
          {kind === 'application' && sourceType === 'git' && <SwitchField name="autoDeploy" label="Deploy on every push" description="Add the webhook shown on the service page to your repository." />}
        </Form>
      )}
    </Sheet>
  );
}

function SharedEnvSheet({ environment, onClose }) {
  const query = useQuery({ queryKey: ['deployments', 'env', environment.id], queryFn: () => deploymentsApi.environmentEnv(environment.id) });
  const [text, setText] = useState(null); const [error, setError] = useState(null); const [saving, setSaving] = useState(false);
  const value = text ?? query.data?.env ?? '';
  const save = async () => { setSaving(true); setError(null); try { await deploymentsApi.setEnvironmentEnv(environment.id, value); onClose(); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  return (
    <Sheet open onClose={onClose} title={`${environment.name} — shared variables`} description="Available to every service in this environment. A service’s own variables win." width="w-[28rem]" footer={<div className="flex justify-end gap-2"><Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={saving} onClick={save}>Save</Button></div>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea label="Variables" rows={14} value={value} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder={'NODE_ENV=production\nSENTRY_DSN=…'} hint="One NAME=value per line. Redeploy a service to apply changes." />
    </Sheet>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['deployments', 'project', projectId], queryFn: () => deploymentsApi.project(projectId), refetchInterval: 8000 });
  const servers = useQuery({ queryKey: ['deployments', 'servers'], queryFn: deploymentsApi.servers });
  const [envId, setEnvId] = useState(null); const [adding, setAdding] = useState(false); const [shared, setShared] = useState(false);
  const [newEnv, setNewEnv] = useState(false); const [envName, setEnvName] = useState(''); const [confirm, setConfirm] = useState(null); const [error, setError] = useState(null);
  const project = query.data?.project;
  const env = useMemo(() => project?.environments.find((e) => e.id === envId) ?? project?.environments[0], [project, envId]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments'] });
  if (query.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  const tabs = project.environments.map((e) => ({ id: e.id, label: e.name }));
  return (
    <div className="space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>}>
        <Button size="sm" variant="neutral" onClick={() => setConfirm({ type: 'project' })}><Icon name="trash" className="size-4" />Delete project</Button>
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />New service</Button>
      </PageToolbar>
      <div><h1 className="text-lg font-semibold text-ink">{project.name}</h1>{project.description && <p className="text-sm text-muted">{project.description}</p>}</div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1"><Tabs tabs={tabs} value={env.id} onChange={setEnvId} label="Environments" /></div>
        <Button size="sm" variant="ghost" onClick={() => setNewEnv(true)}><Icon name="plus" className="size-4" />Environment</Button>
        <Button size="sm" variant="neutral" onClick={() => setShared(true)}><Icon name="key" className="size-4" />Shared variables</Button>
        {env.services.length === 0 && project.environments.length > 1 && <Button size="sm" variant="ghost" className="text-danger!" onClick={() => setConfirm({ type: 'environment', env })}>Delete</Button>}
      </div>
      {env.services.length === 0 ? (
        <div className="grid place-items-center gap-3 py-14 text-center"><FeaturedIcon icon="cube" color="brand" size="xl" /><div><p className="text-base font-semibold text-ink">Nothing in {env.name} yet</p><p className="text-sm text-muted">Add an application, a Compose stack or a database.</p></div><Button size="sm" onClick={() => setAdding(true)}>New service</Button></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {env.services.map((s) => (
            <li key={s.id}>
              <Link to={`/app/deployments/s/${s.id}`} className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                <div className="flex items-start justify-between gap-3"><KindTile kind={s.kind} /><StatusBadge status={s.status} /></div>
                <h3 className="mt-4 truncate text-base font-semibold text-ink">{s.name}</h3>
                <p className="mt-0.5 truncate font-mono text-xs text-muted">{s.appName}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{s.domains.slice(0, 2).map((d) => <Badge key={d} tone="neutral">{d}</Badge>)}{s.domains.length > 2 && <Badge tone="neutral">+{s.domains.length - 2}</Badge>}</div>
                <p className="mt-auto pt-4 text-xs text-muted">Last deployed {ago(s.lastDeployedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewServiceSheet environment={env} servers={servers.data?.servers ?? []} onClose={() => setAdding(false)} onCreated={(s) => { refresh(); navigate(`/app/deployments/s/${s.id}`); }} />}
      {shared && <SharedEnvSheet environment={env} onClose={() => setShared(false)} />}
      <Dialog open={newEnv} onClose={() => setNewEnv(false)} label="New environment" className="max-w-sm">
        <form className="space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); if (!envName.trim()) return; try { const { environment } = await deploymentsApi.addEnvironment(projectId, envName.trim()); await refresh(); setEnvId(environment.id); setNewEnv(false); setEnvName(''); } catch (err) { setError(err.message); setNewEnv(false); } }}>
          <h2 className="text-base font-semibold text-ink">New environment</h2>
          <label className="block text-sm font-medium text-ink">Name<input autoFocus value={envName} onChange={(e) => setEnvName(e.target.value)} placeholder="staging" className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ring" /></label>
          <div className="flex justify-end gap-2"><Button variant="neutral" size="sm" type="button" onClick={() => setNewEnv(false)}>Cancel</Button><Button size="sm" type="submit">Create</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={Boolean(confirm)} danger confirmLabel="Delete" title={confirm?.type === 'project' ? `Delete ${project.name}?` : `Delete ${confirm?.env?.name}?`} description={confirm?.type === 'project' ? 'The project must have no services left.' : 'The environment must have no services.'}
        onConfirm={async () => { try { if (confirm.type === 'project') { await deploymentsApi.deleteProject(projectId); await refresh(); navigate('/app/deployments'); } else { await deploymentsApi.deleteEnvironment(confirm.env.id); setEnvId(null); await refresh(); } } catch (e) { setError(e.message); } }} onClose={() => setConfirm(null)} />
    </div>
  );
}
