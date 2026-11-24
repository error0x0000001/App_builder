import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATABASE_KINDS, domainBodySchema, jobBodySchema } from '@app/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, SwitchField, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Textarea } from '../../components/ui/Textarea.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { CopyField, KINDS, KindTile, LogView, StatusBadge, ago, duration, useCan, useDeploymentLog } from './parts.jsx';

const Section = ({ title, description, action, children }) => (
  <section className="rounded-xl border border-line bg-surface p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted">{description}</p>}</div>{action}</div>
    {children}
  </section>
);
const Row = ({ label, children }) => <div className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 text-sm first:border-t-0"><dt className="text-muted">{label}</dt><dd className="min-w-0 truncate text-right font-medium text-ink">{children}</dd></div>;

function LogSheet({ deploymentId, onClose }) {
  const { log, info } = useDeploymentLog(deploymentId);
  return (
    <Sheet open onClose={onClose} title={info?.title ?? 'Deployment'} description={info ? `${info.kind} · started ${ago(info.startedAt)}` : undefined} width="w-[44rem]">
      {info && <div className="mb-3 flex items-center gap-2"><StatusBadge status={info.status} of="deployment" />{info.commit && <Badge tone="neutral">{info.commit.slice(0, 7)}</Badge>}<span className="text-xs text-muted">{duration(info.startedAt, info.finishedAt)}</span></div>}
      <LogView text={log} height="h-[70vh]" empty="Waiting for output…" />
    </Sheet>
  );
}

function Overview({ service, secrets, reveal, openLog }) {
  const isDb = DATABASE_KINDS.includes(service.kind);
  const src = service.source ?? {};
  const origin = window.location.origin;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Details">
        <dl>
          <Row label="Type">{KINDS[service.kind]?.label}</Row>
          <Row label="Internal name"><span className="font-mono text-xs">{service.appName}</span></Row>
          {src.type === 'docker' && <Row label="Image"><span className="font-mono text-xs">{src.image}</span></Row>}
          {src.type === 'git' && <><Row label="Repository"><span className="font-mono text-xs">{src.repository}</span></Row><Row label="Branch">{src.branch}</Row><Row label="Build">{src.buildType}</Row></>}
          <Row label="Last deployed">{ago(service.lastDeployedAt)}</Row>
          <Row label="Auto deploy">{service.autoDeploy ? 'On' : 'Off'}</Row>
        </dl>
      </Section>
      {isDb ? (
        <Section title="Connection" description="Reachable by other services on the same server network." action={!secrets && <Button size="sm" variant="neutral" onClick={reveal}><Icon name="eye" className="size-4" />Reveal</Button>}>
          {secrets ? <div className="space-y-3"><CopyField label="connection string" value={secrets.connectionUrl} /><p className="text-xs text-muted">Password: <span className="font-mono text-ink">{secrets.databasePassword}</span></p></div> : <p className="text-sm text-muted">The password is stored encrypted. Revealing it is recorded in the audit trail.</p>}
        </Section>
      ) : (
        <Section title="Push to deploy" description="Add this webhook to your Git provider so a push deploys.">
          <div className="space-y-3">
            <CopyField label="webhook URL" value={`${origin}${service.webhookPath}`} />
            {secrets ? <CopyField label="webhook secret" value={secrets.webhookSecret} /> : <Button size="sm" variant="neutral" onClick={reveal}><Icon name="eye" className="size-4" />Reveal secret</Button>}
            <p className="text-xs text-muted">GitHub: content type JSON, secret above. GitLab / Gitea: put the secret in the token field.</p>
          </div>
        </Section>
      )}
      {service.domains.length > 0 && (
        <Section title="Domains"><ul className="space-y-2">{service.domains.map((d) => <li key={d.id}><a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"><Icon name="link" className="size-4" />{d.url}</a></li>)}</ul></Section>
      )}
    </div>
  );
}

function DeploymentsTab({ service, onRollback }) {
  const query = useQuery({ queryKey: ['deployments', 'list', service.id], queryFn: () => deploymentsApi.deployments(service.id), refetchInterval: 5000 });
  const [open, setOpen] = useState(null);
  const rows = query.data?.deployments ?? [];
  const columns = [
    { key: 'title', label: 'Deployment', width: 280, render: (d) => <span className="font-medium">{d.title}</span> },
    { key: 'status', label: 'Status', width: 130, render: (d) => <StatusBadge status={d.status} of="deployment" /> },
    { key: 'kind', label: 'Kind', width: 110, render: (d) => <Badge tone="neutral">{d.kind}</Badge> },
    { key: 'commit', label: 'Commit', width: 110, render: (d) => <span className="font-mono text-xs">{d.commit?.slice(0, 7) ?? '—'}</span> },
    { key: 'startedAt', label: 'Started', width: 140, render: (d) => ago(d.startedAt) },
    { key: 'took', label: 'Took', width: 90, render: (d) => duration(d.startedAt, d.finishedAt) },
    { key: 'a', label: '', width: 120, render: (d) => d.status === 'done' && d.image ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onRollback(d); }}>Roll back</Button> : null },
  ];
  return (<>
    <DataTable columns={columns} rows={rows} loading={query.isPending} empty="Nothing deployed yet." onRowClick={(d) => setOpen(d.id)} storageKey="dp-deployments" />
    {open && <LogSheet deploymentId={open} onClose={() => setOpen(null)} />}
  </>);
}

function LogsTab({ service }) {
  const [auto, setAuto] = useState(true);
  const query = useQuery({ queryKey: ['deployments', 'logs', service.id], queryFn: () => deploymentsApi.logs(service.id), refetchInterval: auto ? 4000 : false, retry: false });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><Switch checked={auto} onChange={(e) => setAuto(e.target.checked)} label="Follow" /><Button size="sm" variant="neutral" onClick={() => query.refetch()}><Icon name="refresh" className="size-4" />Refresh</Button></div>
      {query.isError ? <Alert tone="error">{query.error.message}</Alert> : <LogView text={query.data?.log} height="h-[60vh]" empty={query.isPending ? 'Loading…' : 'No output from the containers.'} />}
    </div>
  );
}

function EnvTab({ service, secrets, reveal, onSaved }) {
  const [text, setText] = useState(null); const [saving, setSaving] = useState(false); const [error, setError] = useState(null); const [saved, setSaved] = useState(false);
  if (!secrets) return <Section title="Environment variables" description="Stored encrypted. Revealing them is recorded in the audit trail." action={<Button size="sm" variant="neutral" onClick={reveal}><Icon name="eye" className="size-4" />Reveal</Button>}><p className="text-sm text-muted">{service.hasEnv ? 'Variables are set.' : 'No variables yet.'}</p></Section>;
  const value = text ?? secrets.env;
  const save = async () => { setSaving(true); setError(null); try { await deploymentsApi.setServiceEnv(service.id, value); setSaved(true); onSaved(); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  return (
    <Section title="Environment variables" description="One NAME=value per line. Changes apply on the next deploy." action={<Button size="sm" loading={saving} onClick={save}>Save</Button>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      {saved && <Alert tone="success" className="mb-3">Saved. Deploy to apply.</Alert>}
      <Textarea label="Variables" rows={14} value={value} onChange={(e) => { setText(e.target.value); setSaved(false); }} className="font-mono text-xs" />
    </Section>
  );
}

function DomainsTab({ service, onChange }) {
  const [adding, setAdding] = useState(false); const [error, setError] = useState(null);
  const { form, submit, formError } = useAppForm({ schema: domainBodySchema, defaultValues: { host: '', path: '/', port: service.config?.port ?? '', https: true }, onSubmit: async (v) => { await deploymentsApi.addDomain(service.id, v); setAdding(false); form.reset(); onChange(); } });
  const unsupported = service.kind === 'compose' || DATABASE_KINDS.includes(service.kind);
  return (
    <Section title="Domains" description="Point the domain’s DNS at your server. HTTPS certificates are issued automatically." action={!unsupported && <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />Add domain</Button>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      {unsupported ? <p className="text-sm text-muted">{service.kind === 'compose' ? 'Compose stacks route through Traefik labels in their Compose file.' : 'Databases are not published on a domain.'}</p> : service.domains.length === 0 ? <p className="text-sm text-muted">No domains yet.</p> : (
        <ul className="divide-y divide-line">{service.domains.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-3"><Icon name="link" className="size-4 text-placeholder" /><a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-link hover:underline">{d.url}</a><Badge tone="neutral">port {d.port}</Badge>{d.https && <Badge tone="success">HTTPS</Badge>}<Button size="icon" variant="ghost" aria-label={`Remove ${d.host}`} onClick={async () => { try { await deploymentsApi.removeDomain(service.id, d.id); onChange(); } catch (e) { setError(e.message); } }}><Icon name="trash" className="size-4" /></Button></li>
        ))}</ul>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} label="Add domain" className="max-w-md">
        <div className="space-y-4 p-5"><h2 className="text-base font-semibold text-ink">Add domain</h2>
          <Form form={form} onSubmit={submit} error={formError}>
            <TextField name="host" label="Domain" placeholder="app.example.com" autoFocus required />
            <div className="grid grid-cols-2 gap-3"><TextField name="path" label="Path" /><TextField name="port" label="Container port" type="number" required /></div>
            <SwitchField name="https" label="HTTPS" description="Request a Let’s Encrypt certificate." />
            <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={() => setAdding(false)}>Cancel</Button><SubmitButton size="sm">Add</SubmitButton></div>
          </Form>
        </div>
      </Dialog>
    </Section>
  );
}

const PRESETS = [{ value: '0 3 * * *', label: 'Every day at 03:00' }, { value: '0 * * * *', label: 'Every hour' }, { value: '*/15 * * * *', label: 'Every 15 minutes' }, { value: '0 3 * * 0', label: 'Every Sunday at 03:00' }];
function JobsTab({ service, onChange }) {
  const isDb = DATABASE_KINDS.includes(service.kind);
  const [adding, setAdding] = useState(false); const [error, setError] = useState(null);
  const { form, submit, formError } = useAppForm({ schema: jobBodySchema, defaultValues: { kind: isDb ? 'backup' : 'command', name: '', cron: '0 3 * * *', command: '', keep: 7, enabled: true }, onSubmit: async (v) => { await deploymentsApi.addJob(service.id, v); setAdding(false); form.reset(); onChange(); } });
  const kind = form.watch('kind');
  const act = (fn) => async () => { try { await fn(); onChange(); } catch (e) { setError(e.message); } };
  return (
    <Section title={isDb ? 'Backups & schedules' : 'Schedules'} description={isDb ? 'Dumps are uploaded to your connected S3 / MinIO storage in Integrations.' : 'Run a command inside the service on a cron schedule (UTC).'} action={<Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />New schedule</Button>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      {service.jobs.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
        <ul className="divide-y divide-line">{service.jobs.map((j) => (
          <li key={j.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{j.name} <Badge tone={j.kind === 'backup' ? 'accent' : 'neutral'}>{j.kind}</Badge></p><p className="truncate font-mono text-xs text-muted">{j.cron}{j.command ? ` · ${j.command}` : ''} · last run {ago(j.lastRunAt)}</p></div>
            <Switch checked={j.enabled} onChange={(e) => act(() => deploymentsApi.updateJob(service.id, j.id, { enabled: e.target.checked }))()} label="Enabled" />
            <Button size="sm" variant="neutral" onClick={act(() => deploymentsApi.runJob(service.id, j.id))}>Run now</Button>
            <Button size="icon" variant="ghost" aria-label={`Delete ${j.name}`} onClick={act(() => deploymentsApi.deleteJob(service.id, j.id))}><Icon name="trash" className="size-4" /></Button>
          </li>
        ))}</ul>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} label="New schedule" className="max-w-md">
        <div className="space-y-4 p-5"><h2 className="text-base font-semibold text-ink">New schedule</h2>
          <Form form={form} onSubmit={submit} error={formError}>
            {isDb && <SelectField name="kind" label="Type" options={[{ value: 'backup', label: 'Backup' }, { value: 'command', label: 'Command' }]} />}
            <TextField name="name" label="Name" placeholder={kind === 'backup' ? 'Nightly backup' : 'Clean up'} autoFocus required />
            <TextField name="cron" label="Schedule (cron, UTC)" hint={PRESETS.map((p) => `${p.value} = ${p.label}`).join(' · ')} required />
            {kind === 'command' ? <TextField name="command" label="Command" placeholder="php artisan schedule:run" required /> : <TextField name="keep" label="Backups to keep" type="number" />}
            <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={() => setAdding(false)}>Cancel</Button><SubmitButton size="sm">Create</SubmitButton></div>
          </Form>
        </div>
      </Dialog>
    </Section>
  );
}

function MonitoringTab({ service }) {
  const query = useQuery({ queryKey: ['deployments', 'stats', service.id], queryFn: () => deploymentsApi.stats(service.id), refetchInterval: 5000, retry: false });
  const rows = query.data?.stats ?? [];
  const bar = (pct) => { const n = Math.min(100, parseFloat(pct) || 0); return <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${n}%` }} /></div><span className="text-xs text-muted">{pct}</span></div>; };
  const columns = [
    { key: 'name', label: 'Container', width: 280, render: (r) => <span className="font-mono text-xs">{r.name}</span> },
    { key: 'cpu', label: 'CPU', width: 160, render: (r) => bar(r.cpu) },
    { key: 'memory', label: 'Memory', width: 240, render: (r) => <span className="text-xs">{r.memory} <span className="text-muted">({r.memoryPercent})</span></span> },
    { key: 'network', label: 'Network I/O', width: 170, render: (r) => <span className="text-xs">{r.network}</span> },
    { key: 'disk', label: 'Disk I/O', width: 170, render: (r) => <span className="text-xs">{r.disk}</span> },
  ];
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  return <DataTable columns={columns} rows={rows} rowKey="name" loading={query.isPending} empty="No running containers." storageKey="dp-stats" />;
}

function SettingsTab({ service, onChange, onDelete }) {
  const isGit = service.source?.type === 'git'; const isImage = service.source?.type === 'docker' && service.kind === 'application';
  const schema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(60), autoDeploy: z.boolean(), image: z.string().optional(), branch: z.string().optional(), port: z.union([z.literal(''), z.coerce.number().int().min(1).max(65535)]).optional(), replicas: z.coerce.number().int().min(0).max(50), previews: z.boolean().optional(), previewDomain: z.string().trim().toLowerCase().optional() });
  const { form, submit, formError } = useAppForm({ schema, defaultValues: { name: service.name, autoDeploy: service.autoDeploy, image: service.source?.image ?? '', branch: service.source?.branch ?? '', port: service.config?.port ?? '', replicas: service.config?.replicas ?? 1, previews: service.config?.previews?.enabled ?? false, previewDomain: service.config?.previews?.domain ?? '' },
    onSubmit: async (v) => {
      const body = { name: v.name, autoDeploy: v.autoDeploy, config: { replicas: v.replicas, ...(v.port ? { port: v.port } : {}), ...(isGit ? { previews: { enabled: Boolean(v.previews), domain: v.previewDomain || '' } } : {}) } };
      if (isImage) body.source = { ...service.source, image: v.image };
      if (isGit) body.source = { ...service.source, branch: v.branch };
      await deploymentsApi.updateService(service.id, body); onChange();
    } });
  return (
    <div className="max-w-2xl space-y-4">
      <Section title="Settings" description="Redeploy to apply changes to the running service.">
        <Form form={form} onSubmit={submit} error={formError}>
          <TextField name="name" label="Name" required />
          {isImage && <TextField name="image" label="Image" />}
          {isGit && <TextField name="branch" label="Branch" />}
          {service.kind === 'application' && <TextField name="port" label="Container port" type="number" />}
          {service.kind !== 'compose' && <TextField name="replicas" label="Replicas" type="number" />}
          {service.kind === 'application' && <SwitchField name="autoDeploy" label="Deploy on every push" />}
          {isGit && <SwitchField name="previews" label="Preview deployments" description="A push to any other branch deploys a throw-away copy; deleting the branch removes it." />}
          {isGit && form.watch('previews') && <TextField name="previewDomain" label="Preview domain" placeholder="preview.example.com" hint="Each branch gets branch-name-app.<this domain>. Point a wildcard DNS record at your server." />}
          <div className="flex justify-end"><SubmitButton size="sm">Save changes</SubmitButton></div>
        </Form>
      </Section>
      <Section title="Danger zone" description="Stops the service on its server and removes it from Quelli."><Button variant="neutral" size="sm" className="text-danger!" onClick={onDelete}><Icon name="trash" className="size-4" />Delete service</Button></Section>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'file-code' }, { id: 'deployments', label: 'Deployments', icon: 'rocket' }, { id: 'logs', label: 'Logs', icon: 'terminal' },
  { id: 'environment', label: 'Environment', icon: 'key' }, { id: 'domains', label: 'Domains', icon: 'link' }, { id: 'schedules', label: 'Schedules', icon: 'clock' },
  { id: 'monitoring', label: 'Monitoring', icon: 'activity' }, { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function ServicePage() {
  const { serviceId, '*': rest } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const tab = TABS.some((t) => t.id === rest) ? rest : 'overview';
  const can = useCan();
  const query = useQuery({ queryKey: ['deployments', 'service', serviceId], queryFn: () => deploymentsApi.service(serviceId), refetchInterval: 6000 });
  const [secrets, setSecrets] = useState(null); const [error, setError] = useState(null); const [busy, setBusy] = useState(null);
  const [logId, setLogId] = useState(null); const [confirm, setConfirm] = useState(null);
  useEffect(() => { setSecrets(null); }, [serviceId]);
  const service = query.data?.service;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments'] });
  if (query.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  const tabs = TABS.filter((t) => can('manager') || !['environment', 'domains', 'settings'].includes(t.id));
  const run = (name, fn, openLog) => async () => { setBusy(name); setError(null); try { const r = await fn(); await refresh(); if (openLog && r?.deployment) setLogId(r.deployment.id); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const reveal = async () => { try { setSecrets(await deploymentsApi.secrets(serviceId)); } catch (e) { setError(e.message); } };
  const live = service.status === 'done' || service.status === 'error';
  return (
    <div className="space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>}>
        {can('deployer') && (service.status === 'stopped' ? <Button size="sm" variant="neutral" loading={busy === 'start'} onClick={run('start', () => deploymentsApi.start(serviceId))}><Icon name="play-circle" className="size-4" />Start</Button> : live && <Button size="sm" variant="neutral" loading={busy === 'stop'} onClick={run('stop', () => deploymentsApi.stop(serviceId))}><Icon name="stop-circle" className="size-4" />Stop</Button>)}
        {can('deployer') && <Button size="sm" loading={busy === 'deploy'} disabled={service.status === 'running'} onClick={run('deploy', () => deploymentsApi.deploy(serviceId), true)}><Icon name="rocket" className="size-4" />{service.lastDeployedAt ? 'Redeploy' : 'Deploy'}</Button>}
      </PageToolbar>
      <div className="flex items-center gap-3"><KindTile kind={service.kind} size="lg" /><div className="min-w-0"><h1 className="truncate text-lg font-semibold text-ink">{service.name}</h1><div className="mt-0.5 flex items-center gap-2"><StatusBadge status={service.status} />{!service.serverId && <Badge tone="warning">No server</Badge>}</div></div></div>
      {error && <Alert tone="error">{error}</Alert>}
      <Tabs tabs={tabs} value={tab} onChange={(id) => navigate(id === 'overview' ? `/app/deployments/s/${serviceId}` : `/app/deployments/s/${serviceId}/${id}`)} label="Service" />
      {tab === 'overview' && <Overview service={service} secrets={secrets} reveal={reveal} openLog={setLogId} />}
      {tab === 'deployments' && <DeploymentsTab service={service} onRollback={(d) => setConfirm({ type: 'rollback', d })} />}
      {tab === 'logs' && <LogsTab service={service} />}
      {tab === 'environment' && <EnvTab service={service} secrets={secrets} reveal={reveal} onSaved={refresh} />}
      {tab === 'domains' && <DomainsTab service={service} onChange={refresh} />}
      {tab === 'schedules' && <JobsTab service={service} onChange={refresh} />}
      {tab === 'monitoring' && <MonitoringTab service={service} />}
      {tab === 'settings' && <SettingsTab service={service} onChange={refresh} onDelete={() => setConfirm({ type: 'delete' })} />}
      {logId && <LogSheet deploymentId={logId} onClose={() => setLogId(null)} />}
      <ConfirmDialog open={Boolean(confirm)} danger={confirm?.type === 'delete'} confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Roll back'} title={confirm?.type === 'delete' ? `Delete ${service.name}?` : 'Roll back to this deployment?'} description={confirm?.type === 'delete' ? 'The service is stopped and removed. Volumes on the server are kept.' : `Runs the image from “${confirm?.d?.title}” again.`}
        onConfirm={async () => { try { if (confirm.type === 'delete') { await deploymentsApi.deleteService(serviceId); await refresh(); navigate('/app/deployments'); } else { const { deployment } = await deploymentsApi.rollback(serviceId, confirm.d.id); await refresh(); setLogId(deployment.id); } } catch (e) { setError(e.message); } }} onClose={() => setConfirm(null)} />
    </div>
  );
}
