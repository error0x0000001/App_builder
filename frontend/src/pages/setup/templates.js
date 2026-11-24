import { lazy } from 'react';

// One template per page kind; special pages are composed from the same building blocks. Add a kind = add a line.
const t = (loader) => lazy(loader);
export const TEMPLATES = {
  list: t(() => import('./SetupListPage.jsx')),
  form: t(() => import('./SetupFormPage.jsx')),
  info: t(() => import('./SetupInfoPage.jsx')),
  dashboard: t(() => import('./SetupDashboardPage.jsx')),
  tree: t(() => import('./SetupHierarchyPage.jsx')),
  'special:sysoverview': t(() => import('./specials/SystemOverviewPage.jsx')),
  'special:health': t(() => import('./specials/HealthCheckPage.jsx')),
  'special:themes': t(() => import('./specials/ThemesPage.jsx')),
  'special:debuglogs': t(() => import('./specials/DebugLogsPage.jsx')),
  'special:sharing': t(() => import('./specials/SharingPage.jsx')),
  'special:objmgr': t(() => import('./specials/ObjectManagerPage.jsx')),
  'special:schema': t(() => import('./specials/ObjectManagerPage.jsx')),
};

export const templateFor = (page) => (page.kind === 'special' ? `special:${page.special}` : page.kind);
