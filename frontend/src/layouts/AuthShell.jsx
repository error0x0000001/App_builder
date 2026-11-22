import { HeroPanel } from '../components/auth/HeroPanel.jsx';
import { TrustStrip } from '../components/auth/TrustStrip.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';

/** Split-screen frame shared by every pre-login screen and onboarding: hero left, content right. */
export function AuthShell({ children }) {
  return (
    <div className="auth-scope min-h-screen bg-bg p-2 sm:p-3 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-3">
      <HeroPanel className="hidden lg:flex" />
      <div className="flex min-h-[calc(100vh-1rem)] flex-col gap-2 sm:gap-3 lg:min-h-[calc(100vh-1.5rem)]">
        <section className="flex flex-1 flex-col rounded-3xl border border-line bg-surface px-5 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between">
            <Logo className="[&_span]:text-xl [&_svg]:h-7 [&_svg]:w-10" />
            <ThemeToggle />
          </div>
          <main className="flex flex-1 flex-col items-center justify-center py-8">{children}</main>
        </section>
        <TrustStrip />
      </div>
    </div>
  );
}
