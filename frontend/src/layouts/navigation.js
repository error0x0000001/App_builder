/** Single source for the sidebar tree and header breadcrumbs. Items with `children` render as collapsible sections. */
export const NAV_GROUPS = [
  { label: 'Workspace', items: [
    { to: '/app', end: true, icon: 'home', label: 'Home' },
    { to: '/app/members', icon: 'users', label: 'Members' },
  ] },
  { label: 'Account', items: [
    { icon: 'sliders', label: 'Settings', children: [
      { to: '/app/profile', label: 'Profile' },
      { to: '/app/security', label: 'Security' },
    ] },
  ] },
];

const EXTRA_TITLES = { '/app/workspaces/new': 'New workspace' };
const leaves = NAV_GROUPS.flatMap((g) => g.items).flatMap((item) => item.children ?? [item]);

export const titleFor = (pathname) => EXTRA_TITLES[pathname] ?? leaves.find((l) => l.to === pathname)?.label ?? 'Cloudbase';
