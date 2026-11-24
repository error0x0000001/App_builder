import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { deploymentsApi } from '../../api/endpoints.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { cn } from '../../lib/cn.js';
import { formatRelative } from '../../lib/format.js';

export const KINDS = {
  application: { label: 'Application', hue: 'blue', icon: 'cube', blurb: 'From a Docker image or a Git repository' },
  compose: { label: 'Compose', hue: 'indigo', icon: 'layers', blurb: 'A docker-compose.yml with several containers' },
  postgres: { label: 'PostgreSQL', hue: 'teal', icon: 'database', blurb: 'Relational database' },
  mysql: { label: 'MySQL', hue: 'orange', icon: 'database', blurb: 'Relational database' },
  mariadb: { label: 'MariaDB', hue: 'purple', icon: 'database', blurb: 'MySQL-compatible database' },
  mongo: { label: 'MongoDB', hue: 'teal', icon: 'database', blurb: 'Document database' },
  redis: { label: 'Redis', hue: 'pink', icon: 'zap', blurb: 'In-memory cache and queue' },
};

export function KindTile({ kind, size = 'md' }) {
  const k = KINDS[kind] ?? KINDS.application;
  return (
    <span aria-hidden="true" style={{ '--c': `var(--fi-${k.hue})` }} className={cn('grid shrink-0 place-items-center border border-line bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))] text-(--c)', size === 'lg' ? 'size-12 rounded-xl' : 'size-10 rounded-lg')}>
      <Icon name={k.icon} className={size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  );
}

const SERVICE = { idle: ['Not deployed', 'neutral'], running: ['Deploying', 'warning'], done: ['Running', 'success'], error: ['Failed', 'danger'], stopped: ['Stopped', 'neutral'] };
const DEPLOY = { running: ['Running', 'warning'], done: ['Done', 'success'], error: ['Failed', 'danger'], cancelled: ['Cancelled', 'neutral'] };
const SERVER = { untested: ['Not tested', 'warning'], ready: ['Ready', 'success'], error: ['Problem', 'danger'] };
export const StatusBadge = ({ status, of = 'service' }) => {
  const [label, tone] = ({ service: SERVICE, deployment: DEPLOY, server: SERVER })[of][status] ?? [status, 'neutral'];
  return <Badge tone={tone} dot>{label}</Badge>;
};

export const duration = (start, end) => {
  const s = Math.max(0, Math.round(((end ? new Date(end) : new Date()) - new Date(start)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
export const ago = (v) => (v ? formatRelative(v) : 'never');

/** Untitled UI "code snippet" with line numbers: a log. Follows the end while it grows, unless the person scrolled up. */
export function LogView({ text, empty = 'Nothing yet.', className, height = 'h-96' }) {
  const box = useRef(null); const stick = useRef(true);
  const lines = text ? text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '').replace(/\n$/, '').split('\n') : [];
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [text]);
  return (
    <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }} role="log" aria-live="off" tabIndex={0}
      className={cn('overflow-auto rounded-xl border border-line bg-surface-2 font-mono text-xs leading-5 text-ink', height, className)}>
      {lines.length === 0 ? <p className="p-4 text-muted">{empty}</p> : (
        <table className="w-full border-collapse"><tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="w-12 select-none border-r border-line bg-[color-mix(in_srgb,var(--ink)_4%,var(--surface))] px-2 text-right text-placeholder">{i + 1}</td>
              <td className={cn('whitespace-pre-wrap break-all px-3', /✖|error|failed/i.test(l) && 'text-danger', l.startsWith('▶') && 'font-semibold text-link')}>{l || ' '}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}

/** Follows one deployment's log while it runs (asks only for the bytes it has not seen yet). */
export function useDeploymentLog(id) {
  const [log, setLog] = useState(''); const [info, setInfo] = useState(null);
  const offset = useRef(0);
  useEffect(() => {
    setLog(''); setInfo(null); offset.current = 0;
    if (!id) return undefined;
    let stop = false; let timer;
    const tick = async () => {
      try {
        const { deployment } = await deploymentsApi.deployment(id, offset.current);
        if (stop) return;
        offset.current = deployment.logBytes; setInfo(deployment);
        if (deployment.log) setLog((cur) => cur + deployment.log);
        if (deployment.status === 'running') timer = setTimeout(tick, 1500);
      } catch { if (!stop) timer = setTimeout(tick, 4000); }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  return { log, info };
}

export function CopyField({ value, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ } };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
      <Icon name="link" className="size-4 shrink-0 text-placeholder" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={value}>{value}</span>
      <Button size="icon" variant="ghost" aria-label={`Copy ${label}`} onClick={copy}><Icon name={done ? 'check' : 'copy'} className="size-4" /></Button>
    </div>
  );
}

/** The feature switch as a page guard: when this install has Deployments off, the app does not exist. */
export function useDeploymentsOverview() { return useQuery({ queryKey: ['deployments', 'overview'], queryFn: deploymentsApi.overview, refetchInterval: 15_000 }); }

const RANK = ['viewer', 'deployer', 'manager'];
export const LevelContext = createContext('viewer');
/** `can('deployer')` — whether this person's Deployments level is at least that (the server enforces it too; this only hides what would be refused). */
export function useCan() { const level = useContext(LevelContext); return (need) => RANK.indexOf(level) >= RANK.indexOf(need); }
