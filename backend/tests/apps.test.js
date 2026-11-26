import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const A = '/apps';
const boss = async () => (await registerUser(server)).client;
async function member(c) {
  const tenantId = (await c.get('/me')).body.activeTenantId; const email = uniqueEmail();
  await c.post(`/tenants/${tenantId}/invitations`, { invitations: [{ email, role: 'member' }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const m = new Client(server.base);
  await m.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await m.post(`/tenants/${tenantId}/switch`);
  return m;
}
async function shipment(c) {
  const object = (await c.post('/objects', { key: 'Shipment', label: 'Shipment', pluralLabel: 'Shipments' })).body.object;
  const add = (body) => c.post(`/objects/${object.id}/fields`, { settings: {}, ...body });
  await add({ key: 'title', label: 'Title', type: 'text', required: true });
  await add({ key: 'priority', label: 'Priority', type: 'picklist', settings: { values: [{ value: 'low', label: 'Low' }, { value: 'urgent', label: 'Urgent', color: 'red' }] } });
  await add({ key: 'weight', label: 'Weight', type: 'decimal' });
  await add({ key: 'shipDate', label: 'Ship date', type: 'date' });
  await add({ key: 'notes', label: 'Notes', type: 'long_text' });
  return object;
}
async function newApp(c, key = 'logistics') { return (await c.post(A, { key, label: 'Logistics' })).body.app; }
const home = async (c, key = 'logistics') => { const b = (await c.get(`${A}/${key}`)).body; const route = b.routes[0]; const page = (await c.get(`${A}/pages/${route.id}`)).body; return { route, page, tabId: page.tabId }; };
const block = (c, tabId, body) => c.post(`${A}/tabs/${tabId}/blocks`, body);

describe('apps, menus and pages', () => {
  it('serves the block registry the Studio is generated from, and the launcher to everybody', async () => {
    const c = await boss();
    const meta = (await c.get(`${A}/meta`)).body;
    assert.ok(meta.blockKinds.length >= 10 && meta.actionKinds.length && meta.icons.length);
    assert.ok(meta.blockKinds.find((k) => k.id === 'table').settings.some((s) => s.key === 'pageSize'));
    assert.deepEqual((await c.get(A)).body.apps, []);
    const app = await newApp(c);
    assert.equal((await c.get(A)).body.apps[0].key, 'logistics');
    assert.equal((await c.post(A, { key: 'logistics', label: 'Again' })).status, 409);
    assert.equal((await c.post(A, { key: 'Bad Key', label: 'x' })).status, 400);
    const m = await member(c);
    assert.equal((await m.get(A)).body.apps.length, 1, 'with no restrictions everybody sees it');
    assert.equal((await m.post(A, { key: 'sneaky', label: 'Sneaky' })).status, 403, 'only admins create apps');
    assert.equal(app.icon, 'grid');
  });

  it('a new app starts with a Home page that has one tab; access can be limited to an organisation role', async () => {
    const c = await boss(); await newApp(c);
    const { route, page } = await home(c);
    assert.equal(route.title, 'Home'); assert.equal(route.type, 'page');
    assert.equal(page.tabs.length, 1); assert.deepEqual(page.layout.rows, []);
    const m = await member(c);
    assert.equal((await c.put(`${A}/logistics/assignments`, { items: [{ orgRole: 'admin' }] })).status, 200);
    assert.deepEqual((await m.get(A)).body.apps, [], 'a member no longer sees it');
    assert.equal((await m.get(`${A}/logistics`)).status, 404, 'and can’t open it by address');
    assert.equal((await m.get(`${A}/pages/${route.id}`)).status, 404);
    assert.equal((await c.get(A)).body.apps.length, 1, 'admins always see it');
    await c.put(`${A}/logistics/assignments`, { items: [] });
    assert.equal((await m.get(A)).body.apps.length, 1, 'no assignments = everyone again');
  });

  it('builds a menu of groups, pages and links; keeps the tree valid; reorders; deletes with children', async () => {
    const c = await boss(); await newApp(c);
    const add = (body) => c.post(`${A}/logistics/routes`, body);
    const group = (await add({ type: 'group', title: 'Operations', icon: 'package' })).body.route;
    const page = (await add({ type: 'page', title: 'Shipments', parentId: group.id })).body.route;
    const link = (await add({ type: 'link', title: 'Docs', linkUrl: 'https://example.com/docs' })).body.route;
    assert.equal((await add({ type: 'link', title: 'Broken' })).status, 400, 'a link needs an address');
    assert.equal((await add({ type: 'page', title: 'Bad', parentId: page.id })).status, 400, 'only groups hold items');
    assert.equal((await c.patch(`${A}/routes/${group.id}`, { parentId: page.id })).status, 400);
    assert.equal((await c.patch(`${A}/routes/${group.id}`, { parentId: group.id })).status, 400, 'a group can’t sit inside itself');
    assert.equal((await c.patch(`${A}/routes/${page.id}`, { title: 'All shipments', hidden: true })).body.route.hidden, true);
    const routes = (await c.get(`${A}/logistics`)).body.routes;
    assert.equal(routes.length, 4);
    const order = routes.map((r) => r.id).reverse();
    assert.equal((await c.put(`${A}/routes-order`, { ids: order })).status, 204);
    assert.equal((await c.get(`${A}/logistics`)).body.routes[0].id, order[0]);
    assert.equal((await c.delete(`${A}/routes/${group.id}`)).status, 204);
    assert.equal((await c.get(`${A}/logistics`)).body.routes.some((r) => r.id === page.id), false, 'children go with their group');
    assert.equal(link.linkUrl, 'https://example.com/docs');
  });

  it('pages carry an ETag: a repeat visit is a 304, and any Studio edit changes it', async () => {
    const c = await boss(); await newApp(c);
    const { route } = await home(c);
    const first = await c.request('GET', `${A}/pages/${route.id}`);
    const etag = first.headers.get('etag'); assert.ok(etag);
    assert.equal((await c.request('GET', `${A}/pages/${route.id}`, undefined, { 'If-None-Match': etag })).status, 304);
    const tab = (await c.post(`${A}/pages/${route.id}/tabs`, { title: 'Second' })).body.tab;
    const again = await c.request('GET', `${A}/pages/${route.id}`, undefined, { 'If-None-Match': etag });
    assert.equal(again.status, 200); assert.notEqual(again.headers.get('etag'), etag);
    assert.equal(again.body.tabs.length, 2);
    assert.equal((await c.get(`${A}/pages/${route.id}?tab=${tab.id}`)).body.tabId, tab.id);
    assert.equal((await c.delete(`${A}/tabs/${tab.id}`)).status, 204);
    const only = (await c.get(`${A}/pages/${route.id}`)).body.tabs[0];
    assert.equal((await c.delete(`${A}/tabs/${only.id}`)).status, 409, 'a page keeps at least one tab');
  });
});

describe('blocks, layout and buttons', () => {
  it('adds blocks bound to an object with sensible fields, settings and buttons; validates what it is given', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId } = await home(c);
    assert.equal((await block(c, tabId, { kind: 'table' })).status, 400, 'a table needs an object');
    assert.equal((await block(c, tabId, { kind: 'table', objectId: '0198f000-0000-7000-8000-000000000000' })).status, 400, 'unknown object');
    assert.equal((await block(c, tabId, { kind: 'table', objectId: object.id, settings: { pageSize: 1 } })).status, 400, 'page size out of range');
    assert.equal((await block(c, tabId, { kind: 'table', objectId: object.id, settings: { nope: 1 } })).status, 400, 'unknown setting');
    assert.equal((await block(c, tabId, { kind: 'iframe', settings: { url: 'javascript:alert(1)' } })).status, 400, 'only web addresses');
    const created = await block(c, tabId, { kind: 'table', objectId: object.id });
    assert.equal(created.status, 201);
    const page = (await c.get(`${A}/pages/${(await c.get(`${A}/logistics`)).body.routes[0].id}`)).body;
    const t = page.layout.rows[0].columns[0].blocks[0];
    assert.equal(t.title, 'Shipments'); assert.equal(t.object.key, 'Shipment');
    assert.deepEqual(t.fields.map((f) => f.fieldKey), ['title', 'priority', 'weight', 'shipDate'], 'heavy fields like long text are not picked');
    assert.deepEqual(t.actions.block.map((a) => a.kind), ['add_new', 'filter', 'refresh']);
    assert.deepEqual(t.actions.row.map((a) => a.kind), ['view', 'edit', 'delete']);
    assert.equal(t.settings.pageSize, 20); assert.equal(t.settings.density, 'normal');
  });

  it('changes a block’s settings, title and fields; only real fields of its object are accepted', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId } = await home(c);
    const { id } = (await block(c, tabId, { kind: 'table', objectId: object.id })).body;
    assert.equal((await c.patch(`${A}/blocks/${id}`, { title: 'Open shipments', settings: { pageSize: 50, density: 'compact', defaultSortField: 'weight', defaultSortDir: 'desc' } })).status, 204);
    assert.equal((await c.patch(`${A}/blocks/${id}`, { settings: { defaultSortField: 'ghost' } })).status, 400);
    assert.equal((await c.put(`${A}/blocks/${id}/fields`, { fields: [{ fieldKey: 'weight', widthPx: 120 }, { fieldKey: 'title' }] })).status, 204);
    assert.equal((await c.put(`${A}/blocks/${id}/fields`, { fields: [{ fieldKey: 'ghost' }] })).status, 400);
    assert.equal((await c.put(`${A}/blocks/${id}/fields`, { fields: [{ fieldKey: 'title' }, { fieldKey: 'title' }] })).status, 400);
    const routeId = (await c.get(`${A}/logistics`)).body.routes[0].id;
    const t = (await c.get(`${A}/pages/${routeId}`)).body.layout.rows[0].columns[0].blocks[0];
    assert.equal(t.title, 'Open shipments'); assert.equal(t.settings.pageSize, 50); assert.equal(t.settings.defaultSortDir, 'desc');
    assert.deepEqual(t.fields.map((f) => [f.fieldKey, f.widthPx]), [['weight', 120], ['title', null]]);
    const text = (await block(c, tabId, { kind: 'markdown' })).body.id;
    assert.equal((await c.put(`${A}/blocks/${text}/fields`, { fields: [] })).status, 400, 'a text block has no field list');
    assert.equal((await c.patch(`${A}/blocks/${text}`, { settings: { content: '# Hello' } })).status, 204);
  });

  it('lays blocks out in rows and columns: add, move, resize and remove', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId, route } = await home(c);
    const a = (await block(c, tabId, { kind: 'table', objectId: object.id, title: 'A' })).body.id;
    const b = (await block(c, tabId, { kind: 'chart', objectId: object.id, title: 'B' })).body.id;
    const layout = async () => (await c.get(`${A}/pages/${route.id}`)).body.layout.rows.map((r) => r.columns.map((col) => col.blocks.map((x) => x.title)));
    assert.deepEqual(await layout(), [[['A']], [['B']]]);
    await c.post(`${A}/blocks/${b}/move`, { direction: 'up' });
    assert.deepEqual(await layout(), [[['B']], [['A']]], 'a block alone in its row moves the row');
    const rowId = (await c.get(`${A}/pages/${route.id}`)).body.layout.rows[0].id;
    assert.equal((await c.post(`${A}/tabs/${tabId}/rows/${rowId}/columns`, {})).status, 201);
    const cols = (await c.get(`${A}/pages/${route.id}`)).body.layout.rows[0].columns;
    assert.deepEqual(cols.map((x) => x.widthPct), [50, 50], 'a new column shares the width');
    const withB = (await block(c, tabId, { kind: 'markdown', title: 'C', columnId: cols[1].id })).body.id;
    assert.deepEqual(await layout(), [[['B'], ['C']], [['A']]]);
    assert.equal((await c.post(`${A}/blocks/${b}/move`, { direction: 'right' })).status, 204);
    assert.deepEqual(await layout(), [[[], ['C', 'B']], [['A']]]);
    await c.post(`${A}/blocks/${withB}/move`, { direction: 'down' });
    assert.deepEqual(await layout(), [[[], ['B', 'C']], [['A']]], 'blocks in a column swap places');
    assert.equal((await c.post(`${A}/blocks/${withB}/move`, { direction: 'right' })).status, 409, 'no column to the right');
    assert.equal((await c.patch(`${A}/columns/${cols[1].id}`, { widthPct: 70 })).status, 204);
    assert.equal((await c.patch(`${A}/columns/${cols[1].id}`, { widthPct: 2 })).status, 400);
    assert.equal((await c.delete(`${A}/columns/${cols[0].id}`)).status, 204);
    assert.deepEqual((await c.get(`${A}/pages/${route.id}`)).body.layout.rows[0].columns.map((x) => x.widthPct), [100], 'the remaining column takes the full width');
    assert.equal((await c.delete(`${A}/blocks/${a}`)).status, 204);
    assert.equal((await c.get(`${A}/pages/${route.id}`)).body.layout.rows.length, 1, 'an emptied row disappears');
  });

  it('buttons: only the ones a block can have, reordered, restyled and removed (no behaviour is stored)', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId, route } = await home(c);
    const id = (await block(c, tabId, { kind: 'table', objectId: object.id })).body.id;
    assert.equal((await c.post(`${A}/blocks/${id}/actions`, { scope: 'block', kind: 'submit' })).status, 400, 'a table has no submit button');
    assert.equal((await c.post(`${A}/blocks/${id}/actions`, { scope: 'row', kind: 'add_new' })).status, 400, 'add new is a toolbar button');
    const created = (await c.post(`${A}/blocks/${id}/actions`, { scope: 'block', kind: 'export', label: 'Download CSV', style: 'primary' })).body.action;
    assert.equal(created.label, 'Download CSV'); assert.equal(created.style, 'primary');
    const get = async () => (await c.get(`${A}/pages/${route.id}`)).body.layout.rows[0].columns[0].blocks[0].actions.block;
    assert.deepEqual((await get()).map((a) => a.kind), ['add_new', 'filter', 'refresh', 'export']);
    const ids = (await get()).map((a) => a.id).reverse();
    assert.equal((await c.put(`${A}/blocks/${id}/actions-order`, { scope: 'block', ids })).status, 204);
    assert.deepEqual((await get()).map((a) => a.kind), ['export', 'refresh', 'filter', 'add_new']);
    assert.equal((await c.put(`${A}/blocks/${id}/actions-order`, { scope: 'block', ids: ids.slice(1) })).status, 400);
    assert.equal((await c.patch(`${A}/actions/${created.id}`, { label: 'Save as CSV', openMode: 'modal', hidden: true })).body.action.openMode, 'modal');
    assert.equal((await c.delete(`${A}/actions/${created.id}`)).status, 204);
    assert.equal((await get()).length, 3);
  });
});

describe('block data (sorted, searched and paged on the server)', () => {
  it('tables, charts, kanban, calendar and cards come from the server, flagged as sample data', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId } = await home(c);
    const table = (await block(c, tabId, { kind: 'table', objectId: object.id })).body.id;
    const data = async (id, q = '') => (await c.get(`${A}/blocks/${id}/data${q}`)).body;
    const p1 = await data(table);
    assert.equal(p1.sample, true); assert.equal(p1.rows.length, 20); assert.ok(p1.total > 20);
    assert.deepEqual(p1.columns.map((x) => x.key), ['title', 'priority', 'weight', 'shipDate']);
    const p2 = await data(table, '?page=2&pageSize=10');
    assert.equal(p2.rows.length, 10); assert.equal(p2.page, 2); assert.notEqual(p2.rows[0].id, p1.rows[0].id);
    const asc = (await data(table, '?sort=weight&dir=asc&pageSize=50')).rows.map((r) => Number(r.cells.weight));
    assert.deepEqual(asc, [...asc].sort((x, y) => x - y), 'sorted on the server');
    const found = await data(table, '?q=urgent&pageSize=200');
    assert.ok(found.total > 0 && found.total < p1.total);
    assert.ok(found.rows.every((r) => Object.values(r.cells).some((v) => JSON.stringify(v).toLowerCase().includes('urgent'))), 'search is applied on the server');
    assert.deepEqual((await data(table, '?q=urgent&pageSize=200')).rows.map((r) => r.id), found.rows.map((r) => r.id), 'the same request gives the same sample');

    const chart = (await block(c, tabId, { kind: 'chart', objectId: object.id })).body.id;
    const ch = await data(chart);
    assert.equal(ch.type, 'bar'); assert.deepEqual(ch.series.map((s) => s.label), ['Low', 'Urgent'], 'grouped by the picklist chosen for the chart');
    const kanban = (await block(c, tabId, { kind: 'kanban', objectId: object.id })).body.id;
    assert.deepEqual((await data(kanban)).columns.map((x) => x.label), ['Low', 'Urgent']);
    const cal = (await block(c, tabId, { kind: 'calendar', objectId: object.id })).body.id;
    assert.ok((await data(cal)).events.length > 0);
    const list = (await block(c, tabId, { kind: 'list', objectId: object.id })).body.id;
    assert.ok((await data(list)).cards.length > 0);
    const details = (await block(c, tabId, { kind: 'details', objectId: object.id })).body.id;
    assert.ok((await data(details)).fields.length > 0);
  });
});

describe('isolation and speed', () => {
  it('never crosses organisations', async () => {
    const a = await boss(); const b = await boss();
    await newApp(a); const { route, tabId } = await home(a);
    assert.equal((await b.get(`${A}/logistics`)).status, 404);
    assert.equal((await b.get(`${A}/pages/${route.id}`)).status, 404);
    assert.equal((await b.post(`${A}/tabs/${tabId}/blocks`, { kind: 'markdown' })).status, 404);
    assert.equal((await b.get(A)).body.apps.length, 0);
    assert.equal((await newApp(b)).key, 'logistics', 'the same address is free in another organisation');
  });

  it('a cached page is served in a few milliseconds', async () => {
    const c = await boss(); await newApp(c); const object = await shipment(c);
    const { tabId, route } = await home(c);
    for (let i = 0; i < 4; i += 1) await block(c, tabId, { kind: i % 2 ? 'table' : 'chart', objectId: object.id });
    const tenantId = (await c.get('/me')).body.activeTenantId;
    const ctx = { tenantId, routeId: route.id, auth: { userId: 'x' }, membership: { role: 'owner' }, workspaceId: null };
    const { appService } = server.container;
    await appService.pageBundle(ctx);
    const times = [];
    for (let i = 0; i < 300; i += 1) { const t = process.hrtime.bigint(); await appService.pageBundle(ctx); times.push(Number(process.hrtime.bigint() - t) / 1e6); }
    times.sort((x, y) => x - y);
    const p99 = times[Math.floor(times.length * 0.99)];
    console.log(`      warm page bundle: median ${times[150].toFixed(3)} ms, p99 ${p99.toFixed(3)} ms`);
    assert.ok(p99 < 5, `p99 ${p99} ms`);
  });
});
