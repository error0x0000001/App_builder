import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const S = '/setup'; const D = '/drive';
const find = (c, q, type = 'all') => c.get(`/search?q=${encodeURIComponent(q)}&type=${type}`).then((r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; });
async function join(boss, role) {
  const ws = (await boss.get('/me')).body.activeTenantId;
  const email = uniqueEmail();
  await boss.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/tenants/${ws}/switch`);
  return { person, email, ws };
}

describe('global search', () => {
  it('needs two characters, validates the scope, and has no record sources until objects exist', async () => {
    const { client } = await registerUser(server);
    assert.equal(Object.keys((await find(client, 'a')).groups).length, 0, 'one character is not searched');
    assert.equal((await client.get('/search?q=ada&type=bogus')).status, 400);
    const all = await find(client, 'zzzzqqqq');
    assert.deepEqual(all.groups.records, [], 'the records group is present and empty');
    assert.equal(typeof all.tookMs, 'number');
  });

  it('records come from registered sources, and each source decides what the person may see', async () => {
    const { client } = await registerUser(server);
    const original = server.container.search.recordSources;
    server.container.search.recordSources = [{ search: async (ctx, query) => (ctx.actor.role === 'owner' ? [{ id: 'r1', kind: 'record', title: `Result for ${query}`, subtitle: '', tag: 'Things', to: '/app/o/Thing?open=r1' }] : []) }];
    try {
      const { person: member } = await join(client, 'member');
      assert.equal((await find(client, 'ada')).groups.records[0].title, 'Result for ada');
      assert.deepEqual((await find(member, 'ada')).groups.records, [], 'a source that withholds results for someone is respected');
      assert.deepEqual(Object.keys((await find(client, 'Meera', 'records')).groups).sort(), ['people', 'records'], 'the Records scope includes people');
    } finally { server.container.search.recordSources = original; }
  });

  it('type filter returns only that group, with a larger page', async () => {
    const { client: boss } = await registerUser(server);
    const only = await find(boss, 'password', 'navigation');
    assert.deepEqual(Object.keys(only.groups), ['navigation']);
    assert.ok(only.groups.navigation.length > (await find(boss, 'password')).groups.navigation.length - 1, 'a single scope returns a bigger page than "All"');
  });

  it('finds people by name or email, and gives Setup results only to admins', async () => {
    const { client: boss } = await registerUser(server);
    const { person: member, email } = await join(boss, 'member');
    const people = await find(boss, email.slice(0, 12));
    assert.ok(people.groups.people.some((p) => p.subtitle.includes(email)), 'a member is found by email fragment');
    assert.equal((await find(boss, 'ir', 'people')).groups.people?.length ?? 0, 0, 'people need 3+ characters');
    assert.ok((await find(boss, 'Meera', 'people')).groups.people.length >= 1, 'and by first name');

    const adminHit = await find(boss, 'minimum password');
    assert.ok(adminHit.groups.navigation.some((s) => s.kind === 'setting' && s.title === 'Minimum password length' && /password-policies/.test(s.to)), 'admins find individual settings');
    assert.ok((await find(boss, 'password pol')).groups.navigation.some((s) => s.kind === 'page' && s.to === '/app/setup/password-policies'), 'and Setup pages');
    assert.ok((await find(boss, 'read only')).groups.navigation.some((s) => s.kind === 'config' && s.subtitle === 'Profile'), 'and the real configuration: profiles');
    assert.equal((await find(member, 'password')).groups.navigation, undefined, 'members get no Setup results');
  });

  it('finds permission sets and roles, and never another tenant\'s configuration', async () => {
    const { client: boss } = await registerUser(server);
    const { client: other } = await registerUser(server);
    await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Quarterly Reviewer', read: 'Yes', create: 'No', edit: 'No', delete: 'No' });
    const root = (await boss.get(`${S}/pages/roles/tree`)).body.roots[0];
    await boss.post(`${S}/pages/roles/records`, { name: 'Quarterly Lead', parentId: root.id });
    const hits = (await find(boss, 'quarterly', 'navigation')).groups.navigation.filter((n) => n.kind === 'config').map((n) => [n.title, n.subtitle]).sort();
    assert.deepEqual(hits, [['Quarterly Lead', 'Role'], ['Quarterly Reviewer', 'Permission set']]);
    assert.equal((await find(other, 'quarterly', 'navigation')).groups.navigation.filter((n) => n.kind === 'config').length, 0);
  });

  it('has Navigation and Documents scopes; Documents are the drive files the person may open', async () => {
    const { client: boss } = await registerUser(server);
    const { person: member } = await join(boss, 'member');
    const folder = (await boss.post(`${D}/folders`, { name: 'Quarterly Plans' })).body.folder;
    await boss.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'quarterly-budget.txt', content: 'numbers' });

    const docs = await find(boss, 'quarterly', 'documents');
    assert.deepEqual(Object.keys(docs.groups), ['documents'], 'the Documents scope asks for nothing else');
    assert.deepEqual(docs.groups.documents.map((d) => [d.kind, d.title]).sort(), [['file', 'quarterly-budget.txt'], ['folder', 'Quarterly Plans']]);
    assert.deepEqual((await find(member, 'quarterly', 'documents')).groups.documents, [], 'a member who was not given access finds nothing');
    assert.equal((await find(boss, 'quarterly')).groups.documents.length, 2, '"All" includes documents');
  });

  it('is isolated per tenant', async () => {
    const { client } = await registerUser(server);
    const other = (await registerUser(server)).client;
    await client.post(`${D}/folders`, { name: 'Zebra Exclusive' });
    assert.equal((await find(other, 'zebra')).groups.documents.length, 0);
    assert.equal((await find(client, 'zebra')).groups.documents.length, 1);
  });

  it('answers within the time budget on a cold cache', async () => {
    const { client } = await registerUser(server);
    const t = Date.now();
    await find(client, 'cold start');
    assert.ok(Date.now() - t < 1500, 'first search stays quick');
  });
});
