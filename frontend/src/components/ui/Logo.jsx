const SIZES = { md: { box: 'h-8 w-12', text: 'text-2xl' }, sm: { box: 'h-6 w-9', text: 'text-lg' } };
const TONES = { page: { text: 'text-ink', mark: 'fill-accent' }, sidebar: { text: 'text-sidebar-ink', mark: 'fill-sidebar-primary' } }; // sidebar = on the navigation surface (any colour the owner picked)

/** `markOnly` drops the wordmark (the icon rail). */
export function Logo({ className = '', size = 'md', tone = 'page', markOnly = false }) {
  const s = SIZES[size];
  const t = TONES[tone];
  return (
    <div className={`flex items-center gap-2 ${t.text} ${className}`}>
      <svg viewBox="0 0 48 32" className={`${s.box} shrink-0 ${t.mark}`} aria-hidden="true">
        <path d="M38 14.5a8.5 8.5 0 0 0-16.2-3A7.5 7.5 0 1 0 14 26h23a6 6 0 0 0 1-11.5z" />
      </svg>
      {!markOnly && <span className={`${s.text} font-semibold tracking-tight`}>quelli</span>}
    </div>
  );
}
