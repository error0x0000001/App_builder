/**
 * Generates the Setup page registry (what every page IS) and its seed fixtures (what it contains)
 * from the design mock-up. Backend and frontend both read the registry, so a page is defined once.
 *   node tools/setup/build-registry.cjs /path/to/setup-clone.html
 * Outputs:
 *   packages/shared/src/setup/registry.generated.json
 *   backend/seed/setup-fixtures.generated.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const html = process.argv[2];
if (!html) { console.error('usage: build-registry.cjs <mockup.html>'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');

const slug = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.goto('file://' + path.resolve(html)); await page.waitForTimeout(2500);
  const raw = await page.evaluate(() => ({ objects: Object.entries(window.CRM.OBJ).map(([k, o]) => ({ key: k, plural: o.plural || k + 's', fields: (o.fields || []).map((f) => (Array.isArray(f) ? { label: f[0], type: f[1] } : { label: f.n || f.name, type: f.t || f.type })) })), tree: window.TREE, pages: JSON.parse(JSON.stringify(window.PAGES, (k, v) => (typeof v === 'function' ? undefined : v))) }));
  await browser.close();

  // ---- unique keys for every leaf page
  const used = new Map();
  const keyOf = (name, trail) => {
    let k = slug(name);
    if (used.has(k) && used.get(k) !== trail.join('/')) k = `${slug(trail[trail.length - 1] ?? '')}-${k}`;
    used.set(k, trail.join('/'));
    return k;
  };

  const pages = {}; const fixtures = { lists: {}, dashboards: {}, details: {}, trees: {} };
  const REMOVED = new Set(['Adoption Manager']); // pages dropped from the product on purpose (still in the mock-up)
  const TAB_OF_PARENT = new Set(['User Management Settings']); // keeps its page (settings + API) but not its own sidebar row: it is a tab of Users
  const treeNode = (node, trail) => {
    if (typeof node === 'string') {
      const key = keyOf(node, [...trail, node]);
      try { pages[key] = buildPage(key, node, trail); } catch (e) { throw new Error(`${node}: ${e.stack.split('\n').slice(0, 3).join(' | ')} keys=${Object.keys(raw.pages[node] || {})}`); }
      return { label: node, page: key };
    }
    const [label, kids] = node;
    return { label, children: kids.filter((k) => !REMOVED.has(k)).map((k) => treeNode(k, [...trail, label])).filter((n) => !TAB_OF_PARENT.has(n.label)) };
  };

  const ENGINE = /rule|process|trigger|workflow|flow\b|flows\b|approval|assignment|escalat|auto-response|matching|duplicate|entitlement|macro|territor|forecast|email-to|web-to|snapshot|platform event|scheduled|sharing|encryption|session|password|single sign|login (flows|access)|transaction security|delegated|import|export|mass |loader|translat|expire|deliverab/i;

  function column(c) {
    const prefix = /^[*~✓#]/.test(c) ? c[0] : '';
    const label = c.replace(/^[*~✓#]/, '');
    return { key: slug(label).replace(/-/g, '_'), label, type: { '*': 'link', '~': 'status', '✓': 'check', '#': 'number' }[prefix] ?? 'text' };
  }
  const fieldType = (t, v) => (t === 'bool' || typeof v === 'boolean' ? 'bool' : t === 'select' ? 'select' : typeof v === 'string' && v.includes('\n') ? 'textarea' : 'text');

  function buildPage(key, name, trail) {
    const s = raw.pages[name]; const base = { key, name, path: trail, engine: ENGINE.test(name) };
    if (!s) throw new Error(`no spec for ${name}`);
    if (s.t === 'list') {
      const columns = s.cols.map(column);
      const seen = new Set(); columns.forEach((c) => { while (seen.has(c.key)) c.key += '_2'; seen.add(c.key); });
      fixtures.lists[key] = s.rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, c.type === 'check' ? Boolean(r[i]) : r[i] ?? ''])));
      columns.filter((c) => c.type === 'status').forEach((c) => { c.options = [...new Set(fixtures.lists[key].map((r) => r[c.key]).filter(Boolean))]; });
      return { ...base, kind: 'list', desc: s.desc ?? '', columns, views: s.views ?? [], newLabel: s.newLabel ?? null, bulkActions: s.buttons ?? [], detail: Boolean(s.detail) };
    }
    if (s.t === 'form' || (s.t === 'detail' && s.sections)) {
      const detail = s.t === 'detail';
      const sections = s.sections.map((sec) => {
        if (sec.list) { // read-only table section (e.g. Licenses)
          const columns = sec.cols.map(column);
          (fixtures.details[key] ??= {})[sec.h] = sec.list.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, r[i] ?? ''])));
          return { title: sec.h, table: { columns } };
        }
        const fields = (sec.f).map((f) => { const [label, value, type, options] = f; const ft = fieldType(type, value); return { key: slug(label).replace(/-/g, '_'), label, type: ft, ...(ft === 'select' ? { options: options.split('|') } : {}), default: value ?? (ft === 'bool' ? false : '') }; });
        const seen = new Set(); fields.forEach((f) => { while (seen.has(f.key)) f.key += '_2'; seen.add(f.key); });
        return { title: sec.h, fields };
      });
      return { ...base, kind: 'form', layout: detail ? 'detail' : 'form', title: s.title ?? name, desc: s.desc ?? '', sections, buttons: s.buttons ?? [] };
    }
    if (s.t === 'info') return { ...base, kind: 'info', title: s.title ?? name, desc: s.desc ?? '', cta: s.cta ?? '', facts: s.facts ?? [] };
    if (s.t === 'dash') {
      fixtures.dashboards[key] = { cards: s.cards ?? [], bars: s.bars ?? [], table: s.table ?? null };
      return { ...base, kind: 'dashboard', desc: s.desc ?? '' };
    }
    if (s.t === 'tree') { fixtures.trees[key] = s.root; return { ...base, kind: 'tree', title: s.title, desc: s.desc }; }
    return { ...base, kind: 'special', special: s.t }; // objmgr, schema, themes, debuglogs, sysoverview, health, sharing
  }

  fixtures.objects = raw.objects.map((o) => ({ ...o, fields: o.fields.map((f) => { const [label, type] = String(f.label).includes(':') ? String(f.label).split(':') : [f.label, f.type]; return { label, type: type || 'text' }; }) }));
  const tree = raw.tree.map((g) => treeNode(g, []));
  // the top level of TREE is [GROUP, [sections]] — flatten the group so 'path' = [group, section, ...]
  const registry = { generatedFrom: path.basename(html), counts: {}, tree, pages };
  for (const p of Object.values(pages)) registry.counts[p.kind] = (registry.counts[p.kind] || 0) + 1;
  registry.counts.total = Object.keys(pages).length;

  fs.writeFileSync(path.join(ROOT, 'packages/shared/src/setup/registry.generated.json'), JSON.stringify(registry));
  fs.writeFileSync(path.join(ROOT, 'backend/seed/setup-fixtures.generated.json'), JSON.stringify(fixtures));
  const size = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + ' KB';
  console.log(JSON.stringify(registry.counts), '| registry', size('packages/shared/src/setup/registry.generated.json'), '| fixtures', size('backend/seed/setup-fixtures.generated.json'));
})().catch((e) => { console.error('FAILED', e.message.slice(0, 400)); process.exit(1); });
