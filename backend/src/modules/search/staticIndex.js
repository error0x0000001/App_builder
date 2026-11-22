import { SETUP_PAGES } from '@app/shared/setup-registry';

/** In-memory index of Setup pages and the individual settings on them (built once; ~270 pages, ~1,000 settings). */
const entries = [];
for (const page of Object.values(SETUP_PAGES)) {
  const section = page.path?.join(' › ') ?? '';
  entries.push({ kind: 'page', title: page.name, subtitle: section, to: `/app/setup/${page.key}`, haystack: page.name.toLowerCase() });
  for (const field of page.sections?.flatMap((s) => s.fields ?? []) ?? []) {
    entries.push({ kind: 'setting', title: field.label, subtitle: `${page.name}${section ? ` · ${page.path.at(-1)}` : ''}`, to: `/app/setup/${page.key}`, haystack: field.label.toLowerCase() });
  }
}

/** 3 = title starts with the query, 2 = a word starts with it, 1 = contains it. */
const score = (haystack, q) => (haystack.startsWith(q) ? 3 : haystack.includes(` ${q}`) ? 2 : haystack.includes(q) ? 1 : 0);

export function searchSetupIndex(q, limit) {
  const needle = q.toLowerCase();
  const hits = [];
  for (const entry of entries) {
    const s = score(entry.haystack, needle);
    if (s) hits.push({ s, entry });
  }
  return hits.sort((a, b) => b.s - a.s || a.entry.title.length - b.entry.title.length).slice(0, limit)
    .map(({ entry: { haystack, ...item } }) => ({ id: `${item.kind}:${item.to}:${item.title}`, ...item }));
}
