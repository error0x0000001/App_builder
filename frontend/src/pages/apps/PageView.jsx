import { Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { appsApi } from '../../api/endpoints.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { MenuChoice, RoundMenu } from '../../components/ui/RoundMenu.jsx';
import { PromptDialog } from '../../components/ui/PromptDialog.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { BLOCKS } from './blocks/registry.js';
import { AddBlockSheet } from './studio/AddBlockSheet.jsx';
import { AppSheet } from './studio/AppSheet.jsx';
import { BlockSheet } from './studio/BlockSheet.jsx';
import { MenuSheet } from './studio/MenuSheet.jsx';
import { ErrorBox } from '../setup/objects/shared.jsx';
import { StudioContext, useAppMeta, useApp, usePage, useStudioAction } from './useApps.js';

const WIDTHS = [25, 33, 50, 67, 75, 100];

function BlockView({ block, onSettings }) {
  const Block = BLOCKS[block.kind];
  return <Suspense fallback={<div className="h-28 animate-pulse rounded-xl bg-surface-2" />}><Block block={block} onSettings={onSettings} /></Suspense>;
}

/** A page: tabs, then rows of columns of blocks. Everything it draws came from one cached server response. In Studio mode it also shows the controls to change it. */
export default function PageView({ appKey, routeId, canStudio }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? undefined;
  const page = usePage(routeId, tab);
  const app = useApp(appKey);
  const meta = useAppMeta();
  const mutation = useStudioAction();
  const [studioOn, setStudioOn] = useLocalStorageState('studio-mode', false);
  const studio = canStudio && studioOn;
  const [adding, setAdding] = useState(null); const [editing, setEditing] = useState(null); const [menu, setMenu] = useState(false); const [appSheet, setAppSheet] = useState(false); const [tabPrompt, setTabPrompt] = useState(null); const [error, setError] = useState(null);
  if (page.isPending || meta.isPending) return <div className="grid place-items-center py-24 text-muted"><Spinner className="size-6" /></div>;
  if (page.isError) return <Alert tone="error">{page.error.message}</Alert>;
  const { route, tabs, tabId, layout } = page.data; const m = meta.data;
  const run = (fn) => mutation.mutateAsync(fn).catch((e) => { setError(e); throw e; });
  const activeTab = tabs.find((t) => t.id === tabId);
  const visibleTabs = tabs.filter((t) => studio || !t.hidden);
  const blockCount = layout.rows.reduce((n, r) => n + r.columns.reduce((k, c) => k + c.blocks.length, 0), 0);

  return (
    <StudioContext.Provider value={{ studio, run, tabId, meta: m }}>
      {canStudio && (
        <PageToolbar meta={studio ? `Studio mode — ${blockCount} ${blockCount === 1 ? 'block' : 'blocks'} on this tab` : undefined}>
          {studio && <>
            <Button size="sm" variant="neutral" onClick={() => setMenu(true)}><Icon name="list" />Menu</Button>
            <Button size="sm" variant="neutral" onClick={() => setAppSheet(true)}><Icon name="settings" />App</Button>
          </>}
          <Switch label="Studio" checked={studioOn} onChange={(e) => setStudioOn(e.target.checked)} />
        </PageToolbar>
      )}
      {error && <ErrorBox error={error} />}
      {(visibleTabs.length > 1 || studio) && (
        <div className="flex items-center gap-2">
          <Tabs className="flex-1" label="Page tabs" value={tabId} onChange={(id) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; })} tabs={visibleTabs.map((t) => ({ id: t.id, label: t.hidden ? `${t.title} (hidden)` : t.title }))} />
          {studio && (
            <>
              <Button size="icon" variant="ghost" aria-label="Add a tab" onClick={() => setTabPrompt({ mode: 'add' })}><Icon name="plus" className="size-4" /></Button>
              <RoundMenu icon="more-horizontal" label="Tab options">
                <MenuChoice onSelect={() => setTabPrompt({ mode: 'rename', tab: activeTab })}>Rename this tab</MenuChoice>
                <MenuChoice onSelect={() => run(() => appsApi.updateTab(tabId, { hidden: !activeTab.hidden }))}>{activeTab?.hidden ? 'Show this tab' : 'Hide this tab'}</MenuChoice>
                <MenuChoice onSelect={() => run(() => appsApi.deleteTab(tabId)).catch(() => {})}>Delete this tab</MenuChoice>
              </RoundMenu>
            </>
          )}
        </div>
      )}
      <div className="space-y-4">
        {layout.rows.length === 0 && (
          <div className="grid place-items-center rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-link"><Icon name="layers" className="size-6" /></span>
            <p className="mt-3 text-base font-semibold text-ink">This page is empty</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{canStudio ? 'Turn on Studio and add tables, charts, forms and more.' : 'Nothing has been added to this page yet.'}</p>
            {canStudio && !studio && <Button className="mt-4" onClick={() => setStudioOn(true)}>Open Studio</Button>}
          </div>
        )}
        {layout.rows.map((row) => (
          <div key={row.id} className="space-y-2">
            <div className="grid items-start gap-4 grid-cols-1 md:[grid-template-columns:var(--cols)]" style={{ '--cols': row.columns.map((c) => `minmax(0, ${c.widthPct}fr)`).join(' ') }}>
              {row.columns.map((col) => (
                <div key={col.id} className={studio ? 'space-y-4 rounded-xl border border-dashed border-line p-2 pt-5' : 'space-y-4'}>
                  {studio && (
                    <div className="-mt-4 flex items-center gap-1 text-xs text-muted">
                      <span>Column {col.widthPct}%</span>
                      <RoundMenu icon="sliders" label="Column width" align="start">{WIDTHS.map((w) => <MenuChoice key={w} selected={col.widthPct === w} onSelect={() => run(() => appsApi.setColumnWidth(col.id, w))}>{w}%</MenuChoice>)}</RoundMenu>
                      <Button size="icon" variant="ghost" aria-label="Remove column" className="size-7" onClick={() => run(() => appsApi.deleteColumn(col.id))}><Icon name="x" className="size-4" /></Button>
                    </div>
                  )}
                  {col.blocks.map((block) => <BlockView key={block.id} block={block} onSettings={() => setEditing(block)} />)}
                  {studio && <Button size="sm" variant="neutral" className="w-full border-dashed" onClick={() => setAdding({ columnId: col.id })}><Icon name="plus" />Add block</Button>}
                </div>
              ))}
            </div>
            {studio && row.columns.length < 4 && <Button size="sm" variant="ghost" onClick={() => run(() => appsApi.addColumn(tabId, row.id)).catch(() => {})}><Icon name="plus" />Add column</Button>}
          </div>
        ))}
        {studio && <Button variant="neutral" className="w-full border-dashed" onClick={() => setAdding({})}><Icon name="plus" />Add block in a new row</Button>}
      </div>

      {adding && <AddBlockSheet open onClose={() => setAdding(null)} tabId={tabId} columnId={adding.columnId} meta={m} />}
      {editing && <BlockSheet key={editing.id} block={layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.id === editing.id) ?? editing} meta={m} onClose={() => setEditing(null)} />}
      {menu && <MenuSheet appKey={appKey} routes={app.data?.routes ?? []} meta={m} onClose={() => setMenu(false)} />}
      {appSheet && app.data && <AppSheet app={app.data.app} meta={m} onClose={() => setAppSheet(false)} />}
      {tabPrompt && <PromptDialog open title={tabPrompt.mode === 'add' ? 'New tab' : 'Rename tab'} initial={tabPrompt.tab?.title ?? ''} confirmLabel={tabPrompt.mode === 'add' ? 'Add tab' : 'Save'} onClose={() => setTabPrompt(null)}
        onSubmit={(title) => run(() => (tabPrompt.mode === 'add' ? appsApi.createTab(routeId, { title }) : appsApi.updateTab(tabPrompt.tab.id, { title })))} />}
    </StudioContext.Provider>
  );
}
