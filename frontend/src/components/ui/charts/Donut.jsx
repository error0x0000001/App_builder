/** Untitled UI "Pie chart" (donut): segments in shades of the accent with a legend; the centre shows a total. `data`: [{ label, value, color }]. */
export function Donut({ data, size = 148, thickness = 20, centerValue, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(', ')} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
          {total > 0 && data.map((d) => {
            const len = (d.value / total) * c; const seg = (
              <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeDasharray={`${Math.max(len - 2, 0)} ${c - Math.max(len - 2, 0)}`} strokeDashoffset={-offset}><title>{`${d.label}: ${d.value}`}</title></circle>
            );
            offset += len; return seg;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-2xl font-semibold leading-none text-ink">{centerValue ?? total}</p>{centerLabel && <p className="mt-1 text-xs text-muted">{centerLabel}</p>}</div></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d) => <li key={d.label} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} /><span className="min-w-0 flex-1 truncate text-muted">{d.label}</span><span className="font-semibold tabular-nums text-ink">{d.value}</span></li>)}
      </ul>
    </div>
  );
}
