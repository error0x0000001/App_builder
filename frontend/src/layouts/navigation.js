/** Single source for sidebar groups and header titles. */
export const NAV_GROUPS = [
  { label: 'Workspace', items: [
    { to: '/app', end: true, icon: 'home', label: 'Home' },
    { to: '/app/members', icon: 'users', label: 'Members' },
  ] },
  { label: 'Account', items: [
    { to: '/app/profile', icon: 'user', label: 'Profile' },
    { to: '/app/security', icon: 'shield', label: 'Security' },
  ] },
];

const EXTRA_TITLES = { '/app/workspaces/new': 'New workspace' };

export const titleFor = (pathname) =>
  EXTRA_TITLES[pathname] ?? NAV_GROUPS.flatMap((g) => g.items).find((item) => item.to === pathname)?.label ?? 'Cloudbase';
