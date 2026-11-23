const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const when = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const MEETING_LENGTH_MS = 60 * 60_000;
export const JOIN_WINDOW_BEFORE_MS = 15 * 60_000;
/** Every quarter hour of the day, as the options of the "Time" field. */
export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => { const value = `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`; return { value, label: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(i / 4), (i % 4) * 15)) }; });

/** The date ("YYYY-MM-DD") and time ("HH:mm", rounded up to the next quarter hour) for a form default or an existing meeting. */
export function localParts(iso) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3_600_000);
  const rounded = new Date(Math.ceil(d.getTime() / 900_000) * 900_000);
  return { date: `${rounded.getFullYear()}-${pad(rounded.getMonth() + 1)}-${pad(rounded.getDate())}`, time: `${pad(rounded.getHours())}:${pad(rounded.getMinutes())}` };
}
/** A local date + time from the form, as the ISO instant the API stores. */
export const toIso = (date, time) => new Date(`${date}T${time}`).toISOString();
export const formatMeeting = (iso) => when.format(new Date(iso));

/** upcoming (more than 15 min away) | open (join now) | over. */
export function meetingPhase(iso, now = Date.now()) {
  const start = new Date(iso).getTime();
  if (now < start - JOIN_WINDOW_BEFORE_MS) return 'upcoming';
  return now <= start + MEETING_LENGTH_MS ? 'open' : 'over';
}

/** Downloads an .ics file so the meeting can be added to any calendar app. */
export function downloadIcs({ id, title, iso, url }) {
  const start = new Date(iso);
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cloudbase//Chat//EN', 'BEGIN:VEVENT', `UID:${id}@cloudbase`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + MEETING_LENGTH_MS))}`,
    `SUMMARY:${title.replace(/[,;\\]/g, ' ')}`, `DESCRIPTION:Join: ${url}`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  link.download = `${title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'meeting'}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
