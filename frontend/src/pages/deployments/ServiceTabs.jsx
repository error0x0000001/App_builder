import { DATABASE_KINDS } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { cn } from '../../lib/cn.js';
import { TerminalView } from './TerminalView.jsx';
import { LogView, useCan } from './parts.jsx';
import { Panel } from './ui.jsx';

/** A code box: monospace textarea with line numbers that scroll with it. No editor library — it is a plain textarea. */
export function CodeEditor({ value, onChange, readOnly, rows = 24, className }) {
  const gutter = useRef(null);
  const lines = value.split('\n').length;
  return (
    <div className={cn('flex overflow-hidden rounded-xl border border-line bg-surface-2 font-mono text-xs leading-5 focus-within:border-accent focus-within:ring-4 focus-within:ring-ring', className)}>
      <div ref={gutter} aria-hidden="true" className="select-none overflow-hidden border-r border-line bg-[color-mix(in_srgb,var(--ink)_4%,var(--surface))] px-2 py-3 text-right text-placeholder" style={{ height: `${rows * 1.25}rem` }}>
        {Array.from({ length: Math.max(lines, rows) }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea
        value={value} readOnly={readOnly} spellCheck={false} wrap="off" aria-label="Compose file" onChange={(e) => onChange?.(e.target.value)}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        onKeyDown={(e) => { if (e.key === 'Tab' && !readOnly) { e.preventDefault(); const t = e.currentTarget; const { selectionStart: a, selectionEnd: b } = t; onChange?.(`${value.slice(0, a)}  ${value.slice(b)}`); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; }); } }}
        className="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-3 text-ink outline-none" style={{ height: `${rows * 1.25}rem` }}
      />
    </div>
  );
}

/** Edit the Compose file of a Compose service (templates included) with live checking; saving asks to redeploy. */
export function ComposeTab({ service, onSaved, onRedeploy }) {
  const can = useCan()('manager');
  const query = useQuery({ queryKey: ['deployments', 'compose', service.id], queryFn: () => deploymentsApi.compose(service.id) });
  const [text, setText] = useState(null); const [check, setCheck] = useState(null); const [saving, setSaving] = useState(false); const [error, setError] = useState(null); const [saved, setSaved] = useState(false);
  const value = text ?? query.data?.composeFile ?? '';
  useEffect(() => {
    if (text === null) { setCheck(query.data?.validation ?? null); return undefined; }
    const t = setTimeout(async () => { try { setCheck((await deploymentsApi.validateCompose(text)).validation); } catch { /* keep the last result */ } }, 350);
    return () => clearTimeout(t);
  }, [text, query.data]);
  const dirty = text !== null && text !== query.data?.composeFile;
  const save = async () => { setSaving(true); setError(null); try { await deploymentsApi.saveCompose(service.id, value); setSaved(true); await query.refetch(); setText(null); onSaved(); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel icon="file-code" color="indigo" title="docker-compose.yml" description={dirty ? 'Unsaved changes' : 'Saved'}
        action={can && <div className="flex gap-2">{dirty && <Button size="sm" variant="neutral" onClick={() => { setText(null); setSaved(false); }}>Discard</Button>}<Button size="sm" loading={saving} disabled={!dirty || check?.ok === false} onClick={save}>Save</Button></div>}>
        {query.isError ? <Alert tone="error">{query.error.message}</Alert> : (
          <div className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            {saved && !dirty && <Alert tone="success">Saved. <button type="button" onClick={onRedeploy} className="font-semibold underline">Redeploy</button> to apply it.</Alert>}
            <CodeEditor value={value} onChange={can ? setText : undefined} readOnly={!can} rows={26} />
          </div>
        )}
      </Panel>
      <div className="space-y-4">
        <Panel icon={check?.ok === false ? 'alert' : 'check-circle'} color={check?.ok === false ? 'error' : 'success'} title="Check" description={check?.ok === false ? 'Fix this before saving' : 'Looks runnable'}>
          {check?.ok === false ? <p className="text-sm text-danger">{check.error}</p> : check ? (
            <div className="space-y-3">
              <div><p className="mb-1.5 text-xs font-medium text-muted">Services</p><div className="flex flex-wrap gap-1.5">{check.services.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div></div>
              {check.warnings.length > 0 && <ul className="space-y-1.5 text-xs text-warning">{check.warnings.map((w) => <li key={w} className="flex gap-1.5"><Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />{w}</li>)}</ul>}
            </div>
          ) : <p className="text-sm text-muted">Checking…</p>}
        </Panel>
        <Panel icon="info" color="blue" title="Good to know">
          <ul className="space-y-2 text-xs text-muted">
            <li>Domains are added on the Domains tab; Quelli adds the routing labels when it deploys.</li>
            <li>Environment variables come from the Environment tab and are available as <span className="font-mono text-ink">${'{NAME}'}</span> in this file.</li>
            {query.data?.templateId && <li>Created from the <span className="font-medium text-ink">{query.data.templateId}</span> template.</li>}
            {query.data?.mounts?.length > 0 && <li>Files written next to it: <span className="font-mono">{query.data.mounts.join(', ')}</span> (use <span className="font-mono">../files/…</span>).</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

const QUICK = [['ls -la', 'Files'], ['env', 'Environment'], ['ps aux', 'Processes'], ['df -h', 'Disk'], ['cat /etc/os-release', 'OS'], ['id', 'Who am I']];

/** A real terminal in the container (left) and a one-shot command runner with history (right). */
export function TerminalTab({ service }) {
  const control = useRef(null); const [state, setState] = useState('connecting');
  const [command, setCommand] = useState(''); const [running, setRunning] = useState(false); const [history, setHistory] = useState([]); const [error, setError] = useState(null);
  const run = async (cmd = command) => {
    if (!cmd.trim()) return; setRunning(true); setError(null);
    try { const r = await deploymentsApi.exec(service.id, cmd); setHistory((h) => [{ id: Date.now(), cmd, ...r }, ...h].slice(0, 12)); setCommand(''); } catch (e) { setError(e.message); } finally { setRunning(false); }
  };
  const last = history[0];
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel icon="terminal" color="orange" title="Terminal" description={`sh / bash in ${service.name}`}
        action={<div className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', state === 'open' ? 'bg-success' : state === 'connecting' ? 'bg-warning' : 'bg-line-strong')} /><span className="text-xs text-muted">{state === 'open' ? 'Connected' : state === 'connecting' ? 'Connecting' : 'Closed'}</span><Button size="sm" variant="ghost" onClick={() => control.current?.clear()}>Clear</Button></div>}>
        <div className="mb-3 flex flex-wrap gap-1.5">{QUICK.map(([c, label]) => <button key={c} type="button" disabled={state !== 'open'} onClick={() => { control.current?.send(`${c}\n`); control.current?.focus(); }} className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" title={c}>{label}</button>)}</div>
        <TerminalView key={service.id} serviceId={service.id} height="h-[56vh]" controlRef={control} onState={setState} />
      </Panel>
      <Panel icon="zap" color="pink" title="Run a command" description="One command, output below. Nothing interactive.">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <div className="min-w-0 flex-1"><Input label="Command" aria-label="Command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="php artisan migrate --force" className="font-mono" /></div>
          <Button type="submit" size="sm" loading={running}>Run</Button>
        </form>
        {error && <Alert tone="error" className="mt-3">{error}</Alert>}
        {last ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs"><Badge tone={last.code === 0 ? 'success' : 'danger'} dot>exit {last.code}</Badge><span className="min-w-0 flex-1 truncate font-mono text-muted">{last.cmd}</span></div>
            <LogView text={last.output} height="h-56" empty="No output." />
            {history.length > 1 && <div><p className="mb-1 text-xs font-medium text-muted">Earlier</p><ul className="space-y-1">{history.slice(1).map((h) => <li key={h.id}><button type="button" onClick={() => setCommand(h.cmd)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-xs text-muted hover:bg-surface-2 hover:text-ink"><span className={cn('size-1.5 rounded-full', h.code === 0 ? 'bg-success' : 'bg-danger')} /><span className="truncate">{h.cmd}</span></button></li>)}</ul></div>}
          </div>
        ) : <p className="mt-4 text-sm text-muted">Results appear here.</p>}
      </Panel>
    </div>
  );
}

const Row = ({ children, onRemove, label }) => (<li className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">{children}<button type="button" aria-label={label} onClick={onRemove} className="ml-auto grid size-6 place-items-center rounded text-muted hover:bg-surface hover:text-danger"><Icon name="x" className="size-3.5" /></button></li>);

/** Resources, start command, volumes, published ports, redirects and basic auth — Dokploy's "Advanced". */
export function AdvancedTab({ service, onSaved, onRedeploy }) {
  const can = useCan()('manager');
  const cfg = service.config ?? {};
  const isDb = DATABASE_KINDS.includes(service.kind); const isCompose = service.kind === 'compose';
  const [res, setRes] = useState({ memoryLimitMb: cfg.memoryLimitMb ?? '', cpuLimit: cfg.cpuLimit ?? '', command: cfg.command ?? '', healthCheck: cfg.healthCheck ?? '' });
  const [volumes, setVolumes] = useState(cfg.volumes ?? []); const [vol, setVol] = useState({ name: '', path: '' });
  const [ports, setPorts] = useState(cfg.publishedPorts ?? []); const [port, setPort] = useState({ published: '', target: '', protocol: 'tcp' });
  const [redirects, setRedirects] = useState(cfg.redirects ?? []); const [redirect, setRedirect] = useState({ regex: '', replacement: '', permanent: true });
  const [users, setUsers] = useState((cfg.basicAuthUsers ?? []).map((u) => ({ username: u.username, keep: true }))); const [user, setUser] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(null); const [error, setError] = useState(null); const [done, setDone] = useState(null);
  const save = (key, config) => async () => { setBusy(key); setError(null); setDone(null); try { await deploymentsApi.updateService(service.id, { config }); setDone(key); onSaved(); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const num = (v) => (v === '' ? undefined : Number(v));
  const saved = (key) => done === key && <span className="text-xs font-medium text-success">Saved</span>;
  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="info">Changes apply on the next deploy. <button type="button" onClick={onRedeploy} className="font-semibold underline">Redeploy now</button></Alert>}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {!isCompose && (
          <Panel icon="cpu" color="blue" title="Resources and process" description="Limits and how the container starts" action={can && <div className="flex items-center gap-2">{saved('res')}<Button size="sm" loading={busy === 'res'} onClick={save('res', { memoryLimitMb: num(res.memoryLimitMb), cpuLimit: num(res.cpuLimit), command: res.command || undefined, healthCheck: res.healthCheck || undefined })}>Save</Button></div>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Memory limit (MB)" type="number" value={res.memoryLimitMb} onChange={(e) => setRes({ ...res, memoryLimitMb: e.target.value })} placeholder="No limit" disabled={!can} />
              <Input label="CPU limit (cores)" type="number" step="0.05" value={res.cpuLimit} onChange={(e) => setRes({ ...res, cpuLimit: e.target.value })} placeholder="No limit" disabled={!can} />
              {!isDb && <div className="sm:col-span-2"><Input label="Start command" value={res.command} onChange={(e) => setRes({ ...res, command: e.target.value })} placeholder="Image default" className="font-mono" disabled={!can} /></div>}
              {!isDb && <div className="sm:col-span-2"><Input label="Health check" value={res.healthCheck} onChange={(e) => setRes({ ...res, healthCheck: e.target.value })} placeholder="curl -f http://localhost:3000/health" className="font-mono" hint="Runs inside the container; exit 0 means healthy." disabled={!can} /></div>}
            </div>
          </Panel>
        )}
        {!isCompose && (
          <Panel icon="hard-drive" color="teal" title="Volumes" description="Named volumes kept across deploys" action={can && <div className="flex items-center gap-2">{saved('vol')}<Button size="sm" loading={busy === 'vol'} onClick={save('vol', { volumes })}>Save</Button></div>}>
            <ul className="space-y-1.5">{volumes.map((v, i) => <Row key={`${v.name}${i}`} label={`Remove ${v.name}`} onRemove={() => setVolumes(volumes.filter((_, j) => j !== i))}><span className="font-medium text-ink">{v.name}</span><Icon name="chevron-right" className="size-3.5 text-placeholder" /><span className="font-mono text-xs text-muted">{v.path}</span></Row>)}{volumes.length === 0 && <li className="text-sm text-muted">No volumes.</li>}</ul>
            {can && <div className="mt-3 flex items-end gap-2"><div className="min-w-0 flex-1"><Input label="Name" aria-label="Volume name" value={vol.name} onChange={(e) => setVol({ ...vol, name: e.target.value })} placeholder="uploads"  /></div><div className="min-w-0 flex-1"><Input label="Mount path" aria-label="Mount path" value={vol.path} onChange={(e) => setVol({ ...vol, path: e.target.value })} placeholder="/var/www/uploads" className="font-mono" /></div><Button size="sm" variant="neutral" disabled={!vol.name || !vol.path.startsWith('/')} onClick={() => { setVolumes([...volumes, vol]); setVol({ name: '', path: '' }); }}>Add</Button></div>}
          </Panel>
        )}
        {!isCompose && (
          <Panel icon="globe" color="purple" title="Published ports" description="Open a port on the server itself (not through the domain)" action={can && <div className="flex items-center gap-2">{saved('ports')}<Button size="sm" loading={busy === 'ports'} onClick={save('ports', { publishedPorts: ports.map((p) => ({ published: Number(p.published), target: Number(p.target), protocol: p.protocol })) })}>Save</Button></div>}>
            <ul className="space-y-1.5">{ports.map((p, i) => <Row key={`${p.published}${i}`} label={`Remove port ${p.published}`} onRemove={() => setPorts(ports.filter((_, j) => j !== i))}><span className="font-mono text-xs text-ink">{p.published}</span><Icon name="chevron-right" className="size-3.5 text-placeholder" /><span className="font-mono text-xs text-muted">{p.target}/{p.protocol}</span></Row>)}{ports.length === 0 && <li className="text-sm text-muted">No ports are open.</li>}</ul>
            {can && <div className="mt-3 flex items-end gap-2"><div className="min-w-0 flex-1"><Input label="Server port" aria-label="Server port" type="number" value={port.published} onChange={(e) => setPort({ ...port, published: e.target.value })}  /></div><div className="min-w-0 flex-1"><Input label="Container port" aria-label="Container port" type="number" value={port.target} onChange={(e) => setPort({ ...port, target: e.target.value })}  /></div><div className="w-24 shrink-0"><Select label="Protocol" value={port.protocol} onChange={(v) => setPort({ ...port, protocol: v })} options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} /></div><Button size="sm" variant="neutral" disabled={!port.published || !port.target} onClick={() => { setPorts([...ports, port]); setPort({ published: '', target: '', protocol: 'tcp' }); }}>Add</Button></div>}
          </Panel>
        )}
        {!isDb && (
          <Panel icon="swap" color="orange" title="Redirects" description="Regex redirects applied to every domain" action={can && <div className="flex items-center gap-2">{saved('redir')}<Button size="sm" loading={busy === 'redir'} onClick={save('redir', { redirects })}>Save</Button></div>}>
            <ul className="space-y-1.5">{redirects.map((r, i) => <Row key={`${r.regex}${i}`} label="Remove redirect" onRemove={() => setRedirects(redirects.filter((_, j) => j !== i))}><span className="min-w-0 truncate font-mono text-xs text-ink">{r.regex}</span><Icon name="chevron-right" className="size-3.5 shrink-0 text-placeholder" /><span className="min-w-0 truncate font-mono text-xs text-muted">{r.replacement}</span><Badge tone="neutral">{r.permanent ? '301' : '302'}</Badge></Row>)}{redirects.length === 0 && <li className="text-sm text-muted">No redirects.</li>}</ul>
            {can && <div className="mt-3 space-y-2"><div className="flex gap-2"><div className="min-w-0 flex-1"><Input label="Regex" aria-label="Redirect regex" value={redirect.regex} onChange={(e) => setRedirect({ ...redirect, regex: e.target.value })} placeholder="^https://old.example.com/(.*)" className="font-mono" /></div><div className="min-w-0 flex-1"><Input label="To" aria-label="Redirect target" value={redirect.replacement} onChange={(e) => setRedirect({ ...redirect, replacement: e.target.value })} placeholder="https://example.com/$1" className="font-mono" /></div></div><div className="flex items-center justify-between"><Switch checked={redirect.permanent} onChange={(e) => setRedirect({ ...redirect, permanent: e.target.checked })} label="Permanent (301)" /><Button size="sm" variant="neutral" disabled={!redirect.regex || !redirect.replacement} onClick={() => { setRedirects([...redirects, redirect]); setRedirect({ regex: '', replacement: '', permanent: true }); }}>Add</Button></div></div>}
          </Panel>
        )}
        {!isDb && (
          <Panel icon="lock" color="pink" title="Basic auth" description="Ask for a username and password before the site" action={can && <div className="flex items-center gap-2">{saved('auth')}<Button size="sm" loading={busy === 'auth'} onClick={save('auth', { basicAuth: users })}>Save</Button></div>}>
            <ul className="space-y-1.5">{users.map((u, i) => <Row key={u.username} label={`Remove ${u.username}`} onRemove={() => setUsers(users.filter((_, j) => j !== i))}><Icon name="user" className="size-4 text-muted" /><span className="font-medium text-ink">{u.username}</span>{u.keep && <span className="text-xs text-muted">password kept</span>}</Row>)}{users.length === 0 && <li className="text-sm text-muted">The site is open to everyone.</li>}</ul>
            {can && <div className="mt-3 flex items-end gap-2"><div className="min-w-0 flex-1"><Input label="Username" aria-label="Username" value={user.username} onChange={(e) => setUser({ ...user, username: e.target.value })}  /></div><div className="min-w-0 flex-1"><Input label="Password" aria-label="Password" type="password" autoComplete="new-password" value={user.password} onChange={(e) => setUser({ ...user, password: e.target.value })}  /></div><Button size="sm" variant="neutral" disabled={!user.username || user.password.length < 6} onClick={() => { setUsers([...users.filter((x) => x.username !== user.username), { username: user.username, password: user.password }]); setUser({ username: '', password: '' }); }}>Add</Button></div>}
          </Panel>
        )}
      </div>
    </div>
  );
}
