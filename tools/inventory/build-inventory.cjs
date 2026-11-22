/**
 * Regenerates docs/inventory/*.md from the design mock-up HTML, so the product checklist is always derived from
 * the source rather than maintained by hand.
 *   node tools/inventory/build-inventory.cjs /path/to/setup-clone.html
 * Requires Playwright (any recent version) to run the mock-up and read its data structures.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const html = process.argv[2];
if (!html) { console.error('usage: build-inventory.cjs <mockup.html>'); process.exit(1); }
const OUT = path.join(__dirname, '..', '..', 'docs', 'inventory');

const KIND = { list: 'List', form: 'Settings form', info: 'Info / call-to-action page', dash: 'Dashboard page', detail: 'Detail page', tree: 'Hierarchy tree', objmgr: 'Object Manager (builder)', schema: 'Schema Builder (builder)', themes: 'Themes & Branding (builder)', debuglogs: 'Debug-log viewer', sysoverview: 'System overview', health: 'Health check', sharing: 'Sharing settings' };
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const list = (a, n = 8) => a.slice(0, n).join(', ') + (a.length > n ? `, … (+${a.length - n})` : '');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto('file://' + path.resolve(html)); await page.waitForTimeout(2500);
  const data = await page.evaluate(() => {
    const clean = (s) => String(s).replace(/^[*~✓#]/, '');
    const pages = [];
    const walk = (node, p) => {
      if (typeof node === 'string') return pages.push({ path: p, name: node });
      const [name, kids] = node;
      kids.forEach((k) => walk(k, [...p, name]));
    };
    window.TREE.forEach((n) => walk(n, []));
    const spec = (name) => {
      const s = window.PAGES[name]; if (!s) return null;
      if (s.t === 'list') return { t: s.t, cols: s.cols.map(clean), rows: s.rows.length, views: s.views, action: s.newLabel, desc: s.desc };
      if (s.t === 'form') return { t: s.t, sections: s.sections.map((x) => ({ h: x.h, fields: x.f.map((f) => `${f[0]} (${f[2]})`) })) };
      return { t: s.t, title: s.title, desc: s.desc, cta: s.cta, facts: s.facts };
    };
    const objs = Object.entries(window.CRM.OBJ).map(([k, o]) => ({ key: k, plural: o.plural, fields: (o.fields || []).map((f) => (Array.isArray(f) ? f.join(' · ') : `${f.n || f.name}: ${f.t || f.type}`)), views: o.views, kanban: !!o.kanban, related: (o.related || []).map((r) => (typeof r === 'string' ? r : r.n || r.name || r.l || JSON.stringify(r))), sections: (o.sections || []).length, seeded: Array.isArray(window.CRM.DB[k]) ? window.CRM.DB[k].length : 0 }));
    const extra = Object.values(window.EXTRA_APPS || {}).map((a) => ({ n: a.n, d: a.d, nav: (a.nav || []).map((n) => n.label || n.l || n[0]) }));
    return {
      setup: pages.map((x) => ({ ...x, spec: spec(x.name) })), objs, extra,
      reports: window.APPUI?.REPORTS || [], dash: window.APPUI?.DASH || [], agents: window.APPUI?.AGENTS || [],
      odooModels: Object.entries(window.ODOO?.M || {}).map(([k, m]) => ({ key: k, label: m.l || m.label, fields: (m.f || m.fields || []).map((f) => `${f.n}: ${f.t}${f.req ? '*' : ''}`) })),
      odooApps: Object.entries(window.ODOO?.APPS || {}).map(([k, a]) => ({ key: k, n: a.n || a.name, menus: (a.menu || a.nav || a.menus || []).map((m) => m.n || m.name || m.l || JSON.stringify(m)) })),
    };
  });
  await browser.close();

  // main apps and special routes come from the raw source (they are not exposed on window)
  const src = fs.readFileSync(html, 'utf8').replace(/<style[\s\S]*?<\/style>/g, '');
  const at = src.indexOf("const APPS={\n sales:{n:'Sales'");
  const block = src.slice(at, src.indexOf('\n};', at));
  const mainApps = [...block.matchAll(/\n (\w+):\{n:'([^']+)',d:'([^']*)'[\s\S]*?nav:\[(.*?)\]\}/g)].map((m) => ({ n: m[2], d: m[3], nav: [...m[4].matchAll(/N\('([^']+)'/g)].map((x) => x[1]) }));
  const routes = [...new Set([...src.matchAll(/#\/page\/([a-z0-9-]+)/g)].map((m) => m[1]))].sort();

  fs.mkdirSync(OUT, { recursive: true });
  const kinds = {}; data.setup.forEach((p) => { const k = p.spec?.t ?? 'none'; kinds[k] = (kinds[k] || 0) + 1; });

  // ---- setup pages
  const groups = new Map();
  for (const p of data.setup) { const g = p.path.slice(0, 2).join(' › '); (groups.get(g) ?? groups.set(g, []).get(g)).push(p); }
  let md = `# Setup / Administration pages (${data.setup.length})\n\nGenerated from the mock-up. Tick a row when the page is built **and** passes its acceptance check (see README).\n\nKinds: ${Object.entries(kinds).map(([k, v]) => `${KIND[k] ?? k} ×${v}`).join(' · ')}\n`;
  for (const [g, pages] of groups) {
    md += `\n## ${g} (${pages.length})\n\n` + table(['', 'Page', 'Sub-section', 'Kind', 'Contents'], pages.map((p) => {
      const s = p.spec; let c = '';
      if (s?.t === 'list') c = `${s.cols.length} columns: ${list(s.cols)}${s.views ? ` · views: ${list(s.views, 4)}` : ''}${s.action ? ` · action “${s.action}”` : ''}`;
      else if (s?.t === 'form') { const n = s.sections.reduce((a, x) => a + x.fields.length, 0); c = `${n} fields in ${s.sections.length} section(s): ${list(s.sections.flatMap((x) => x.fields), 6)}`; }
      else c = [s?.title, s?.desc, s?.cta && `CTA “${s.cta}”`].filter(Boolean).join(' — ');
      return ['☐', p.name, p.path.slice(2).join(' › '), KIND[s?.t] ?? s?.t ?? '', c];
    }));
    md += '\n';
  }
  fs.writeFileSync(path.join(OUT, 'setup-pages.md'), md);

  // ---- objects
  md = `# CRM objects (${data.objs.length})\n\nEach object needs: list views, record page (sections), create/edit form, related lists, and its fields. Built once through the generic object framework, not per object.\n`;
  md += '\n' + table(['', 'Object', 'Fields', 'List views', 'Kanban', 'Related lists', 'Seed rows in mock-up'], data.objs.map((o) => ['☐', o.key, o.fields.length, o.views?.length ?? 0, o.kanban ? 'yes' : '', (o.related || []).length, o.seeded])) + '\n';
  for (const o of data.objs) {
    md += `\n## ${o.key}${o.plural ? ` (${o.plural})` : ''}\n\n- **Fields (${o.fields.length}):** ${o.fields.join('; ')}\n- **List views:** ${(o.views || []).join(', ') || '—'}\n- **Related lists:** ${(o.related || []).join(', ') || '—'}\n- **Record-page sections:** ${o.sections}\n`;
  }
  fs.writeFileSync(path.join(OUT, 'objects.md'), md);

  // ---- apps, reports, dashboards, agents
  md = `# Apps, analytics and AI\n\n## Main apps (${mainApps.length})\n\n` + table(['', 'App', 'Description', 'Navigation'], mainApps.map((a) => ['☐', a.n, a.d, a.nav.join(' · ')]));
  md += `\n\n## Additional apps (${data.extra.length})\n\n` + table(['', 'App', 'Description', 'Navigation'], data.extra.map((a) => ['☐', a.n, a.d, a.nav.join(' · ')]));
  md += `\n\n## Special pages (${routes.length})\n\nBespoke screens that are not plain object lists:\n\n` + routes.map((r) => `- ☐ \`${r}\``).join('\n');
  md += `\n\n## Reports (${data.reports.length})\n\n` + table(['', 'Report', 'Object', 'Grouped by', 'Summary', 'Folder', 'Columns'], data.reports.map((r) => ['☐', r.name, r.obj, r.group, `${r.fn ?? ''}${r.val ? ' of ' + r.val : ''}`, r.folder, (r.cols || []).join(', ')]));
  md += `\n\n## Dashboards (${data.dash.length})\n\n` + table(['', 'Dashboard', 'Folder', 'Components'], data.dash.map((d) => ['☐', d.name, d.folder, d.comps.map((c) => `${c.t}:${c.title}`).join('; ')]));
  md += `\n\n## AI agents (${data.agents.length})\n\n` + table(['', 'Agent', 'Purpose', 'Status', 'Topics → actions'], data.agents.map((a) => ['☐', a.n, a.d, a.st, (a.topics || []).map((t) => `${t.n} → ${(t.acts || []).join(', ')}`).join('; ')]));
  fs.writeFileSync(path.join(OUT, 'apps.md'), md);

  // ---- ERP
  const erp = data.odooModels.filter((m) => !m.key.startsWith('cx.'));
  md = `# ERP / back-office module\n\nThe mock-up also contains an ERP-style area with ${data.odooApps.length} apps and ${erp.length} business models (plus ${data.odooModels.length - erp.length} \`cx.*\` views over the CRM objects).\n\n## Apps\n\n` + table(['', 'App', 'Menus'], data.odooApps.map((a) => ['☐', a.n, a.menus.join(' · ')]));
  md += `\n\n## Models (${erp.length})\n\n` + table(['', 'Model', 'Label', 'Fields'], erp.map((m) => ['☐', m.key, m.label, m.fields.join('; ')])) + '\n';
  fs.writeFileSync(path.join(OUT, 'erp.md'), md);

  const total = { setup: data.setup.length, objects: data.objs.length, mainApps: mainApps.length, extraApps: data.extra.length, specialPages: routes.length, reports: data.reports.length, dashboards: data.dash.length, agents: data.agents.length, erpApps: data.odooApps.length, erpModels: erp.length, kinds };
  fs.writeFileSync(path.join(OUT, 'counts.json'), JSON.stringify(total, null, 2) + '\n');
  console.log(JSON.stringify(total));
})().catch((e) => { console.error('FAILED', e.message.slice(0, 400)); process.exit(1); });
