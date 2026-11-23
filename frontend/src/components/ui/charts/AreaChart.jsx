import { useId, useState } from 'react';
import { smoothPath, niceScale } from './geometry.js';
import { useWidth } from './useWidth.js';

const PAD = { top: 12, right: 22, bottom: 28, left: 36 };

/**
 * Untitled UI "Line chart": smooth lines with a soft gradient fill, light grid, axis labels and a hover guide with a tooltip.
 * `series`: [{ key, label, color, values }] (same length as `labels`). `format(label)` shortens an x label.
 */
export function AreaChart({ series, labels, height = 240, format = (l) => l, every = 2 }) {
  const [ref, width] = useWidth();
  const uid = useId();
  const [hover, setHover] = useState(null);
  const max = Math.max(...series.flatMap((s) => s.values), 0);
  const { top, ticks } = niceScale(max);
  const innerW = width - PAD.left - PAD.right; const innerH = height - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (i / (labels.length - 1)) * innerW;
  const y = (v) => PAD.top + innerH - (v / top) * innerH;
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round(((e.clientX - box.left - PAD.left) / innerW) * (labels.length - 1)))));
  };
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(' and ')} over ${labels.length} days`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === (labels.length - 1) % every) && <text key={l} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">{format(l)}</text>)}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)]);
          const line = smoothPath(pts);
          return (
            <g key={s.key}>
              <defs><linearGradient id={`${uid}${si}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={si === 0 ? 0.2 : 0.1} /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
              <path d={`${line} L ${x(labels.length - 1)},${y(0)} L ${x(0)},${y(0)} Z`} fill={`url(#${uid}${si})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
              {hover != null && <circle cx={x(hover)} cy={y(s.values[hover])} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2" />}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="var(--line-strong)" />}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" />
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs" style={{ left: Math.min(Math.max(x(hover) + 12, 8), width - 160) }}>
          <p className="mb-1 font-semibold text-ink">{format(labels[hover])}</p>
          {series.map((s) => <p key={s.key} className="flex items-center gap-2 text-muted"><span className="size-2 rounded-full" style={{ background: s.color }} /><span className="flex-1">{s.label}</span><span className="font-semibold text-ink">{s.values[hover]}</span></p>)}
        </div>
      )}
    </div>
  );
}

/** The legend: a coloured dot and a label per series (Untitled UI puts it beside or under the chart). */
export const ChartLegend = ({ items }) => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">{items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: i.color }} />{i.label}</li>)}</ul>
);
