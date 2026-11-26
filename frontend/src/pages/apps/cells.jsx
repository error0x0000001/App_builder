import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';

const TONE = { gray: { tone: 'neutral' }, brand: { tone: 'accent' }, green: { tone: 'success' }, amber: { tone: 'warning' }, red: { tone: 'danger' }, blue: { hue: 'blue' }, purple: { hue: 'purple' }, pink: { hue: 'pink' }, teal: { hue: 'teal' }, indigo: { hue: 'indigo' } };

/** One value drawn the way its field type is shown. The server sends display-ready values; nothing is computed here. */
export function Cell({ type, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-placeholder">—</span>;
  if (type === 'checkbox') return <Switch label="" checked={Boolean(value)} disabled aria-label={value ? 'Yes' : 'No'} readOnly onChange={() => {}} />;
  if (type === 'picklist' || type === 'status_path') return <Badge {...(TONE[value.color] ?? { tone: 'neutral' })}>{value.label}</Badge>;
  if (type === 'user') return <span className="inline-flex items-center gap-2"><Avatar name={value.name} size="size-6" /><span className="truncate">{value.name}</span></span>;
  if (type === 'date') return formatDate(value);
  if (type === 'date_time') return formatDateTime(value);
  if (type === 'rating') return <span className="inline-flex text-warning">{Array.from({ length: Number(value) }, (_, i) => <Icon key={i} name="star" className="size-3.5 fill-current" />)}</span>;
  if (type === 'colour') return <span className="inline-flex items-center gap-2"><span className="size-4 rounded border border-line" style={{ background: value }} />{value}</span>;
  if (type === 'email' || type === 'url') return <span className="truncate text-link">{String(value)}</span>;
  return <span className="truncate">{String(value)}</span>;
}
