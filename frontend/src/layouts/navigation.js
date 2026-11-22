/**
 * The single source of truth for the app's navigation. Add a page by adding an entry here — the sidebar,
 * the command palette (search) and the page header (title + icon) all pick it up with the same look.
 *
 *   main    – top-level rows
 *   groups  – collapsible titled sections: { label, defaultOpen?, action?: { to, label, icon? }, items }
 *   bottom  – rows pinned above the user menu
 * Item: { to, icon, label, end?, badge? }
 */
export const NAV = {
  main: [
    { to: '/app', end: true, icon: 'home', label: 'Home' },
    { to: '/app/members', icon: 'users', label: 'Members' },
  ],
  groups: [
    { label: 'Account', defaultOpen: true, items: [
      { to: '/app/profile', icon: 'user', label: 'Profile' },
      { to: '/app/security', icon: 'shield', label: 'Security' },
    ] },
  ],
  bottom: [
    { to: '/app/workspace', icon: 'sliders', label: 'Workspace settings' },
  ],
};

/** Routes that exist but aren't nav rows. */
const HIDDEN_PAGES = [{ to: '/app/workspaces/new', icon: 'plus', label: 'New workspace' }];

export const NAV_ITEMS = [...NAV.main, ...NAV.groups.flatMap((g) => g.items), ...NAV.bottom];

export const pageFor = (pathname) => [...NAV_ITEMS, ...HIDDEN_PAGES].find((item) => item.to === pathname) ?? { icon: 'home', label: 'Cloudbase' };
