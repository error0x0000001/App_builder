import { useQuery } from '@tanstack/react-query';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@app/shared';
import { useMemo, useState } from 'react';
import { integrationsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { IntegrationSheet } from './IntegrationSheet.jsx';
import { ProviderTile, STATUS } from './parts.jsx';

function Card({ def, state, onOpen }) {
  const status = STATUS[state.status] ?? STATUS.unconfigured;
  const category = INTEGRATION_CATEGORIES.find((c) => c.id === def.category);
  return (
    <article className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <ProviderTile def={def} />
        <div className="flex flex-wrap justify-end gap-1.5">
          {state.enabled && <Badge tone="accent">In use</Badge>}
          <Badge tone={status.tone} dot>{status.label}</Badge>
        </div>
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{def.name}</h3>
      <p className="mt-1 line-clamp-3 text-sm text-muted">{def.description}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Icon name={category.icon} className="size-3.5 text-placeholder" />{category.label}{!def.live && <span className="text-placeholder">· not used yet</span>}</span>
        <Button size="sm" variant={state.saved ? 'neutral' : 'primary'} onClick={onOpen}>{state.saved ? 'Manage' : 'Connect'}</Button>
      </div>
    </article>
  );
}

/** Integrations: the outside services this organisation connects with its own credentials. Cards come from the shared registry; state from the API. */
export default function IntegrationsPage() {
  const query = useQuery({ queryKey: ['integrations'], queryFn: integrationsApi.list });
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const states = useMemo(() => Object.fromEntries((query.data?.integrations ?? []).map((s) => [s.key, s])), [query.data]);
  const visible = INTEGRATIONS.filter((d) => (tab === 'all' || d.category === tab) && (!q.trim() || `${d.name} ${d.description}`.toLowerCase().includes(q.trim().toLowerCase())));
  const connected = Object.values(states).filter((s) => s.status === 'connected').length;
  const tabs = [{ id: 'all', label: `All ${INTEGRATIONS.length}` }, ...INTEGRATION_CATEGORIES.map((c) => ({ id: c.id, label: `${c.label} ${INTEGRATIONS.filter((d) => d.category === c.id).length}`, icon: c.icon }))];
  const openDef = open && INTEGRATIONS.find((d) => d.key === open);

  return (
    <div className="space-y-5">
      <PageToolbar meta={query.isSuccess ? `${connected} of ${INTEGRATIONS.length} connected` : undefined}>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search integrations" label="Search integrations" className="w-full sm:w-64" />
      </PageToolbar>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Integration categories" />
      {query.isPending && <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {query.isSuccess && (visible.length === 0 ? (
        <div className="grid place-items-center gap-1 py-16 text-center"><p className="text-sm font-semibold text-ink">No integrations match “{q}”</p><p className="text-sm text-muted">Try another name, or pick a different category.</p></div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((def) => <li key={def.key} className="flex"><div className="min-w-0 flex-1"><Card def={def} state={states[def.key] ?? { status: 'unconfigured', config: {}, secretsSet: [] }} onOpen={() => setOpen(def.key)} /></div></li>)}
        </ul>
      ))}
      {openDef && <IntegrationSheet key={openDef.key} def={openDef} state={states[openDef.key] ?? { status: 'unconfigured', config: {}, secretsSet: [], saved: false }} onClose={() => setOpen(null)} />}
    </div>
  );
}
