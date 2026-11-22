export const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function decodeCursor(cursor) {
  if (!cursor) return undefined;
  try { return JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { return undefined; }
}

/** Fetches limit+1 rows to know whether another page exists without a COUNT(*). */
export async function paginate(fetchRows, limit, toCursor) {
  const rows = await fetchRows(limit + 1);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? toCursor(items[items.length - 1]) : null };
}
