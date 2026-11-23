import { DISAPPEAR_OPTIONS } from '@app/shared';

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dayFull = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const short = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (value) => Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86_400_000);

export const formatTime = (value) => time.format(new Date(value));
/** Inbox timestamp: time today, "Yesterday", weekday this week, otherwise the date. */
export function formatInboxTime(value) {
  if (!value) return '';
  const n = daysAgo(value);
  if (n <= 0) return formatTime(value);
  if (n === 1) return 'Yesterday';
  return n < 7 ? dayName.format(new Date(value)) : short.format(new Date(value));
}
export function formatDayLabel(value) {
  const n = daysAgo(value);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return dayFull.format(new Date(value));
}
export const sameDay = (a, b) => daysAgo(a) === daysAgo(b);

export const nameOf = (people, id) => people[id]?.name ?? 'Someone';

/** A conversation's display name: the other person for a DM, the title for a group. */
export const conversationTitle = (conversation, people) => (conversation.kind === 'dm' ? nameOf(people, conversation.peerId) : conversation.title ?? 'Group');

/** One sentence for a system message ("Asha added Bela and Chitra"). */
export function systemText(message, people, myId) {
  const [kind, arg] = message.body.split(':');
  const who = message.senderId === myId ? 'You' : nameOf(people, message.senderId);
  const targets = (message.mentions ?? []).map((id) => (id === myId ? 'you' : nameOf(people, id))).join(', ');
  switch (kind) {
    case 'disappearing': return Number(arg) ? `${who} turned on disappearing messages (${DISAPPEAR_OPTIONS.find((o) => o.seconds === Number(arg))?.label ?? 'timer'})` : `${who} turned off disappearing messages`;
    case 'created': return `${who} created this group`;
    case 'added': return targets === who.toLowerCase() || message.mentions?.[0] === message.senderId ? `${who} joined with an invite link` : `${who} added ${targets}`;
    case 'removed': return `${who} removed ${targets}`;
    case 'left': return `${who} left`;
    case 'renamed': return `${who} changed the group name`;
    default: return '';
  }
}

const minutes = (seconds) => (seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`);

/** "started:0:video" / "ended:272:audio" / "missed:0:video" → one sentence for the conversation. */
export function callText(message, people, myId) {
  const [state, seconds, mode] = message.body.split(':');
  const who = message.senderId === myId ? 'You' : nameOf(people, message.senderId);
  if (state === 'started') return `${who} started a ${mode} call`;
  if (state === 'ended') return `${mode === 'video' ? 'Video' : 'Audio'} call ended · ${minutes(Number(seconds))}`;
  return `Missed ${mode} call`;
}

/** Preview line for the inbox: "You: text", "Asha: text", system sentence, or a placeholder for deleted messages. */
export function previewText(conversation, people, myId) {
  const last = conversation.last;
  if (!last) return conversation.meetingAt ? 'Scheduled meeting' : 'No messages yet';
  if (last.deleted) return 'This message was deleted';
  if (last.kind === 'system') return systemText({ ...last, mentions: [] }, people, myId);
  if (last.kind === 'call') return callText(last, people, myId);
  const prefix = last.senderId === myId ? 'You: ' : conversation.kind === 'group' ? `${nameOf(people, last.senderId).split(' ')[0]}: ` : '';
  if (last.kind === 'poll') return `${prefix}Poll: ${last.body}`;
  return `${prefix}${last.body || 'Attachment'}`;
}
