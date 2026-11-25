import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AccessService } from '../src/modules/access/access.service.js';
import { createAccessAddons } from '../src/modules/access/addons.service.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const S = '/setup';
async function join(boss, role, firstName = 'Meera') {
  const ws = (await boss.get('/me')).body.activeTenantId;
  const email = uniqueEmail();
  await boss.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName, lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/tenants/${ws}/switch`);
  const id = (await person.get('/me')).body.user.id;
  return { person, email, ws, id };
}

/** What the access check sees for one person: the real membership row, exactly as a request would carry it. */
async function ctxOf({ ws, id, email }) {
  return { tenantId: ws, userId: id, email, actor: await server.container.repos.memberships.find(ws, id) };
}
const can = async (who, object = 'Lead') => { const p = await server.container.access.forObject(await ctxOf(who), object); return [p.read, p.create, p.edit, p.delete]; };

describe('profiles, permission sets and the access check (real tables)', () => {
  it('falls back to the role, then a profile decides, then permission sets add to it', async () => {
    const { client: boss } = await registerUser(server);
    const who = await join(boss, 'member');
    assert.deepEqual(await can(who), [true, true, true, false], 'a member with no profile gets the role baseline');

    // the profile decides: Read Only
    assert.equal((await boss.patch(`${S}/pages/users/records/${who.id}`, { profile: 'Read Only' })).status, 200);
    assert.deepEqual(await can(who), [true, false, false, false], 'Read Only means read only');
    assert.equal((await boss.patch(`${S}/pages/users/records/${who.id}`, { profile: 'No Such Profile' })).status, 400);

    // a permission set adds on top, for one object only
    const set = await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Lead Cleaner', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'Yes' });
    assert.equal(set.status, 201, JSON.stringify(set.body));
    const catalogue = (await boss.get(`${S}/access/permission-sets`)).body.permissionSets;
    assert.ok(catalogue.some((c) => c.name === 'Lead Cleaner' && c.users === 0), 'a new permission set is offered as an add-on');
    assert.ok(!catalogue.some((c) => c.name === 'Standard User'), 'profiles are not add-ons');

    const assigned = await boss.put(`${S}/users/${who.id}/permission-sets`, { name: 'Lead Cleaner' });
    assert.equal(assigned.status, 200);
    assert.deepEqual(assigned.body.permissionSets.map((p) => p.name), ['Lead Cleaner']);
    assert.equal((await boss.get(`${S}/users/${who.id}`)).body.permissionSets[0].name, 'Lead Cleaner', 'shown on the user details');
    assert.deepEqual(await can(who, 'Lead'), [true, true, true, true], 'the set grants everything on Lead at once');
    assert.deepEqual(await can(who, 'Account'), [true, false, false, false], 'and nothing on other objects');

    const removed = await boss.delete(`${S}/users/${who.id}/permission-sets/${encodeURIComponent('Lead Cleaner')}`);
    assert.deepEqual(removed.body.permissionSets, []);
    assert.deepEqual(await can(who, 'Lead'), [true, false, false, false], 'and it goes again when removed');
    const audit = (await boss.get(`${S}/pages/view-setup-audit-trail/records`)).body.items.map((r) => r.action).join('|');
    assert.match(audit, /Added permission set “Lead Cleaner”/);
  });

  it('sharing defaults narrow what a member sees; admins always see everything', async () => {
    const { client: boss } = await registerUser(server);
    const who = await join(boss, 'member');
    const lead = (await boss.get(`${S}/pages/sharing-defaults/records?q=Lead`)).body.items.find((r) => r.object === 'Lead');
    const scopeOf = async (w, o = 'Lead') => (await server.container.access.forObject(await ctxOf(w), o)).scope;
    assert.equal(await scopeOf(who), 'all');
    await boss.patch(`${S}/pages/sharing-defaults/records/${lead.id}`, { default_internal_access: 'Private' });
    assert.equal(await scopeOf(who), 'own', 'Private = own records only');
    assert.equal(await scopeOf({ ws: who.ws, id: (await boss.get('/me')).body.user.id, email: 'x' }), 'all', 'the owner sees everything');
    await boss.patch(`${S}/pages/sharing-defaults/records/${lead.id}`, { default_internal_access: 'Public Read Only' });
    assert.equal(await scopeOf(who), 'read-all');
    assert.equal(await scopeOf(who, 'Account'), 'all', 'other objects are untouched');
  });

  it('removing a profile or a permission set removes its grants; removing a member removes their assignments', async () => {
    const { client: boss } = await registerUser(server);
    const who = await join(boss, 'member');
    await boss.post(`${S}/pages/object-settings/records`, { object: 'Case', permission_set: 'Case Closer', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'Yes' });
    await boss.put(`${S}/users/${who.id}/permission-sets`, { name: 'Case Closer' });
    assert.equal((await boss.get(`${S}/access/permission-sets`)).body.permissionSets.find((p) => p.name === 'Case Closer').users, 1);
    assert.equal((await boss.patch(`${S}/pages/users/records/${who.id}`, { role: 'Viewer' })).status, 200);
    const removed = await boss.post(`${S}/pages/users/records/delete`, { ids: [who.id] });
    assert.equal(removed.status, 200);
    assert.equal((await boss.get(`${S}/access/permission-sets`)).body.permissionSets.find((p) => p.name === 'Case Closer').users, 0, 'the assignment went with the member');
  });
});

describe('permission-set add-ons', () => {
  it('is on in this environment and listed in /me', async () => {
    const { client } = await registerUser(server);
    assert.equal((await client.get('/me')).body.features.accessAddons, true);
  });

  it('refuses unknown sets, strangers, self-service and non-admins', async () => {
    const { client: boss } = await registerUser(server);
    const { person, id } = await join(boss, 'member');
    const me = (await boss.get('/me')).body.user.id;
    await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Developer Tools', read: 'Yes', create: 'No', edit: 'No', delete: 'No' });
    assert.equal((await boss.put(`${S}/users/${id}/permission-sets`, { name: 'No Such Set' })).status, 400);
    assert.equal((await boss.put(`${S}/users/01a20419-8062-74b9-8324-000000000000/permission-sets`, { name: 'Developer Tools' })).status, 404);
    assert.equal((await boss.put(`${S}/users/${me}/permission-sets`, { name: 'Developer Tools' })).status, 403, 'nobody changes their own access');
    assert.equal((await person.put(`${S}/users/${id}/permission-sets`, { name: 'Developer Tools' })).status, 403, 'members cannot assign');
    const { client: elsewhere } = await registerUser(server);
    assert.equal((await elsewhere.put(`${S}/users/${id}/permission-sets`, { name: 'Developer Tools' })).status, 404, 'another tenant cannot reach this person');
  });

  it('Manage Assignments lists and changes assignments through the same table', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Meera');
    await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Developer Tools', read: 'Yes', create: 'No', edit: 'No', delete: 'No' });
    const made = await boss.post(`${S}/pages/manage-assignments/records`, { user: a.email, permission_set: 'Developer Tools' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const rows = (await boss.get(`${S}/pages/manage-assignments/records`)).body.items;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].permission_set, 'Developer Tools');
    assert.equal((await boss.get(`${S}/users/${a.id}`)).body.permissionSets[0].name, 'Developer Tools');
    assert.equal((await boss.post(`${S}/pages/manage-assignments/records`, { user: 'nobody@example.com', permission_set: 'Developer Tools' })).status, 400);
    assert.equal((await boss.post(`${S}/pages/manage-assignments/records/delete`, { ids: [rows[0].id] })).body.removed, 1);
    assert.deepEqual((await boss.get(`${S}/users/${a.id}`)).body.permissionSets, []);
  });

  it('counts exactly, with several conditions at once and no cap', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Meera');
    await join(boss, 'viewer', 'Zed');
    await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Developer Tools', read: 'Yes', create: 'No', edit: 'No', delete: 'No' });
    await boss.put(`${S}/users/${a.id}/permission-sets`, { name: 'Developer Tools' });
    await boss.patch(`${S}/pages/users/records/${a.id}`, { profile: 'Standard User' });
    const count = async (qs) => { const r = await boss.get(`${S}/users/count${qs}`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.count; };
    assert.equal(await count(''), 3);
    assert.equal(await count('?role=member'), 1);
    assert.equal(await count('?role=member,viewer'), 2, 'several values of one condition = any of them');
    assert.equal(await count('?permissionSet=Developer%20Tools'), 1);
    assert.equal(await count('?noPermissionSet=true'), 2);
    assert.equal(await count('?role=member&permissionSet=Developer%20Tools'), 1, 'conditions combine');
    assert.equal(await count('?role=viewer&permissionSet=Developer%20Tools'), 0);
    assert.equal(await count('?q=meera'), 1);
    assert.equal(await count('?role=member&q=zed'), 0);
    assert.equal(await count('?profile=Standard%20User'), 1);
    assert.equal(await count('?noProfile=true'), 2);
    assert.equal(await count('?noProfile=true&role=owner'), 1);
    assert.equal((await boss.get(`${S}/users/count?role=bogus`)).status, 400);
    assert.equal((await boss.get(`${S}/access/permission-sets`)).body.permissionSets.find((p) => p.name === 'Developer Tools').users, 1);
  });
});

describe('when the feature is off', () => {
  it('nothing is constructed', () => {
    assert.equal(createAccessAddons({ enabled: false, db: null, repos: null }), null);
  });
  it('the access check works from role and profile alone', async () => {
    const repos = { access: { allGrants: async () => [{ profile_id: 'p1', permission_set_id: null, object_key: 'All', can_read: true, can_create: false, can_edit: false, can_delete: false }], sharingOverrides: async () => [] } };
    const cache = { rememberValue: async (ns, k, o, load) => load() };
    const access = new AccessService({ repos, cache });
    const base = await access.forObject({ tenantId: 'w', userId: 'u', actor: { role: 'member', profileId: null }, email: 'a@b.c' }, 'Lead');
    assert.deepEqual([base.read, base.create, base.edit, base.delete], [true, true, true, false]);
    const readOnly = await access.forObject({ tenantId: 'w', userId: 'u', actor: { role: 'member', profileId: 'p1' }, email: 'a@b.c' }, 'Lead');
    assert.deepEqual([readOnly.read, readOnly.create, readOnly.edit, readOnly.delete], [true, false, false, false]);
  });
});

describe('latency', () => {
  it('resolves access for people with add-ons in well under a millisecond once warm (100 000 people)', async () => {
    let dbCalls = 0;
    const repos = {
      access: {
        assignedSetIds: async () => { dbCalls++; return ['s-devtools', 's-leadcleaner']; },
        allGrants: async () => [
          { profile_id: 'p-standard', permission_set_id: null, object_key: 'All', can_read: true, can_create: true, can_edit: true, can_delete: false },
          { profile_id: null, permission_set_id: 's-leadcleaner', object_key: 'Lead', can_read: true, can_create: true, can_edit: true, can_delete: true },
        ],
        sharingOverrides: async () => [],
      },
    };
    const memo = new Map();
    const cache = { rememberValue: async (ns, k, o, load) => { if (!memo.has(k)) memo.set(k, await load()); return memo.get(k); } };
    const addons = createAccessAddons({ enabled: true, db: {}, repos, max: 200_000, ttlMs: 60_000 });
    const access = new AccessService({ repos, cache, addons });
    const ctx = (i) => ({ tenantId: 'w1', userId: `u${i}`, actor: { role: 'member', profileId: 'p-standard' }, email: `u${i}@x.co` });
    const N = 100_000;
    for (let i = 0; i < N; i++) await access.forObject(ctx(i), 'Lead'); // cold: one primary-key lookup each
    assert.equal(dbCalls, N);
    const samples = new Float64Array(200_000);
    for (let i = 0; i < samples.length; i++) {
      const c = ctx((i * 7919) % N);
      const t = process.hrtime.bigint();
      const p = await access.forObject(c, 'Lead');
      samples[i] = Number(process.hrtime.bigint() - t) / 1e6;
      if (!p.delete) assert.fail('add-on lost');
    }
    assert.equal(dbCalls, N, 'warm checks never touch the database');
    samples.sort();
    const p50 = samples[Math.floor(samples.length * 0.5)]; const p99 = samples[Math.floor(samples.length * 0.99)]; const max = samples[samples.length - 1];
    console.log(`access check, warm, ${N} people: p50 ${p50.toFixed(4)} ms · p99 ${p99.toFixed(4)} ms · max ${max.toFixed(3)} ms`);
    assert.ok(p99 < 1, `p99 ${p99} ms must stay under 1 ms`);
  });
});
