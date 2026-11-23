/** Pure cache updaters for the chat queries (React Query), shared by the realtime handler and the composer. */
export const KEYS = {
  inbox: ['chat', 'inbox'],
  unread: ['chat', 'unread'],
  people: ['chat', 'people'],
  conversation: (id) => ['chat', 'conversation', id],
  messages: (id) => ['chat', 'messages', id],
};

export const mergePeople = (qc, people) => {
  if (people && Object.keys(people).length) qc.setQueryData(KEYS.people, (old) => ({ ...old, ...people }));
};

const mapPages = (qc, id, fn) => qc.setQueryData(KEYS.messages(id), (old) => (old ? { ...old, pages: fn(old.pages) } : old));

/** Adds a message to the newest page, or replaces it when it is already there (optimistic copy, duplicate delivery). */
export function upsertMessage(qc, message) {
  mapPages(qc, message.conversationId, (pages) => {
    const exists = pages.some((p) => p.messages.some((m) => m.id === message.id));
    if (exists) return pages.map((p) => ({ ...p, messages: p.messages.map((m) => (m.id === message.id ? { ...m, ...message, pending: false, failed: false } : m)) }));
    return [{ ...pages[0], messages: [...pages[0].messages, message] }, ...pages.slice(1)];
  });
}

export const dropMessage = (qc, conversationId, messageId) => mapPages(qc, conversationId, (pages) => pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== messageId) })));

export const patchMessage = (qc, conversationId, messageId, patch) => mapPages(qc, conversationId, (pages) => pages.map((p) => ({ ...p, messages: p.messages.map((m) => (m.id === messageId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) })));

export function applyReaction(qc, { conversationId, messageId, emoji, on, userId }, myId) {
  patchMessage(qc, conversationId, messageId, (m) => {
    const list = [...(m.reactions ?? [])];
    const i = list.findIndex((r) => r.emoji === emoji);
    const mine = userId === myId;
    if (on) {
      if (i === -1) list.push({ emoji, count: 1, mine });
      else list[i] = { ...list[i], count: list[i].count + 1, mine: list[i].mine || mine };
    } else if (i !== -1) {
      const count = list[i].count - 1;
      if (count <= 0) list.splice(i, 1); else list[i] = { ...list[i], count, mine: mine ? false : list[i].mine };
    }
    return { reactions: list };
  });
}

export const patchInboxItem = (qc, conversationId, patch) => qc.setQueryData(KEYS.inbox, (old) => (old ? { ...old, conversations: old.conversations.map((c) => (c.id === conversationId ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) } : old));

/** Re-sorts like the server does: pinned first, then newest activity. */
export const sortInbox = (conversations) => [...conversations].sort((a, b) => (b.pinned - a.pinned) || String(b.last?.at ?? b.createdAt).localeCompare(String(a.last?.at ?? a.createdAt)));
