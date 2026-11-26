import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import PageView from './PageView.jsx';
import { useApp } from './useApps.js';

/** The first page of an app, in menu order (looking inside groups). */
export const firstPage = (routes, parent = null) => {
  for (const r of routes.filter((x) => (x.parentId ?? null) === parent && !x.hidden)) {
    if (r.type === 'page') return r;
    if (r.type === 'group') { const inner = firstPage(routes, r.id); if (inner) return inner; }
  }
  return null;
};

/** /app/a/:appKey and /app/a/:appKey/:routeId — opens a page of a custom app. */
export default function AppPage() {
  const { appKey, routeId } = useParams();
  const { activeTenant } = useAuth();
  const app = useApp(appKey);
  if (app.isPending) return <div className="grid place-items-center py-24 text-muted"><Spinner className="size-6" /></div>;
  if (app.isError) return <Alert tone="error">{app.error.status === 404 ? 'This app doesn’t exist, or you can’t open it.' : app.error.message}</Alert>;
  const { routes } = app.data;
  const route = routes.find((r) => r.id === routeId);
  if (!routeId || !route || route.type === 'group') {
    const target = firstPage(routes, route?.type === 'group' ? route.id : null) ?? firstPage(routes);
    return target ? <Navigate replace to={`/app/a/${appKey}/${target.id}`} /> : <Card className="p-6 text-sm text-muted">This app has no pages yet.</Card>;
  }
  if (route.type === 'link') return <Card className="flex flex-wrap items-center gap-4 p-6"><span className="grid size-10 place-items-center rounded-full bg-accent-soft text-link"><Icon name="link" className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold text-ink">{route.title}</p><p className="truncate text-sm text-muted">{route.linkUrl}</p></div><Button as="a" href={route.linkUrl} target="_blank" rel="noreferrer noopener"><Icon name="external" />Open</Button></Card>;
  return <PageView key={routeId} appKey={appKey} routeId={routeId} canStudio={['owner', 'admin'].includes(activeTenant?.role)} />;
}
