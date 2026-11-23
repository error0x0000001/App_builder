import { useId } from 'react';
import { smoothPath } from './geometry.js';

/** A tiny trend line with a soft fade underneath (Untitled UI "Metric item" chart). `color` is any CSS colour or token. */
export function Sparkline({ values, color = 'var(--accent)', height = 44, label }) {
  const id = useId();
  const W = 200;
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => [(i / (values.length - 1)) * W, height - 4 - (v / max) * (height - 12)]);
  const line = smoothPath(points);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-11 w-full overflow-visible">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L ${W},${height} L 0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
