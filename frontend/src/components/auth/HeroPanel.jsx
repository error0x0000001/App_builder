import { cn } from '../../lib/cn.js';

/** Decorative left panel of the auth layout (hidden on small screens). */
export function HeroPanel({ className }) {
  return (
    <aside className={cn('hero-bg relative flex-col justify-end overflow-hidden rounded-3xl p-10 xl:p-14', className)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-8 top-[14%] select-none text-[6.5rem] font-black leading-none tracking-tighter text-white/70 xl:text-[8.5rem] dark:text-white/10">SECURE</span>
      <div aria-hidden="true" className="orb pointer-events-none absolute left-[26%] top-[22%] size-52 rounded-full xl:size-64" />
      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold tracking-tight text-ink xl:text-4xl">Secure access for every tenant</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">Sign in once and move between teams. Two-factor protection, role-based access and a full activity trail come built in.</p>
      </div>
    </aside>
  );
}
