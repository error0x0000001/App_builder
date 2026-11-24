import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { deploymentsApi } from '../../api/endpoints.js';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import OverviewPage from './OverviewPage.jsx';
import ProjectPage from './ProjectPage.jsx';
import ServersPage from './ServersPage.jsx';
import ServicePage from './ServicePage.jsx';
import AccessPage from './AccessPage.jsx';
import TemplatesPage from './TemplatesPage.jsx';
import CredentialsPage from './CredentialsPage.jsx';
import { LevelContext } from './parts.jsx';

/** /app/deployments/* — only exists when this install runs the Deployments app (DEPLOYMENTS_ENABLED). */
export default function DeploymentsRoutes() {
  const { activeWorkspace } = useAuth();
  if (!activeWorkspace?.features?.deployments) return <Navigate to="/app" replace />;
  const me = useQuery({ queryKey: ['deployments', 'me'], queryFn: deploymentsApi.me, retry: false });
  if (me.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (me.isError) return <div className="grid place-items-center gap-3 py-20 text-center"><FeaturedIcon icon="lock" color="warning" size="xl" /><div><p className="text-base font-semibold text-ink">You don’t have access to Deployments</p><p className="text-sm text-muted">Ask a workspace admin to give you access.</p></div></div>;
  return (
    <LevelContext.Provider value={me.data.level}>
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="credentials" element={me.data.level === 'manager' ? <CredentialsPage /> : <Navigate to="/app/deployments" replace />} />
      <Route path="access" element={<AccessPage />} />
      <Route path="servers" element={me.data.level === 'manager' ? <ServersPage /> : <Navigate to="/app/deployments" replace />} />
      <Route path="p/:projectId" element={<ProjectPage />} />
      <Route path="s/:serviceId/*" element={<ServicePage />} />
      <Route path="*" element={<Navigate to="/app/deployments" replace />} />
    </Routes>
    </LevelContext.Provider>
  );
}
