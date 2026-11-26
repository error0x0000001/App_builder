import { useState } from 'react';
import { niceScale } from './geometry.js';
import { useWidth } from './useWidth.js';

const PAD = { top: 12, right: 12, bottom: 30, left: 40 };

/** Vertical bars with a light grid and a hover tooltip. `data`: [{ label, value }]. Draws at the pixel size it is shown at. */
export function BarChart({ data, height = 240, color = 'var(--accent)', showLabels = false, format = (v) => v }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const { top, ticks } = niceScale(max);
  const innerW = width - PAD.left - PAD.right; const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(data.length, 1); const bar = Math.max(6, Math.min(48, slot * 0.6));
  const y = (v) => PAD.top + innerH - (v / top) * innerH;
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (<g key={t}><line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} /><text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">{format(t)}</text></g>))}
        {data.map((d, i) => {
          const x = PAD.left + slot * i + (slot - bar) / 2;
          return (
            <g key={d.label} onPointerEnter={() => setHover(i)}>
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              <rect x={x} y={y(d.value)} width={bar} height={Math.max(0, PAD.top + innerH - y(d.value))} rx={4} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
              {showLabels && <text x={x + bar / 2} y={y(d.value) - 4} textAnchor="middle" className="fill-ink text-[11px]">{format(d.value)}</text>}
              <text x={x + bar / 2} y={height - 10} textAnchor="middle" className="fill-muted text-[11px]">{String(d.label).slice(0, Math.max(3, Math.floor(slot / 7)))}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow" style={{ left: Math.min(width - 130, Math.max(0, PAD.left + slot * hover)) }}><p className="font-semibold text-ink">{data[hover].label}</p><p className="text-muted">{format(data[hover].value)}</p></div>}
    </div>
  );
}
