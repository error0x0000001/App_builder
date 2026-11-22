import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { Select } from '../components/ui/Select.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { cn } from '../lib/cn.js';

const NAV = [
  { to: '/app', label: 'Home', end: true },
  { to: '/app/members', label: 'Members' },
  { to: '/app/profile', label: 'Profile' },
  { to: '/app/security', label: 'Security' },
];
const NEW_WORKSPACE = '__new__';

function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const onChange = async (event) => {
    if (event.target.value === NEW_WORKSPACE) return navigate('/app/workspaces/new');
    await switchWorkspace(event.target.value);
    navigate('/app');
  };
  return (
    <Select
      aria-label="Workspace"
      value={activeWorkspace?.id ?? ''}
      onChange={onChange}
      className="max-w-48 !h-9"
      options={[...workspaces.map((w) => ({ value: w.id, label: w.name })), { value: NEW_WORKSPACE, label: '+ New workspace' }]}
      placeholder={activeWorkspace ? undefined : 'No workspace'}
    />
  );
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/app" aria-label="Home"><Logo className="[&_span]:text-lg [&_svg]:h-6 [&_svg]:w-9" /></Link>
          <WorkspaceSwitcher />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden items-center gap-2 sm:flex"><Avatar name={`${user.firstName} ${user.lastName}`} /><span className="text-sm text-ink">{user.firstName}</span></span>
            <Button variant="neutral" size="sm" onClick={signOut}><Icon name="log-out" />Sign out</Button>
          </div>
          <nav aria-label="Main" className="-mb-3 flex w-full gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>{item.label}</NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8"><Outlet /></main>
    </div>
  );
}
