/** RFC 4180 parser (quotes, escaped quotes, CRLF). Stops after `maxRows` data rows and reports an error beyond that. */
export function parseCsv(text, maxRows) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const push = () => { row.push(cell); cell = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') push();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      push(); if (row.some((c) => c !== '')) rows.push(row); row = [];
      if (rows.length > maxRows + 1) throw new RangeError(`At most ${maxRows} rows per import`);
    } else cell += ch;
  }
  push(); if (row.some((c) => c !== '')) rows.push(row);
  if (rows.length > maxRows + 1) throw new RangeError(`At most ${maxRows} rows per import`);
  const [header = [], ...data] = rows;
  return { header, rows: data };
}

const cell = (v) => { const s = String(v ?? ''); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
/** Rows -> CSV text. Cells that start with = + - @ are prefixed so spreadsheets never evaluate them as formulas. */
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
