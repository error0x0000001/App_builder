import { Fragment } from 'react';

/** A small, safe Markdown renderer: headings, paragraphs, bold, italic, code, links (http/https only), bullet and numbered lists. It builds React elements — never HTML. */
function inline(text, key = 'i') {
  const parts = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g;
  let last = 0; let m; let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0]; const k = `${key}${n += 1}`;
    if (t.startsWith('**')) parts.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) parts.push(<code key={k} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) { const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); parts.push(<a key={k} href={href} target="_blank" rel="noreferrer noopener" className="text-link underline">{label}</a>); }
    else parts.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source = '' }) {
  const lines = source.replace(/\r/g, '').split('\n'); const out = []; let list = null; let para = [];
  const flushPara = () => { if (para.length) { out.push(<p key={`p${out.length}`} className="text-sm leading-6 text-ink">{inline(para.join(' '))}</p>); para = []; } };
  const flushList = () => { if (list) { const Tag = list.ordered ? 'ol' : 'ul'; out.push(<Tag key={`l${out.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 text-sm text-ink`}>{list.items.map((t, i) => <li key={i}>{inline(t, `li${i}`)}</li>)}</Tag>); list = null; } };
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line); const ul = /^\s*[-*]\s+(.*)$/.exec(line); const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); const size = ['text-xl', 'text-lg', 'text-base'][h[1].length - 1]; out.push(<p key={`h${out.length}`} role="heading" aria-level={h[1].length} className={`${size} font-semibold text-ink`}>{inline(h[2])}</p>); }
    else if (ul || ol) { flushPara(); const ordered = Boolean(ol); if (list && list.ordered !== ordered) flushList(); list ??= { ordered, items: [] }; list.items.push((ul ?? ol)[1]); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return <div className="space-y-3">{out.map((el, i) => <Fragment key={i}>{el}</Fragment>)}</div>;
}
