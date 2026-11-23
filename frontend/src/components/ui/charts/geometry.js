/** A smooth curve through the points (Catmull-Rom → cubic Bézier), the soft line look of Untitled UI's charts. */
export function smoothPath(points) {
  if (points.length < 2) return '';
  const p = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = p(i - 1); const [x1, y1] = p(i); const [x2, y2] = p(i + 1); const [x3, y3] = p(i + 2);
    d += ` C ${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

/** A tidy axis maximum (1, 2, 5 × 10ⁿ) and four ticks up to it. */
export function niceScale(max) {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const mag = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 4, 5, 10].map((m) => m * mag).find((v) => v >= max) ?? max;
  return { top, ticks: [0, 1, 2, 3, 4].map((i) => (top / 4) * i) };
}
