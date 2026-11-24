import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { DropdownMenuLabel } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { MenuChoice, RoundMenu } from '../../components/ui/RoundMenu.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { cn } from '../../lib/cn.js';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { CATEGORIES, categoriesOf } from './templateCategories.js';
import { useCan } from './parts.jsx';

const PAGE = 48;
const hue = (id) => ['blue', 'indigo', 'teal', 'orange', 'purple', 'pink'][[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];

export function TemplateLogo({ template, size = 'size-12' }) {
  const [failed, setFailed] = useState(false);
  return template.logo && !failed
    ? <img src={`/template-logos/${template.logo}`} alt="" loading="lazy" onError={() => setFailed(true)} className={cn(size, 'shrink-0 rounded-lg border border-line bg-white object-contain p-1.5')} />
    : <span aria-hidden="true" style={{ '--c': `var(--fi-${hue(template.id)})` }} className={cn(size, 'grid shrink-0 place-items-center rounded-lg border border-line bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))] text-sm font-semibold text-(--c)')}>{template.name.slice(0, 2).toUpperCase()}</span>;
}

/** Pick where to put it, then create the service (secrets are generated here, on the server). */
function DeployDialog({ template, presetEnvironment, onClose }) {
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ['deployments', 'overview'], queryFn: deploymentsApi.overview });
  const [projectId, setProjectId] = useState(''); const [envId, setEnvId] = useState(presetEnvironment ?? '');
  const project = useQuery({ queryKey: ['deployments', 'project', projectId], queryFn: () => deploymentsApi.project(projectId), enabled: Boolean(projectId) });
  const [serverId, setServerId] = useState(''); const [domain, setDomain] = useState(''); const [name, setName] = useState(template.name);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const servers = (overview.data?.servers ?? []).filter((s) => s.status === 'ready');
  const projects = overview.data?.projects ?? [];
  const environments = project.data?.project.environments ?? [];
  const chosen = servers.find((s) => s.id === serverId);
  const ipServer = chosen?.host && /^\d+(\.\d+){3}$/.test(chosen.host);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { service } = await deploymentsApi.deployTemplate(envId, { templateId: template.id, serverId: serverId || undefined, domain: domain || undefined, name });
      navigate(`/app/deployments/s/${service.id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} label={`Create ${template.name}`} className="max-w-lg">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center gap-3"><TemplateLogo template={template} /><div><h2 className="text-base font-semibold text-ink">Create {template.name}</h2><p className="text-sm text-muted">Secrets are generated for you. You deploy it on the next screen.</p></div></div>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        {!presetEnvironment && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Project" value={projectId} onChange={(v) => { setProjectId(v); setEnvId(''); }} options={[{ value: '', label: projects.length ? 'Choose a project' : 'No projects yet' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label="Environment" value={envId} onChange={setEnvId} options={[{ value: '', label: projectId ? 'Choose' : '—' }, ...environments.map((e) => ({ value: e.id, label: e.name }))]} />
          </div>
        )}
        <Select label="Server" value={serverId} onChange={setServerId} options={[{ value: '', label: servers.length ? 'Choose a server' : 'No ready server yet' }, ...servers.map((s) => ({ value: s.id, label: s.name }))]} />
        <Input label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={ipServer ? 'Leave empty for a free *.traefik.me address' : 'app.example.com'} hint="Point its DNS at the server. Other hosts the app needs become subdomains of this one." />
        <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={onClose}>Cancel</Button><Button type="submit" size="sm" loading={busy} disabled={!envId || !serverId}>Create</Button></div>
      </form>
    </Dialog>
  );
}

function DetailSheet({ id, onClose, onCreate }) {
  const query = useQuery({ queryKey: ['deployments', 'template', id], queryFn: () => deploymentsApi.template(id) });
  const t = query.data?.template;
  const links = Object.entries(t?.links ?? {}).filter(([, v]) => v);
  return (
    <Sheet open onClose={onClose} title={t?.name ?? 'Template'} description={t ? `Version ${t.version}` : undefined} width="w-[36rem]" footer={t && <div className="flex justify-end"><Button size="sm" onClick={() => onCreate(t)}>Create</Button></div>}>
      {query.isPending && <div className="grid place-items-center py-10 text-muted"><Spinner className="size-5" /></div>}
      {t && (
        <div className="space-y-5">
          <div className="flex items-start gap-3"><TemplateLogo template={t} size="size-14" /><p className="text-sm text-muted">{t.description}</p></div>
          <div className="flex flex-wrap gap-1.5">{t.tags.map((x) => <Badge key={x} tone="neutral">{x}</Badge>)}</div>
          {links.length > 0 && <div className="flex flex-wrap gap-3 text-sm">{links.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-link hover:underline"><Icon name="external" className="size-3.5" />{k}</a>)}</div>}
          <section><h3 className="mb-2 text-sm font-semibold text-ink">Containers</h3><div className="flex flex-wrap gap-1.5">{t.services.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div></section>
          {t.domains.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-ink">Served on</h3><ul className="space-y-1 text-sm text-muted">{t.domains.map((d, i) => <li key={i}><span className="font-mono text-xs text-ink">{d.serviceName}</span> · port {d.port}</li>)}</ul></section>}
          {t.mounts.length > 0 && <section><h3 className="mb-2 text-sm font-semibold text-ink">Files it writes</h3><ul className="space-y-1 font-mono text-xs text-muted">{t.mounts.map((m) => <li key={m}>{m}</li>)}</ul></section>}
          <section><h3 className="mb-2 text-sm font-semibold text-ink">docker-compose.yml</h3><pre className="max-h-80 overflow-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs leading-5 text-ink">{t.compose}</pre></section>
        </div>
      )}
    </Sheet>
  );
}

/** The catalog of one-click open-source apps (the Dokploy-compatible template set). `?env=` pre-selects where it goes. */
export default function TemplatesPage() {
  const can = useCan();
  const [params] = useSearchParams(); const presetEnv = params.get('env');
  const query = useQuery({ queryKey: ['deployments', 'templates'], queryFn: deploymentsApi.templates, staleTime: 3_600_000 });
  const [q, setQ] = useState(''); const deferred = useDeferredValue(q.trim().toLowerCase()); const [cat, setCat] = useState(null); const [shown, setShown] = useState(PAGE);
  const [detail, setDetail] = useState(null); const [deploy, setDeploy] = useState(null);
  const all = useMemo(() => (query.data?.templates ?? []).map((t) => ({ ...t, cats: categoriesOf(t) })), [query.data]);
  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.key, all.filter((t) => t.cats.includes(c.key)).length])), [all]);
  const rows = useMemo(() => {
    const words = deferred.split(/\s+/).filter(Boolean);
    return all.filter((t) => (!cat || t.cats.includes(cat)) && words.every((w) => t.name.toLowerCase().includes(w) || t.description.toLowerCase().includes(w) || t.tags.some((x) => x.toLowerCase().includes(w))))
      .sort((a, b) => (deferred ? Number(b.name.toLowerCase().startsWith(deferred)) - Number(a.name.toLowerCase().startsWith(deferred)) : 0) || a.name.localeCompare(b.name));
  }, [all, deferred, cat]);
  const manager = can('manager');
  return (
    <div className="space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>} />
      <div><h1 className="text-lg font-semibold text-ink">Templates</h1><p className="text-sm text-muted">{all.length ? `${all.length} open-source apps you can run in one click.` : 'One-click open-source apps.'}</p></div>
      <div className="flex items-center gap-2">
        <SearchInput label="Search templates" placeholder="Search by name, tag or description" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} onClear={() => setQ('')} className="h-10 max-w-md flex-1" />
        <RoundMenu icon="filter" label={cat ? `Category: ${CATEGORIES.find((c) => c.key === cat).label}` : 'Filter by category'} size="md" active={Boolean(cat)}>
          <DropdownMenuLabel>Category</DropdownMenuLabel>
          <MenuChoice selected={!cat} onSelect={() => { setCat(null); setShown(PAGE); }}>All</MenuChoice>
          {CATEGORIES.map((c) => <MenuChoice key={c.key} selected={cat === c.key} onSelect={() => { setCat(c.key); setShown(PAGE); }}>{c.label} <span className="ml-1 text-xs text-muted">{counts[c.key]}</span></MenuChoice>)}
        </RoundMenu>
        <span className="text-sm text-muted">{rows.length} shown</span>
      </div>
      {query.isPending && <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.slice(0, shown).map((t) => (
          <li key={t.id} className="flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <button type="button" onClick={() => setDetail(t.id)} className="flex items-start gap-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring">
              <TemplateLogo template={t} />
              <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{t.name}</span><Badge tone="neutral">{t.version}</Badge></span><span className="mt-1 line-clamp-2 block text-xs text-muted">{t.description}</span></span>
            </button>
            <div className="mt-3 flex flex-wrap gap-1">{t.tags.slice(0, 3).map((x) => <Badge key={x} tone="accent">{x}</Badge>)}</div>
            <div className="mt-auto flex items-center justify-between pt-4"><button type="button" onClick={() => setDetail(t.id)} className="text-xs font-medium text-link hover:underline">Details</button>{manager && <Button size="sm" variant="neutral" onClick={() => setDeploy(t)}>Create</Button>}</div>
          </li>
        ))}
      </ul>
      {!query.isPending && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No template matches “{q}”.</p>}
      {rows.length > shown && <div className="flex justify-center"><Button variant="neutral" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show more ({rows.length - shown} left)</Button></div>}
      {detail && <DetailSheet id={detail} onClose={() => setDetail(null)} onCreate={(t) => { setDetail(null); setDeploy(t); }} />}
      {deploy && <DeployDialog template={deploy} presetEnvironment={presetEnv} onClose={() => setDeploy(null)} />}
    </div>
  );
}
