const SIZES = { md: { box: 'h-8 w-12', text: 'text-2xl' }, sm: { box: 'h-6 w-9', text: 'text-lg' } };

export function Logo({ className = '', size = 'md' }) {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-2 text-ink ${className}`}>
      <svg viewBox="0 0 48 32" className={`${s.box} shrink-0 fill-accent`} aria-hidden="true">
        <path d="M38 14.5a8.5 8.5 0 0 0-16.2-3A7.5 7.5 0 1 0 14 26h23a6 6 0 0 0 1-11.5z" />
      </svg>
      <span className={`${s.text} font-semibold tracking-tight`}>cloudbase</span>
    </div>
  );
}
