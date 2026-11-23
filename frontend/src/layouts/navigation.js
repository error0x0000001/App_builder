/**
 * The single source of truth for the app's navigation. Add a page by adding an entry here — the sidebar,
 * the command palette (search) and the page header (title + icon) all pick it up with the same look.
 *
 *   main    – top-level rows
 *   groups  – collapsible titled sections: { label, icon (the rail icon), defaultOpen?, action?: { to, label, icon? }, items }
 *   bottom  – rows pinned above the user menu
 * Item: { to, icon, label, end?, badge?, minRole?, prefix?, bleed?, create?, parent? }
 *   create – the rail panel shows a "+" that opens the New dialog (…?new=1)     parent – { label, icon }: the icon-rail panel nests consecutive items with the same parent under one expandable row
 *   minRole – hide below this workspace role     prefix – active for every sub-route     bleed – page lays out its own panes (no padding/scroll)
 */
import { CRM_NAV_OBJECTS } from '@app/shared';

export const NAV = {
  main: [
    { to: '/app', end: true, icon: 'home', label: 'Home' },
    { to: '/app/members', icon: 'users', label: 'Members' },
  ],
  groups: [
    { label: 'Sales & Service', icon: 'briefcase', defaultOpen: true, items: CRM_NAV_OBJECTS.map(({ key, plural, icon }) => ({ to: `/app/o/${key}`, icon, label: plural, create: true })) },
    { label: 'Account', icon: 'user', defaultOpen: true, items: [
      { to: '/app/profile', icon: 'user', label: 'Profile', parent: { label: 'Settings', icon: 'settings' } },
      { to: '/app/security', icon: 'shield', label: 'Security', parent: { label: 'Settings', icon: 'settings' } },
    ] },
  ],
  bottom: [
    { to: '/app/setup', icon: 'sliders', label: 'Setup', minRole: 'admin', prefix: true, bleed: true },
  ],
};

/** Routes that exist but aren't nav rows. */
const HIDDEN_PAGES = [{ to: '/app/workspaces/new', icon: 'plus', label: 'New workspace' }];

export const NAV_ITEMS = [...NAV.main, ...NAV.groups.flatMap((g) => g.items), ...NAV.bottom];

const matches = (item, pathname) => item.to === pathname || (item.prefix && pathname.startsWith(`${item.to}/`));
export const pageFor = (pathname) => [...NAV_ITEMS, ...HIDDEN_PAGES].find((item) => matches(item, pathname)) ?? { icon: 'home', label: 'Cloudbase' };
