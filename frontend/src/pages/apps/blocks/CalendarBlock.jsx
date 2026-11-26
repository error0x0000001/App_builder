import { Spinner } from '../../../components/ui/Spinner.jsx';
import { cn } from '../../../lib/cn.js';
import { useBlockData } from '../useApps.js';
import { BlockFrame, SampleNote } from './BlockFrame.jsx';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A month grid. The server sends the month and its events; the grid only lays out the days. */
export default function CalendarBlock({ block, onSettings }) {
  const data = useBlockData(block.id, {});
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this calendar in its settings.</p></BlockFrame>;
  const d = data.data;
  let grid = null;
  if (d) {
    const [y, m] = d.month.split('-').map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]; while (cells.length % 7) cells.push(null);
    const weeks = d.view === 'week' ? [cells.slice(0, 7)] : Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
    const on = (day) => d.events.filter((e) => day && `${d.month}-${String(day).padStart(2, '0')}` >= e.start && `${d.month}-${String(day).padStart(2, '0')}` <= e.end);
    grid = (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{MONTHS[m - 1]} {y}</p>
        <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-line text-xs">
          {WEEKDAYS.map((w) => <div key={w} className="border-b border-line bg-surface-2 px-2 py-1.5 font-semibold text-muted">{w}</div>)}
          {weeks.flat().map((day, i) => (
            <div key={i} className={cn('min-h-20 border-b border-r border-line p-1.5', !day && 'bg-surface-2/60')}>
              <p className="text-muted">{day}</p>
              {on(day).slice(0, 3).map((e) => <p key={e.id} className="mt-0.5 truncate rounded bg-accent-soft px-1.5 py-0.5 text-link">{e.title}</p>)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <BlockFrame block={block} onSettings={onSettings}>{d ? grid : <div className="grid place-items-center py-8"><Spinner /></div>}<SampleNote sample={d?.sample} /></BlockFrame>;
}
