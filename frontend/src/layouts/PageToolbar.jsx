/** An inline row at the top of a page body: a short note on the left (counts, status) and the page's actions on the right. It is not a header — no bar, no title, no border. */
export function PageToolbar({ meta, children }) {
  if (!meta && !children) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 truncate text-sm text-muted">{meta}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
