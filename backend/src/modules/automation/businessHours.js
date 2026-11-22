/**
 * Elapsed *business* time, for Escalation Rules. Pure functions: working window per weekday in a time zone, minus holidays.
 *   cfg: { timeZone, startMin, endMin, days: Set<0-6, Sunday=0> }     holiday: { month, day, year|null }
 */
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MS_HOUR = 3_600_000;
const MAX_DAYS = 400;

const minutes = (hhmm, fallback) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : fallback; };

export function parseHoursConfig(row) {
  const days = new Set(String(row.working_days || 'Mon,Tue,Wed,Thu,Fri').split(/[,\s]+/).map((d) => DAYS[d.slice(0, 3).toLowerCase()]).filter((d) => d !== undefined));
  return { timeZone: row.time_zone || 'UTC', startMin: minutes(row.start_time, 9 * 60), endMin: minutes(row.end_time, 17 * 60), days };
}

/** 'M/D/YYYY' (as the Holidays page shows) or ISO → { month, day, year }. */
export function parseHoliday(row) {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(row.date ?? '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(row.date ?? '');
  const [month, day, year] = d ? [Number(d[1]), Number(d[2]), Number(d[3])] : iso ? [Number(iso[2]), Number(iso[3]), Number(iso[1])] : [null, null, null];
  return month ? { month, day, year: String(row.recurring).toLowerCase() === 'yes' ? null : year } : null;
}

const localParts = (instant, timeZone) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }).formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), min: Number(p.hour) * 60 + Number(p.minute), wd: DAYS[p.weekday.slice(0, 3).toLowerCase()] };
};

/** UTC instant of local wall time y-m-d at `min` minutes after midnight in `timeZone` (handles DST by correcting once). */
function zonedInstant(y, m, d, min, timeZone) {
  const guess = Date.UTC(y, m - 1, d, 0, min);
  const seen = localParts(new Date(guess), timeZone);
  const drift = (Date.UTC(seen.y, seen.m - 1, seen.d, 0, seen.min) - guess);
  return guess - drift;
}

export function businessHoursBetween(from, to, cfg, holidays = []) {
  if (to <= from) return 0;
  let total = 0;
  let { y, m, d } = localParts(from, cfg.timeZone);
  for (let i = 0; i < MAX_DAYS; i++) {
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    const wd = noon.getUTCDay();
    const holiday = holidays.some((h) => h.month === m && h.day === d && (h.year === null || h.year === y));
    if (cfg.days.has(wd) && !holiday) {
      const open = zonedInstant(y, m, d, cfg.startMin, cfg.timeZone).valueOf();
      const close = zonedInstant(y, m, d, cfg.endMin, cfg.timeZone).valueOf();
      total += Math.max(0, Math.min(close, to.getTime()) - Math.max(open, from.getTime()));
    }
    if (zonedInstant(y, m, d, 24 * 60, cfg.timeZone) >= to.getTime()) break;
    const next = new Date(Date.UTC(y, m - 1, d + 1, 12));
    ({ y, m, d } = { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() });
  }
  return total / MS_HOUR;
}
