import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { AccessService } from '../src/modules/access/access.service.js';
import { createAccessAddons } from '../src/modules/access/addons.service.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const S = '/setup'; const O = '/objects';
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

describe('permission-set add-ons', () => {
  it('is on in this environment and listed in /me', async () => {
    const { client } = await registerUser(server);
    assert.equal((await client.get('/me')).body.features.accessAddons, true);
  });

  it('adds access on top of role + profile, and takes it away again', async () => {
    const { client: boss } = await registerUser(server);
    const { person, id } = await join(boss, 'member');
    const set = await boss.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Lead Cleaner', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'Yes' });
    assert.equal(set.status, 201, JSON.stringify(set.body));

    const catalogue = (await boss.get(`${S}/access/permission-sets`)).body.permissionSets;
    assert.ok(catalogue.some((c) => c.name === 'Lead Cleaner' && c.users === 0), 'a new Object Settings container is offered as an add-on');
    assert.ok(!catalogue.some((c) => c.name === 'Standard User'), 'profiles are not add-ons');

    const lead = (await person.post(`${O}/Lead/records`, { name: 'Ada Lovelace', company: 'Analytical' })).body.record;
    assert.equal((await person.post(`${O}/Lead/records/delete`, { ids: [lead.id] })).status, 403, 'a member on the Standard User profile cannot delete');

    const assigned = await boss.put(`${S}/users/${id}/permission-sets`, { name: 'Lead Cleaner' });
    assert.equal(assigned.status, 200);
    assert.deepEqual(assigned.body.permissionSets.map((p) => p.name), ['Lead Cleaner']);
    assert.equal((await boss.get(`${S}/users/${id}`)).body.permissionSets[0].name, 'Lead Cleaner', 'shown on the user details');
    assert.equal((await person.post(`${O}/Lead/records/delete`, { ids: [lead.id] })).status, 200, 'the add-on grants delete at once');

    const lead2 = (await person.post(`${O}/Lead/records`, { name: 'Grace Hopper' })).body.record;
    const removed = await boss.delete(`${S}/users/${id}/permission-sets/${encodeURIComponent('Lead Cleaner')}`);
    assert.deepEqual(removed.body.permissionSets, []);
    assert.equal((await person.post(`${O}/Lead/records/delete`, { ids: [lead2.id] })).status, 403, 'and it goes again when removed');
    const audit = (await boss.get(`${S}/pages/view-setup-audit-trail/records`)).body.items.map((r) => r.summary ?? r.action).join('|');
    assert.match(audit, /Added permission set “Lead Cleaner”/);
  });

  it('refuses unknown sets, strangers, self-service and non-admins', async () => {
    const { client: boss } = await registerUser(server);
    const { person, id } = await join(boss, 'member');
    const me = (await boss.get('/me')).body.user.id;
    assert.equal((await boss.put(`${S}/users/${id}/permission-sets`, { name: 'No Such Set' })).status, 400);
    assert.equal((await boss.put(`${S}/users/01a20419-8062-74b9-8324-000000000000/permission-sets`, { name: 'Developer Tools' })).status, 404);
    assert.equal((await boss.put(`${S}/users/${me}/permission-sets`, { name: 'Developer Tools' })).status, 403, 'nobody changes their own access');
    assert.equal((await person.put(`${S}/users/${id}/permission-sets`, { name: 'Developer Tools' })).status, 403, 'members cannot assign');
    const { client: elsewhere } = await registerUser(server);
    assert.equal((await elsewhere.put(`${S}/users/${id}/permission-sets`, { name: 'Developer Tools' })).status, 404, 'another tenant cannot reach this person');
  });

  it('counts exactly, with several conditions at once and no cap', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Meera');
    await join(boss, 'viewer', 'Zed');
    await boss.put(`${S}/users/${a.id}/permission-sets`, { name: 'Developer Tools' });
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
    assert.equal(await count('?noProfile=true&role=owner'), 1);
    assert.equal((await boss.get(`${S}/users/count?role=bogus`)).status, 400);
    assert.equal((await boss.get(`${S}/access/permission-sets`)).body.permissionSets.find((p) => p.name === 'Developer Tools').users, 1);
  });
});

describe('when the feature is off', () => {
  it('nothing is constructed', () => {
    assert.equal(createAccessAddons({ enabled: false, db: null, cache: null, repos: null, seed: null }), null);
  });
  it('the access check works exactly as before without it', async () => {
    const automation = { rules: async () => [] };
    const cache = { rememberValue: async (ns, k, o, load) => load() };
    const access = new AccessService({ automation, cache, seed: async () => {} });
    const perms = await access.forObject({ tenantId: 'w', userId: 'u', actor: { role: 'member', profile: null }, email: 'a@b.c' }, { key: 'Lead', fields: [] });
    assert.deepEqual([perms.read, perms.create, perms.edit, perms.delete], [true, true, true, false]);
  });
});

describe('latency', () => {
  it('resolves access for people with add-ons in well under a millisecond once warm (100 000 people)', async () => {
    let dbCalls = 0;
    const db = { execute: async () => { dbCalls++; return { rows: [{ permission_set: 'Developer Tools' }, { permission_set: 'Lead Cleaner' }] }; } };
    const grants = [{ data: { permission_set: 'Standard User', object: 'All', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'No' } }, { data: { permission_set: 'Lead Cleaner', object: 'Lead', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'Yes' } }];
    const cache = { rememberValue: async (ns, k, o, load) => (ns.endsWith('object-settings') && k === 'grants' ? { 'Standard User': { All: { read: true, create: true, edit: true, delete: false } }, 'Lead Cleaner': { Lead: { read: true, create: true, edit: true, delete: true } } } : k === 'by-user' ? {} : k === 'owd' ? {} : []), bump: async () => {} };
    const addons = createAccessAddons({ enabled: true, db, cache, repos: {}, seed: async () => {}, max: 200_000, ttlMs: 60_000 });
    const access = new AccessService({ automation: { rules: async () => grants }, cache, seed: async () => {}, addons });
    const def = { key: 'Lead', fields: [{ key: 'lead_owner' }] };
    const ctx = (i) => ({ tenantId: 'w1', userId: `u${i}`, actor: { role: 'member', profile: 'Standard User' }, email: `u${i}@x.co` });
    const N = 100_000;
    for (let i = 0; i < N; i++) await access.forObject(ctx(i), def); // cold: one primary-key lookup each
    assert.equal(dbCalls, N);
    const samples = new Float64Array(200_000);
    for (let i = 0; i < samples.length; i++) {
      const c = ctx((i * 7919) % N);
      const t = process.hrtime.bigint();
      const p = await access.forObject(c, def);
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
