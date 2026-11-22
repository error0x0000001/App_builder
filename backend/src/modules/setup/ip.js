/** IPv4/IPv6 helpers for the Network Access allow-list. */
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** '::ffff:10.0.0.1' → '10.0.0.1'; everything else unchanged. */
export const normalizeIp = (ip = '') => ip.replace(/^::ffff:/i, '');

export function ipv4ToInt(ip) {
  const m = V4.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.some((p) => p > 255) ? null : ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

/** True when `ip` is within [start, end]. IPv4 compares numerically; anything else must match exactly (start === end). */
export function ipInRange(ip, start, end) {
  const [a, lo, hi] = [ipv4ToInt(normalizeIp(ip)), ipv4ToInt(start), ipv4ToInt(end)];
  if (a !== null && lo !== null && hi !== null) return a >= Math.min(lo, hi) && a <= Math.max(lo, hi);
  return normalizeIp(ip).toLowerCase() === start.toLowerCase() && start.toLowerCase() === end.toLowerCase();
}
