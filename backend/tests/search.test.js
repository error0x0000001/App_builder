import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const O = '/objects'; const S = '/setup';
const find = (c, q, type = 'all') => c.get(`/search?q=${encodeURIComponent(q)}&type=${type}`).then((r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; });
async function join(boss, role) {
  const ws = (await boss.get('/me')).body.activeWorkspaceId;
  const email = uniqueEmail();
  await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/workspaces/${ws}/switch`);
  return { person, email, ws };
}

describe('global search', () => {
  it('finds records by prefix and by substring, across objects, and needs two characters', async () => {
    const { client } = await registerUser(server);
    await client.post(`${O}/Lead/records`, { name: 'Ada Lovelace', company: 'Analytical Engines' });
    await client.post(`${O}/Account/records`, { name: 'Adaptive Systems' });
    await client.post(`${O}/Contact/records`, { name: 'Countess Lovelace' });

    const prefix = await find(client, 'ada');
    assert.deepEqual(prefix.groups.records.map((r) => r.title).sort(), ['Ada Lovelace', 'Adaptive Systems']);
    const contains = await find(client, 'lovelace');
    assert.deepEqual(contains.groups.records.map((r) => r.title).sort(), ['Ada Lovelace', 'Countess Lovelace'], 'substring matches too');
    assert.match(contains.groups.records[0].tag, /Leads|Contacts/, 'tag names the object');
    assert.match(contains.groups.records[0].to, /^\/app\/o\/(Lead|Contact)\?open=/);
    assert.equal(Object.keys((await find(client, 'a')).groups).length, 0, 'one character is not searched');
    assert.equal((await find(client, 'zzzzqqqq')).groups.records.length, 0);
    assert.equal((await client.get('/search?q=ada&type=bogus')).status, 400);
  });

  it('type filter returns only that group, with a larger page', async () => {
    const { client } = await registerUser(server);
    for (let i = 0; i < 8; i++) await client.post(`${O}/Lead/records`, { name: `Searchy ${i}` });
    const all = await find(client, 'searchy');
    assert.equal(all.groups.records.length, 5, '"All" shows the top 5 per group');
    const only = await find(client, 'searchy', 'records');
    assert.deepEqual(Object.keys(only.groups).sort(), ['people', 'records'], 'the Records scope is records + people');
    assert.equal(only.groups.records.length, 8);
    assert.deepEqual(Object.keys((await find(client, 'searchy', 'people')).groups), ['people']);
  });

  it('respects sharing and permissions: nobody finds what they cannot open', async () => {
    const { client: boss } = await registerUser(server);
    const { person: a } = await join(boss, 'member');
    const { person: b } = await join(boss, 'member');
    await a.post(`${O}/Lead/records`, { name: 'Confidential Alpha' });
    await b.post(`${O}/Lead/records`, { name: 'Confidential Beta' });
    assert.equal((await find(a, 'confidential')).groups.records.length, 2, 'open sharing: both visible');

    const owd = (await boss.get(`${S}/pages/sharing-defaults/records?q=Lead`)).body.items.find((r) => r.object === 'Lead');
    await boss.patch(`${S}/pages/sharing-defaults/records/${owd.id}`, { default_internal_access: 'Private' });
    assert.deepEqual((await find(a, 'confidential')).groups.records.map((r) => r.title), ['Confidential Alpha'], 'Private: only own records');
    assert.equal((await find(boss, 'confidential')).groups.records.length, 2, 'admins find everything');

    const members = (await boss.get(`${S}/pages/users/records`)).body.items;
    const bEmail = (await b.get('/me')).body.user.email;
    await boss.patch(`${S}/pages/users/records/${members.find((m) => m.email === bEmail).id}`, { profile: 'Minimum Access - API Only' });
    assert.equal((await find(b, 'confidential')).groups.records.length, 0, 'a profile without read access finds nothing');
  });

  it('finds people by name or email, and gives setup results only to admins', async () => {
    const { client: boss } = await registerUser(server);
    const { person: member, email } = await join(boss, 'member');
    const people = await find(boss, email.slice(0, 12));
    assert.ok(people.groups.people.some((p) => p.subtitle.includes(email)), 'a member is found by email fragment');
    assert.equal((await find(boss, 'ir', 'people')).groups.people?.length ?? 0, 0, 'people need 3+ characters');
    assert.ok((await find(boss, 'Meera', 'people')).groups.people.length >= 1, 'and by first name');

    await boss.get(`${S}/pages/profiles/records`); // sample profiles are created the first time that page is opened
    const adminHit = await find(boss, 'minimum password');
    assert.ok(adminHit.groups.navigation.some((s) => s.kind === 'setting' && s.title === 'Minimum password length' && /password-policies/.test(s.to)), 'admins find individual settings');
    assert.ok((await find(boss, 'password pol')).groups.navigation.some((s) => s.kind === 'page' && s.to === '/app/setup/password-policies'), 'and Setup pages');
    assert.ok((await find(boss, 'read only')).groups.navigation.some((s) => s.kind === 'config' && s.subtitle === 'Profiles'), 'and Setup records such as profiles');
    assert.equal((await find(member, 'password')).groups.navigation, undefined, 'members get no Setup results');
  });

  it('has Navigation and Documents scopes; Records covers people; documents are admin-only', async () => {
    const { client: boss } = await registerUser(server);
    const { person: member } = await join(boss, 'member');
    const tpl = await boss.post(`${S}/pages/email-templates/records`, { email_template_name: 'Quarterly Welcome Pack' });
    assert.equal(tpl.status, 201, JSON.stringify(tpl.body));
    await boss.post(`${S}/pages/profiles/records`, { profile_name: 'Quarterly Reviewer' });

    const docs = await find(boss, 'quarterly', 'documents');
    assert.deepEqual(Object.keys(docs.groups), ['documents'], 'the Documents scope asks for nothing else');
    assert.deepEqual(docs.groups.documents.map((d) => [d.kind, d.title, d.tag]), [['document', 'Quarterly Welcome Pack', 'Email Templates']]);
    assert.match(docs.groups.documents[0].to, /^\/app\/setup\/email-templates\?q=/);

    const nav = await find(boss, 'quarterly', 'navigation');
    assert.deepEqual(Object.keys(nav.groups), ['navigation']);
    assert.ok(nav.groups.navigation.some((n) => n.title === 'Quarterly Reviewer' && n.tag === 'Configuration'), 'configuration records are navigation');
    assert.ok(!nav.groups.navigation.some((n) => n.title === 'Quarterly Welcome Pack'), 'documents are not repeated under navigation');

    assert.ok(docs.groups.documents && (await find(boss, 'quarterly')).groups.documents.length === 1, '"All" includes documents');
    assert.equal((await find(member, 'quarterly', 'documents')).groups.documents, undefined, 'members never see Setup documents');
    assert.deepEqual(Object.keys((await find(boss, 'Meera', 'records')).groups).sort(), ['people', 'records'], 'the Records scope includes people');
  });

  it('is isolated per workspace and exposes the matching record by id', async () => {
    const { client } = await registerUser(server);
    const other = (await registerUser(server)).client;
    const made = await client.post(`${O}/Lead/records`, { name: 'Zebra Exclusive' });
    assert.equal((await find(other, 'zebra')).groups.records.length, 0);
    const hit = (await find(client, 'zebra')).groups.records[0];
    const id = new URL(hit.to, 'http://x').searchParams.get('open');
    assert.equal(id, made.body.record.id);
    assert.equal((await client.get(`${O}/Lead/records/${id}`)).body.record.name, 'Zebra Exclusive');
    assert.equal((await other.get(`${O}/Lead/records/${id}`)).status, 404, 'other tenants cannot open it');
  });

  it('answers within the time budget on a cold cache', async () => {
    const { client } = await registerUser(server);
    const t = Date.now();
    const body = await find(client, 'cold start');
    assert.ok(Date.now() - t < 1500, 'first search (seeds object definitions) stays quick');
    assert.equal(typeof body.tookMs, 'number');
  });
});
