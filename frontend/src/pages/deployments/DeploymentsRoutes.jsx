import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider.jsx';
import OverviewPage from './OverviewPage.jsx';
import ProjectPage from './ProjectPage.jsx';
import ServersPage from './ServersPage.jsx';
import ServicePage from './ServicePage.jsx';

/** /app/deployments/* — only exists when this install runs the Deployments app (DEPLOYMENTS_ENABLED). */
export default function DeploymentsRoutes() {
  const { activeWorkspace } = useAuth();
  if (!activeWorkspace?.features?.deployments) return <Navigate to="/app" replace />;
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="servers" element={<ServersPage />} />
      <Route path="p/:projectId" element={<ProjectPage />} />
      <Route path="s/:serviceId/*" element={<ServicePage />} />
      <Route path="*" element={<Navigate to="/app/deployments" replace />} />
    </Routes>
  );
}
