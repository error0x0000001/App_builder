import { Outlet } from 'react-router-dom';
import { Logo } from '../components/ui/Logo.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen flex-col items-center px-4 py-10 sm:py-14" style={{ background: 'radial-gradient(1000px 420px at 50% -10%, var(--hero), transparent 70%), var(--bg)' }}>
      <ThemeToggle className="absolute right-4 top-4" />
      <Logo className="mb-6" />
      <main className="flex w-full flex-1 flex-col items-center"><Outlet /></main>
      <footer className="mt-8 text-center text-xs text-muted">© 2026 Cloudbase, Inc. • Privacy • Terms</footer>
    </div>
  );
}
