import { useQuery, useQueryClient } from '@tanstack/react-query';
import { serverBodySchema } from '@app/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, ChartLegend } from '../../components/ui/charts/AreaChart.jsx';
import { z } from 'zod';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProgressBar } from '../../components/ui/ProgressBar.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { TerminalView } from './TerminalView.jsx';
import { LogView, StatusBadge, useDeploymentLog } from './parts.jsx';

function AddServerSheet({ onClose }) {
  const queryClient = useQueryClient();
  const { form, submit, formError } = useAppForm({
    schema: serverBodySchema, defaultValues: { name: '', host: '', port: 22, username: 'root', sshKey: '' },
    onSubmit: async (values) => { await deploymentsApi.addServer(values); await queryClient.invalidateQueries({ queryKey: ['deployments'] }); onClose(); },
  });
  return (
    <Sheet open onClose={onClose} title="Add a server" description="Quelli connects over SSH and runs Docker commands. The key is stored encrypted and never shown again." width="w-[28rem]"
      footer={<div className="flex justify-end gap-2"><Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button><SubmitButton size="sm" form="add-server">Add server</SubmitButton></div>}>
      <Form form={form} onSubmit={submit} error={formError} id="add-server">
        <TextField name="name" label="Name" placeholder="prod-1" required />
        <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><TextField name="host" label="Host or IP" placeholder="203.0.113.10" required /></div><TextField name="port" label="Port" type="number" /></div>
        <TextField name="username" label="User" hint="A user that can run Docker (root, or in the docker group)." />
        <TextareaField name="sshKey" label="Private key" rows={7} required className="font-mono text-xs" hint="Create one with ssh-keygen -t ed25519, add the .pub file to ~/.ssh/authorized_keys on the server, and paste the private key here." />
      </Form>
    </Sheet>
  );
}

function SetupDialog({ server, onClose, onStarted }) {
  const { form, submit, formError } = useAppForm({
    schema: z.object({ acmeEmail: z.string().trim().email('Enter an email address') }), defaultValues: { acmeEmail: '' },
    onSubmit: async ({ acmeEmail }) => { const { deployment } = await deploymentsApi.setupServer(server.id, acmeEmail); onStarted(deployment.id); },
  });
  return (
    <Dialog open onClose={onClose} label="Set up server" className="max-w-md">
      <div className="space-y-4 p-5">
        <div><h2 className="text-base font-semibold text-ink">Set up {server.name}</h2><p className="mt-1 text-sm text-muted">Installs Docker if it is missing, turns on Swarm, creates the shared network and starts Traefik for HTTPS. Safe to run again.</p></div>
        <Form form={form} onSubmit={submit} error={formError}>
          <TextField name="acmeEmail" label="Email for HTTPS certificates" placeholder="ops@yourcompany.com" hint="Let’s Encrypt sends expiry notices here." required autoFocus />
          <div className="flex justify-end gap-2"><Button variant="neutral" size="sm" type="button" onClick={onClose}>Cancel</Button><SubmitButton size="sm">Start setup</SubmitButton></div>
        </Form>
      </div>
    </Dialog>
  );
}

function LogSheet({ id, title, onClose }) {
  const { log, info } = useDeploymentLog(id);
  return (
    <Sheet open onClose={onClose} title={title} description={info ? undefined : 'Starting…'} width="w-[40rem]">
      {info && <div className="flex items-center gap-2"><StatusBadge status={info.status} of="deployment" /><span className="text-sm text-muted">{info.title}</span></div>}
      <LogView text={log} height="h-[32rem]" empty="Waiting for output…" />
    </Sheet>
  );
}

function ClusterSheet({ server, servers, onClose }) {
  const queryClient = useQueryClient();
  const nodes = useQuery({ queryKey: ['deployments', 'nodes', server.id], queryFn: () => deploymentsApi.nodes(server.id), retry: false });
  const [error, setError] = useState(null); const [busy, setBusy] = useState(null); const [managerId, setManagerId] = useState('');
  const others = servers.filter((s) => s.id !== server.id && s.status === 'ready');
  const act = (key, fn) => async () => { setBusy(key); setError(null); try { await fn(); await queryClient.invalidateQueries({ queryKey: ['deployments', 'nodes'] }); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const columns = [
    { key: 'hostname', label: 'Node', width: 150, render: (n) => <span className="font-medium">{n.hostname}</span> },
    { key: 'role', label: 'Role', width: 90, render: (n) => <Badge tone={n.role === 'manager' ? 'accent' : 'neutral'}>{n.role}{n.managerStatus === 'Leader' ? ' · leader' : ''}</Badge> },
    { key: 'status', label: 'Status', width: 90, render: (n) => <Badge tone={n.status === 'Ready' ? 'success' : 'danger'} dot>{n.status}</Badge> },
    { key: 'availability', label: 'Tasks', width: 90, render: (n) => n.availability },
    { key: 'a', label: '', width: 150, align: 'right', render: (n) => n.managerStatus === 'Leader' ? null : (
      <span className="flex justify-end gap-1">
        <Button size="sm" variant="neutral" loading={busy === `d${n.id}`} onClick={act(`d${n.id}`, () => deploymentsApi.nodeAction(server.id, n.id, n.availability === 'Active' ? 'drain' : 'active'))}>{n.availability === 'Active' ? 'Drain' : 'Activate'}</Button>
        <Button size="icon" variant="ghost" aria-label={`Remove ${n.hostname}`} loading={busy === `r${n.id}`} onClick={act(`r${n.id}`, () => deploymentsApi.nodeAction(server.id, n.id, 'remove'))}><Icon name="trash" className="size-4" /></Button>
      </span>) },
  ];
  return (
    <Sheet open onClose={onClose} title={`${server.name} — cluster`} description="Swarm nodes. Services are placed across ready, active nodes." width="w-[40rem]">
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      {nodes.isError ? <Alert tone="warning">{nodes.error.message}</Alert> : <DataTable columns={columns} rows={nodes.data?.nodes ?? []} loading={nodes.isPending} empty="No nodes." />}
      <div className="mt-6 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Join {server.name} to another cluster</h3>
        <p className="mt-1 text-xs text-muted">Makes this server a worker of the chosen manager. It must not run services of its own.</p>
        <div className="mt-3 flex gap-2">
          <Select aria-label="Manager server" value={managerId} onChange={setManagerId} options={[{ value: '', label: others.length ? 'Choose a manager' : 'No other ready server' }, ...others.map((s) => ({ value: s.id, label: s.name }))]} className="flex-1" />
          <Button size="sm" disabled={!managerId} loading={busy === 'join'} onClick={act('join', () => deploymentsApi.joinCluster(server.id, { managerId }))}>Join</Button>
        </div>
      </div>
    </Sheet>
  );
}

function ShellSheet({ server, onClose }) {
  return <Sheet open onClose={onClose} title={`${server.name} — terminal`} description="A shell on the server itself. Everything you type runs as the server’s SSH user." width="w-[48rem]"><TerminalView serverId={server.id} height="h-[75vh]" /></Sheet>;
}

function StatsSheet({ server, onClose }) {
  const stats = useQuery({ queryKey: ['deployments', 'server-stats', server.id], queryFn: () => deploymentsApi.serverStats(server.id), refetchInterval: 8000, retry: false });
  const history = useQuery({ queryKey: ['deployments', 'server-metrics', server.id], queryFn: () => deploymentsApi.serverMetrics(server.id), refetchInterval: 60_000 });
  const s = stats.data?.stats;
  return (
    <Sheet open onClose={onClose} title={`${server.name} — usage`} width="w-[28rem]">
      {stats.isError && <Alert tone="error">{stats.error.message}</Alert>}
      {s && (
        <div className="space-y-5">
          <div><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink">CPU</span><span className="text-muted">{s.cpuPercent}%</span></div><ProgressBar value={s.cpuPercent} label="CPU" warn /></div>
          <div><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink">Memory</span><span className="text-muted">{s.memUsedMb} / {s.memTotalMb} MB</span></div><ProgressBar value={s.memTotalMb ? (s.memUsedMb / s.memTotalMb) * 100 : 0} label="Memory" warn /></div>
          <div><div className="mb-1 flex justify-between text-sm"><span className="font-medium text-ink">Disk</span><span className="text-muted">{(s.diskUsedKb / 1048576).toFixed(1)} / {(s.diskTotalKb / 1048576).toFixed(1)} GB</span></div><ProgressBar value={s.diskTotalKb ? (s.diskUsedKb / s.diskTotalKb) * 100 : 0} label="Disk" warn /></div>
          {s.uptime && <p className="text-sm text-muted">{s.uptime}</p>}
        </div>
      )}
      {stats.isPending && <p className="text-sm text-muted">Reading the server…</p>}
      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Last 24 hours</h3>
      {(history.data?.metrics.length ?? 0) < 2 ? <p className="text-sm text-muted">History builds up as the server is sampled every 5 minutes.</p> : (
        <>
          <ChartLegend items={[{ label: 'CPU %', color: 'var(--accent)' }, { label: 'Memory %', color: 'var(--fi-orange)' }]} />
          <AreaChart height={180} labels={history.data.metrics.map((m) => m.at)} format={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} every={Math.ceil(history.data.metrics.length / 4)}
            series={[{ key: 'cpu', label: 'CPU %', color: 'var(--accent)', values: history.data.metrics.map((m) => Math.round(m.cpu)) }, { key: 'mem', label: 'Memory %', color: 'var(--fi-orange)', values: history.data.metrics.map((m) => (m.memTotalMb ? Math.round((m.memUsedMb / m.memTotalMb) * 100) : 0)) }]} />
        </>
      )}
    </Sheet>
  );
}

export default function ServersPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['deployments', 'servers'], queryFn: deploymentsApi.servers, refetchInterval: 10_000 });
  const [adding, setAdding] = useState(false); const [setup, setSetup] = useState(null); const [log, setLog] = useState(null); const [stats, setStats] = useState(null); const [cluster, setCluster] = useState(null); const [shell, setShell] = useState(null);
  const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(null); const [error, setError] = useState(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments'] });
  const test = async (s) => { setBusy(s.id); setError(null); try { await deploymentsApi.testServer(s.id); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const columns = [
    { key: 'name', label: 'Server', width: 220, render: (s) => <span className="flex min-w-0 items-center gap-3"><Icon name="server" className="size-5 shrink-0 text-placeholder" /><span className="min-w-0"><span className="block truncate font-medium text-ink">{s.name}</span><span className="block truncate font-mono text-xs text-muted">{s.kind === 'local' ? 'this machine' : `${s.username}@${s.host}:${s.port}`}</span></span></span> },
    { key: 'status', label: 'Status', width: 260, render: (s) => <span className="flex min-w-0 items-center gap-2"><StatusBadge status={s.status} of="server" /><span className="truncate text-xs text-muted" title={s.statusMessage ?? ''}>{s.statusMessage ?? ''}</span></span> },
    { key: 'docker', label: 'Docker', width: 100, render: (s) => (s.dockerVersion ? <span className="font-mono text-xs text-muted">{s.dockerVersion}</span> : <span className="text-placeholder">—</span>) },
    { key: 'services', label: 'Services', width: 90, render: (s) => s.services },
    { key: 'actions', label: '', width: 150, align: 'right', render: (s) => (
      <span className="flex items-center justify-end gap-1">
        <Button size="sm" variant="neutral" loading={busy === s.id} onClick={(e) => { e.stopPropagation(); test(s); }}>Test</Button>
        <DropdownMenu>
          <DropdownMenuTrigger>{(props) => <button type="button" aria-label={`Actions for ${s.name}`} {...props} className="grid size-8 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name="more-horizontal" className="size-5" /></button>}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem icon="rocket" onSelect={() => setSetup(s)}>Set up server</DropdownMenuItem>
            <DropdownMenuItem icon="activity" onSelect={() => setStats(s)}>Usage</DropdownMenuItem>
            <DropdownMenuItem icon="layers" onSelect={() => setCluster(s)}>Cluster</DropdownMenuItem>
            <DropdownMenuItem icon="terminal" onSelect={() => setShell(s)}>Terminal</DropdownMenuItem>
            <DropdownMenuItem icon="trash" onSelect={() => setConfirm(s)}>Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    ) },
  ];
  return (
    <div className="space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>}>
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />Add server</Button>
      </PageToolbar>
      {error && <Alert tone="error">{error}</Alert>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      <DataTable columns={columns} rows={query.data?.servers ?? []} loading={query.isPending} storageKey="deployments:servers" empty="No servers yet. Add one to start deploying." />
      {adding && <AddServerSheet onClose={() => setAdding(false)} />}
      {setup && <SetupDialog server={setup} onClose={() => setSetup(null)} onStarted={(id) => { setLog({ id, title: `Setting up ${setup.name}` }); setSetup(null); refresh(); }} />}
      {log && <LogSheet id={log.id} title={log.title} onClose={() => { setLog(null); refresh(); }} />}
      {stats && <StatsSheet server={stats} onClose={() => setStats(null)} />}
      {shell && <ShellSheet server={shell} onClose={() => setShell(null)} />}
      {cluster && <ClusterSheet server={cluster} servers={query.data?.servers ?? []} onClose={() => setCluster(null)} />}
      <ConfirmDialog open={Boolean(confirm)} danger confirmLabel="Remove server" title={`Remove ${confirm?.name}?`} description="Quelli forgets the server and its key. Anything running on it keeps running." onConfirm={async () => { try { await deploymentsApi.deleteServer(confirm.id); await refresh(); } catch (e) { setError(e.message); } }} onClose={() => setConfirm(null)} />
    </div>
  );
}
