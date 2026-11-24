/**
 * The single source of truth for the app's navigation. Add a page by adding an entry here — the sidebar,
 * the command palette (search) and the page header (title + icon) all pick it up with the same look.
 *
 *   main    – top-level rows
 *   groups  – collapsible titled sections: { label, icon (the rail icon), defaultOpen?, action?: { to, label, icon? }, items }
 *   bottom  – rows pinned above the user menu
 * Group or bottom item `panel: '<key>'` (see sectionPanels.js) – the rail panel / sidebar shows that component (chat list, Documents views…) instead of rows.
 * Item: { to, icon, label, end?, badge?, minRole?, prefix?, bleed?, create?, parent? }
 *   also – extra path prefixes that keep this row active (a row with `end` whose sub-pages belong to it)
 *   create – the rail panel shows a "+" that opens the New dialog (…?new=1)     parent – { label, icon }: the icon-rail panel nests consecutive items with the same parent under one expandable row
 *   minRole – hide below this workspace role     prefix – active for every sub-route     bleed – page lays out its own panes (no padding/scroll)     panes – the page is made of side columns: use PaneGroup/Pane so floating draws each as its own card
 */
import { CRM_NAV_OBJECTS, hasRole } from '@app/shared';

export const NAV = {
  main: [
    { to: '/app', end: true, icon: 'home', label: 'Home' },
    { to: '/app/members', icon: 'users', label: 'Members' },
    { to: '/app/integrations', icon: 'layers', label: 'Integrations', minRole: 'admin' },
  ],
  groups: [
    { label: 'Documents', icon: 'folder', panel: 'documents', defaultOpen: true, items: [{ to: '/app/documents', icon: 'folder', label: 'Documents', bleed: true, panes: true }] },
    { label: 'Chat', icon: 'chat', panel: 'chat', defaultOpen: true, items: [{ to: '/app/chat', icon: 'chat', label: 'Chat', prefix: true, bleed: true, panes: true }] },
    { label: 'Deployments', icon: 'rocket', defaultOpen: true, items: [
      { to: '/app/deployments', end: true, also: ['/app/deployments/p/', '/app/deployments/s/'], icon: 'rocket', label: 'Projects', feature: 'deployments' },
      { to: '/app/deployments/templates', icon: 'grid', label: 'Templates', feature: 'deployments' },
      { to: '/app/deployments/services', icon: 'cube', label: 'Services', feature: 'deployments' },
      { to: '/app/deployments/queue', icon: 'activity', label: 'Deployments', feature: 'deployments' },
      { to: '/app/deployments/monitoring', icon: 'cpu', label: 'Monitoring', feature: 'deployments' },
      { to: '/app/deployments/schedules', icon: 'clock', label: 'Schedules', feature: 'deployments' },
      { to: '/app/deployments/docker', icon: 'package', label: 'Docker', feature: 'deployments' },
      { to: '/app/deployments/servers', icon: 'server', label: 'Servers', feature: 'deployments', parent: { label: 'Deployment settings', icon: 'settings' } },
      { to: '/app/deployments/credentials', icon: 'key', label: 'Git, registry & SSH', feature: 'deployments', parent: { label: 'Deployment settings', icon: 'settings' } },
      { to: '/app/deployments/access', icon: 'users', label: 'Access', feature: 'deployments', parent: { label: 'Deployment settings', icon: 'settings' } },
      { to: '/app/deployments/audit', icon: 'shield', label: 'Audit log', feature: 'deployments', parent: { label: 'Deployment settings', icon: 'settings' } },
    ] },
    { label: 'Sales & Service', icon: 'briefcase', defaultOpen: true, items: CRM_NAV_OBJECTS.map(({ key, plural, icon }) => ({ to: `/app/o/${key}`, icon, label: plural, create: true })) },
    { label: 'Account', icon: 'user', defaultOpen: true, items: [
      { to: '/app/profile', icon: 'user', label: 'Profile', parent: { label: 'Settings', icon: 'settings' } },
      { to: '/app/security', icon: 'shield', label: 'Security', parent: { label: 'Settings', icon: 'settings' } },
    ] },
  ],
  bottom: [
    { to: '/app/setup', icon: 'sliders', label: 'Setup', minRole: 'admin', prefix: true, bleed: true, panes: true, panel: 'setup' },
  ],
};

/** Routes that exist but aren't nav rows. */
const HIDDEN_PAGES = [{ to: '/app/workspaces/new', icon: 'plus', label: 'New workspace' }];

export const NAV_ITEMS = [...NAV.main, ...NAV.groups.flatMap((g) => g.items), ...NAV.bottom];

/** Items a role may not see are hidden by every navigation (the API enforces the same rule). */
export const isVisibleTo = (item, workspace) => (!item.minRole || Boolean(workspace && hasRole(workspace.role, item.minRole))) && (!item.feature || Boolean(workspace?.features?.[item.feature])); // `feature`: a system app the install may have switched off
/** Is this item the current page? (`end`: exact path only; otherwise it also covers sub-routes.) */
export const isActivePath = (item, pathname) => (item.end ? pathname === item.to || Boolean(item.also?.some((p) => pathname.startsWith(p))) : pathname === item.to || pathname.startsWith(`${item.to}/`));

const matches = (item, pathname) => item.to === pathname || (item.prefix && pathname.startsWith(`${item.to}/`)) || Boolean(item.also?.some((p) => pathname.startsWith(p)));
export const pageFor = (pathname) => [...NAV_ITEMS, ...HIDDEN_PAGES].find((item) => matches(item, pathname)) ?? { icon: 'home', label: 'Quelli' };
