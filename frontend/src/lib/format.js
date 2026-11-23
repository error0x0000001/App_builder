const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export const formatDateTime = (value) => dateTime.format(new Date(value));
export const formatDate = (value) => date.format(new Date(value));
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
/** "just now", "5 minutes ago", "yesterday", "3 days ago"… */
export function formatRelative(value, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const units = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60]];
  if (Math.abs(seconds) < 45) return 'just now';
  const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s) ?? ['minute', 60];
  return relative.format(Math.round(seconds / size), unit);
}
