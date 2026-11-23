import { cn } from '../../lib/cn.js';

const URL_SOURCE = 'https?:\\/\\/[^\\s<>]+[^\\s<>.,;:!?)\\]\'"]'; // no capture group: it is embedded in a larger pattern below
const URL_PATTERN = new RegExp(`(${URL_SOURCE})`, 'g');
export const firstUrl = (text) => text.match(URL_PATTERN)?.[0] ?? null;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Message text as text nodes only (never HTML): links become anchors, and `@Name` of anyone mentioned is highlighted (yours stronger). */
export function RichText({ text, mentions = [], people, myId }) {
  const names = mentions.map((id) => ({ id, name: people[id]?.name })).filter((m) => m.name);
  const pattern = names.length ? new RegExp(`(${names.map((m) => `@${escape(m.name)}`).join('|')}|${URL_SOURCE})`, 'g') : URL_PATTERN;
  return text.split(pattern).map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">{part}</a>;
    const mentioned = names.find((m) => part === `@${m.name}`);
    if (mentioned) return <span key={i} className={cn('rounded px-0.5 font-semibold', mentioned.id === myId ? 'bg-accent/15 text-link' : 'text-link')}>{part}</span>;
    return part;
  });
}
