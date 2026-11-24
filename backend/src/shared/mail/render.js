const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Renders a template result to { subject, html, text } with one shared layout. */
export function renderEmail({ subject, heading, paragraphs = [], code, cta, footnote }) {
  const html = `<!doctype html><html><body style="margin:0;background:#eef1f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2535">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:480px;background:#fff;border-radius:8px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<div style="font-size:20px;font-weight:700;color:#1b3a6b;margin-bottom:24px">quelli</div>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join('')}
${code ? `<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0;color:#1b3a6b">${escapeHtml(code)}</p>` : ''}
${cta ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#1b3a6b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500">${escapeHtml(cta.label)}</a></p>` : ''}
${footnote ? `<p style="margin:24px 0 0;font-size:12px;color:#667085;line-height:1.5">${escapeHtml(footnote)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;

  const text = [heading, '', ...paragraphs, code ? `\nCode: ${code}` : '', cta ? `\n${cta.label}: ${cta.url}` : '', footnote ? `\n${footnote}` : '']
    .filter((line) => line !== undefined)
    .join('\n');
  return { subject, html, text };
}
