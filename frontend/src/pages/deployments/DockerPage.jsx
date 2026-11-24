import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { LogView } from './parts.jsx';

const TONE = { running: 'success', exited: 'neutral', paused: 'warning', restarting: 'warning', created: 'neutral', dead: 'danger' };

function ContainerLogs({ serverId, container, onClose }) {
  const query = useQuery({ queryKey: ['deployments', 'container-logs', container.id], queryFn: () => deploymentsApi.containerLogs(serverId, container.id), refetchInterval: 4000, retry: false });
  return <Sheet open onClose={onClose} title={container.name} description={container.image} width="w-[44rem]">{query.isError ? <Alert tone="error">{query.error.message}</Alert> : <LogView text={query.data?.log} height="h-[75vh]" empty={query.isPending ? 'Loading…' : 'No output.'} />}</Sheet>;
}

/** Plain Docker on a server: every container, with start / stop / restart / remove and logs (Dokploy's Docker page). */
export default function DockerPage() {
  const queryClient = useQueryClient();
  const servers = useQuery({ queryKey: ['deployments', 'servers'], queryFn: deploymentsApi.servers });
  const ready = (servers.data?.servers ?? []).filter((s) => s.status === 'ready');
  const [serverId, setServerId] = useState(null);
  useEffect(() => { if (!serverId && ready[0]) setServerId(ready[0].id); }, [ready, serverId]);
  const query = useQuery({ queryKey: ['deployments', 'containers', serverId], queryFn: () => deploymentsApi.containers(serverId), enabled: Boolean(serverId), refetchInterval: 8000, retry: false });
  const [error, setError] = useState(null); const [logs, setLogs] = useState(null); const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(null);
  const act = async (c, action) => { setBusy(c.id); setError(null); try { await deploymentsApi.containerAction(serverId, c.id, action); await queryClient.invalidateQueries({ queryKey: ['deployments', 'containers', serverId] }); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const columns = [
    { key: 'name', label: 'Container', width: 230, render: (c) => <span className="font-mono text-xs font-medium">{c.name}</span> },
    { key: 'image', label: 'Image', width: 210, render: (c) => <span className="font-mono text-xs">{c.image}</span> },
    { key: 'state', label: 'State', width: 110, render: (c) => <Badge tone={TONE[c.state] ?? 'neutral'} dot>{c.state}</Badge> },
    { key: 'status', label: 'Status', width: 150 },
    { key: 'ports', label: 'Ports', width: 190, render: (c) => <span className="font-mono text-xs">{c.ports || '—'}</span> },
    { key: 'a', label: '', width: 70, align: 'right', render: (c) => (
      <DropdownMenu>
        <DropdownMenuTrigger>{(props) => <button type="button" aria-label={`Actions for ${c.name}`} {...props} className="grid size-8 place-items-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"><Icon name={busy === c.id ? 'refresh' : 'more-horizontal'} className="size-5" /></button>}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem icon="terminal" onSelect={() => setLogs(c)}>Logs</DropdownMenuItem>
          {c.state === 'running' ? <DropdownMenuItem icon="stop-circle" onSelect={() => act(c, 'stop')}>Stop</DropdownMenuItem> : <DropdownMenuItem icon="play-circle" onSelect={() => act(c, 'start')}>Start</DropdownMenuItem>}
          <DropdownMenuItem icon="refresh" onSelect={() => act(c, 'restart')}>Restart</DropdownMenuItem>
          <DropdownMenuItem icon="trash" onSelect={() => setConfirm(c)}>Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];
  return (
    <div className="space-y-5">
      <div><h1 className="text-lg font-semibold text-ink">Docker</h1><p className="text-sm text-muted">Every container on a server, including ones Quelli did not create.</p></div>
      {ready.length > 1 && <Tabs tabs={ready.map((s) => ({ id: s.id, label: s.name }))} value={serverId} onChange={setServerId} label="Servers" />}
      {servers.isSuccess && ready.length === 0 && <Alert tone="warning">Add a server and run its setup first.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {serverId && <DataTable columns={columns} rows={query.data?.containers ?? []} loading={query.isPending} empty="No containers." storageKey="dp-docker" />}
      {logs && <ContainerLogs serverId={serverId} container={logs} onClose={() => setLogs(null)} />}
      <ConfirmDialog open={Boolean(confirm)} danger confirmLabel="Remove" title={`Remove ${confirm?.name}?`} description="The container is stopped and deleted. Its volumes are kept." onConfirm={async () => { await act(confirm, 'remove'); }} onClose={() => setConfirm(null)} />
    </div>
  );
}
