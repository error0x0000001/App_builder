/** A row of thin bars (one per value) — e.g. API calls per hour. The tallest is full height; empty slots stay as faint stubs so the time axis reads. */
export function MiniBars({ values, color = 'var(--accent)', height = 56, labels }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={`${values.reduce((a, b) => a + b, 0)} in total`}>
      {values.map((v, i) => <span key={i} title={labels ? `${labels[i]}: ${v}` : String(v)} className="min-w-0 flex-1 rounded-sm" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v ? color : 'var(--line)', opacity: v ? 1 : 0.8 }} />)}
    </div>
  );
}
