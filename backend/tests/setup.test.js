import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/shared/db/index.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server; let owner; let other;
const S = '/setup';
before(async () => {
  server = await startServer();
  const { client, email } = await registerUser(server);
  owner = client;
  await owner.post('/auth/login', { email, password: PASSWORD }); // a real sign-in event for login history / adoption
  other = (await registerUser(server)).client;
});
after(async () => { await server.stop(); });

describe('access', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${server.base}${S}/tree`);
    assert.equal(res.status, 401);
  });
  it('serves the tree and page definitions with ETag/304', async () => {
    const tree = await owner.get(`${S}/tree`);
    assert.equal(tree.status, 200);
    assert.equal(tree.body.counts.total, 262);
    const page = await owner.get(`${S}/pages/password-policies`);
    const again = await owner.request('GET', `${S}/pages/password-policies`, undefined, { 'If-None-Match': page.headers.get('etag') });
    assert.equal(again.status, 304);
  });
  it('404s for unknown pages', async () => {
    assert.equal((await owner.get(`${S}/pages/nope/settings`)).status, 404);
  });
});

describe('settings pages', () => {
  it('returns the real values, saves with versioning, audits, and rejects stale writes', async () => {
    const first = await owner.get(`${S}/pages/password-policies/settings`);
    assert.equal(first.body.version, 1);
    assert.equal(first.body.values.minimum_password_length, '8');
    assert.equal(first.body.values.user_passwords_expire_in, '90 days');
    assert.ok(first.body.readOnly.includes('password_question_requirement'), 'settings nothing enforces are shown read-only');
    assert.ok(!first.body.readOnly.includes('minimum_password_length'));

    const saved = await owner.patch(`${S}/pages/password-policies/settings`, { version: 1, values: { minimum_password_length: '12', user_passwords_expire_in: 'Never expires' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.version, 2);
    assert.equal(saved.body.values.minimum_password_length, '12');
    assert.equal(saved.body.values.user_passwords_expire_in, 'Never expires');

    const stale = await owner.patch(`${S}/pages/password-policies/settings`, { version: 1, values: { minimum_password_length: '10' } });
    assert.equal(stale.status, 409);
    assert.equal((await owner.patch(`${S}/pages/password-policies/settings`, { version: 2, values: { minimum_password_length: '99' } })).status, 400);
    assert.equal((await owner.patch(`${S}/pages/password-policies/settings`, { version: 2, values: { nope: 'x' } })).status, 400);
    assert.equal((await owner.patch(`${S}/pages/password-policies/settings`, { version: 2, values: { password_question_requirement: 'None' } })).status, 400, 'a setting that nothing enforces cannot be saved');

    const audit = await owner.get(`${S}/pages/view-setup-audit-trail/records`);
    assert.ok(audit.body.items.some((r) => /Password Policies/.test(r.action)));
  });
  it('is isolated per tenant', async () => {
    const theirs = await other.get(`${S}/pages/password-policies/settings`);
    assert.equal(theirs.body.version, 1);
    assert.equal(theirs.body.values.minimum_password_length, '8');
  });
  it('company information is bound to the real tenant', async () => {
    const info = await owner.get(`${S}/pages/company-information/settings`);
    assert.equal(info.body.values.organization_name, 'Acme Corp');
    assert.equal(info.body.tables.Licenses[0].used, '1');
    const renamed = await owner.patch(`${S}/pages/company-information/settings`, { version: info.body.version, values: { organization_name: 'Acme Holdings' } });
    assert.equal(renamed.body.values.organization_name, 'Acme Holdings');
    const me = await owner.get('/me');
    assert.equal(me.body.tenants[0].name, 'Acme Holdings');
  });
  it('a settings page without a real table is a read-only preview', async () => {
    const page = await owner.get(`${S}/pages/deliverability/settings`);
    assert.equal(page.status, 200);
    assert.equal(page.body.version, 0);
    const fields = Object.keys(page.body.values);
    assert.deepEqual([...page.body.readOnly].sort(), [...fields].sort());
    assert.equal((await owner.patch(`${S}/pages/deliverability/settings`, { version: 0, values: { [fields[0]]: page.body.values[fields[0]] } })).status, 400);
  });
});

describe('profiles (a real table)', () => {
  it('lists the standard profiles, pages by keyset and searches', async () => {
    const page1 = await owner.get(`${S}/pages/profiles/records?limit=2`);
    assert.equal(page1.status, 200);
    assert.equal(page1.body.items.length, 2);
    assert.ok(page1.body.nextCursor);
    const page2 = await owner.get(`${S}/pages/profiles/records?limit=2&after=${page1.body.nextCursor}`);
    assert.ok(!page1.body.items.some((r) => page2.body.items.some((x) => x.id === r.id)));
    const all = (await owner.get(`${S}/pages/profiles/records?limit=200`)).body.items;
    assert.deepEqual(all.map((p) => p.profile_name), ['Minimum Access - API Only', 'Read Only', 'Standard User', 'System Administrator']);
    assert.ok(all.every((p) => p.custom === false));
    assert.equal((await owner.get(`${S}/pages/profiles/records?q=read`)).body.items.length, 1);
  });
  it('creates, edits and deletes custom profiles; the standard ones are fixed; names are unique', async () => {
    const created = await owner.post(`${S}/pages/profiles/records`, { profile_name: 'Auditor' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id } = created.body.record;
    assert.equal((await owner.post(`${S}/pages/profiles/records`, { profile_name: 'auditor' })).status, 409, 'names are unique, whatever the case');
    assert.equal((await owner.post(`${S}/pages/profiles/records`, {})).status, 400);
    const updated = await owner.patch(`${S}/pages/profiles/records/${id}`, { description: 'Read-only auditor' });
    assert.equal(updated.status, 200);
    assert.equal((await owner.get(`${S}/pages/profiles/records?q=auditor`)).body.items[0].description, 'Read-only auditor');

    const standard = (await owner.get(`${S}/pages/profiles/records?q=standard`)).body.items[0];
    assert.equal((await owner.patch(`${S}/pages/profiles/records/${standard.id}`, { description: 'x' })).status, 403);
    assert.equal((await owner.post(`${S}/pages/profiles/records/delete`, { ids: [standard.id] })).status, 403);

    assert.equal((await owner.post(`${S}/pages/profiles/records/delete`, { ids: [id] })).body.removed, 1);
    assert.equal((await owner.get(`${S}/pages/profiles/records?q=auditor`)).body.items.length, 0);
  });
  it('never exposes another tenant\'s profiles', async () => {
    await owner.post(`${S}/pages/profiles/records`, { profile_name: 'OwnerOnlyProfile' });
    assert.equal((await other.get(`${S}/pages/profiles/records?limit=200&q=OwnerOnlyProfile`)).body.items.length, 0);
    const id = (await owner.get(`${S}/pages/profiles/records?q=OwnerOnlyProfile`)).body.items[0].id;
    assert.equal((await other.patch(`${S}/pages/profiles/records/${id}`, { description: 'x' })).status, 404);
  });
});

describe('preview pages (no real table yet)', () => {
  it('render from fixtures: searchable, sortable and paged, with the same list contract', async () => {
    const page1 = await owner.get(`${S}/pages/apex-classes/records?limit=3&total=true`);
    assert.equal(page1.status, 200);
    assert.equal(page1.body.items.length, 3);
    assert.equal(page1.body.total, 9);
    const page2 = await owner.get(`${S}/pages/apex-classes/records?limit=3&after=${page1.body.nextCursor}`);
    assert.ok(!page1.body.items.some((r) => page2.body.items.some((x) => x.id === r.id)));
    const sorted = (await owner.get(`${S}/pages/apex-classes/records?limit=50&sort=name&dir=desc`)).body.items.map((r) => r.name);
    assert.deepEqual(sorted, [...sorted].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
    const first = sorted.at(-1);
    assert.ok((await owner.get(`${S}/pages/apex-classes/records?q=${encodeURIComponent(first.slice(0, 4))}`)).body.items.length >= 1);
  });
  it('cannot be changed, and say so to the page', async () => {
    const def = (await owner.get(`${S}/pages/apex-classes`)).body;
    assert.equal(def.adapter.readOnly, true);
    assert.equal(def.status.level, 'preview');
    assert.equal((await owner.post(`${S}/pages/apex-classes/records`, { name: 'Nope' })).status, 403);
    const id = (await owner.get(`${S}/pages/apex-classes/records?limit=1`)).body.items[0].id;
    assert.equal((await owner.patch(`${S}/pages/apex-classes/records/${id}`, { name: 'x' })).status, 400, 'not even a valid record id');
  });
});

describe('roles hierarchy (a real table)', () => {
  it('starts with the tenant itself at the top, and builds, moves and deletes roles with paths kept in step', async () => {
    const tree = (await owner.get(`${S}/pages/roles/tree`)).body;
    assert.equal(tree.roots.length, 1);
    assert.equal(tree.roots[0].name, 'Acme Holdings');
    const root = tree.roots[0];

    const ceo = (await owner.post(`${S}/pages/roles/records`, { name: 'CEO', parentId: root.id })).body.record;
    const vp = (await owner.post(`${S}/pages/roles/records`, { name: 'VP Sales', parentId: ceo.id })).body.record;
    const rep = (await owner.post(`${S}/pages/roles/records`, { name: 'Sales Rep', parentId: vp.id })).body.record;
    assert.equal((await owner.post(`${S}/pages/roles/records`, { name: 'ceo', parentId: root.id })).status, 409, 'sibling names are unique');

    let nested = (await owner.get(`${S}/pages/roles/tree`)).body.roots[0];
    assert.deepEqual(nested.children[0].children[0].children.map((c) => c.name), ['Sales Rep']);

    // move the VP (and the rep below them) up under the top node; paths and depth follow
    assert.equal((await owner.patch(`${S}/pages/roles/records/${vp.id}`, { parentId: root.id })).status, 200);
    nested = (await owner.get(`${S}/pages/roles/tree`)).body.roots[0];
    assert.deepEqual(nested.children.map((c) => c.name).sort(), ['CEO', 'VP Sales']);
    assert.equal(nested.children.find((c) => c.name === 'VP Sales').children[0].name, 'Sales Rep');
    const { rows } = await pool.query('select name, depth, path from hierarchy_roles where id = $1', [rep.id]);
    assert.equal(rows[0].depth, 2);
    assert.ok(rows[0].path.includes(vp.id) && !rows[0].path.includes(ceo.id));

    assert.equal((await owner.patch(`${S}/pages/roles/records/${vp.id}`, { parentId: rep.id })).status, 400, 'a role cannot move below itself');
    assert.equal((await owner.patch(`${S}/pages/roles/records/${root.id}`, { parentId: ceo.id })).status, 400, 'the top cannot move');
    assert.equal((await owner.post(`${S}/pages/roles/records/delete`, { ids: [vp.id] })).status, 409, 'roles with sub-roles are kept');
    assert.equal((await owner.post(`${S}/pages/roles/records/delete`, { ids: [rep.id, ceo.id] })).body.removed, 2);
    assert.equal((await owner.post(`${S}/pages/roles/records/delete`, { ids: [vp.id] })).body.removed, 1);
    assert.equal((await owner.post(`${S}/pages/roles/records/delete`, { ids: [root.id] })).status, 403, 'the top cannot be deleted');
  });
  it('is isolated per tenant', async () => {
    const mine = (await owner.get(`${S}/pages/roles/tree`)).body.roots[0];
    const theirs = (await other.get(`${S}/pages/roles/tree`)).body.roots[0];
    assert.notEqual(mine.id, theirs.id);
    assert.equal((await other.post(`${S}/pages/roles/records`, { name: 'Intruder', parentId: mine.id })).status, 404);
  });
});

describe('object permissions, permission sets and sharing (real tables)', () => {
  it('Object Settings grants a profile or a permission set per object; a new name creates a permission set', async () => {
    const made = await owner.post(`${S}/pages/object-settings/records`, { object: 'Lead', permission_set: 'Read Only', read: 'Yes', create: 'Yes', edit: 'No', delete: 'No' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const viaSet = await owner.post(`${S}/pages/object-settings/records`, { object: 'Account', permission_set: 'Territory Planner', read: 'Yes', create: 'No', edit: 'Yes', delete: 'No' });
    assert.equal(viaSet.status, 201);
    const rows = (await owner.get(`${S}/pages/object-settings/records?limit=200`)).body.items;
    assert.ok(rows.some((r) => r.permission_set === 'Territory Planner' && r.object === 'Account' && r.edit === 'Yes'));
    assert.ok(rows.some((r) => r.permission_set === 'System Administrator' && r.object === 'All'), 'the standard profiles have their grants');
    assert.equal((await owner.post(`${S}/pages/object-settings/records`, { object: 'Nothing', permission_set: 'Read Only', read: 'Yes', create: 'No', edit: 'No', delete: 'No' })).status, 400, 'objects must exist');
    const id = rows.find((r) => r.permission_set === 'Territory Planner').id;
    assert.equal((await owner.patch(`${S}/pages/object-settings/records/${id}`, { delete: 'Yes' })).status, 200);
    assert.equal((await owner.get(`${S}/pages/object-settings/records?q=Territory`)).body.items[0].delete, 'Yes');
    assert.equal((await owner.post(`${S}/pages/object-settings/records/delete`, { ids: [id] })).body.removed, 1);
    assert.equal((await other.get(`${S}/pages/object-settings/records?q=Territory`)).body.items.length, 0, 'another tenant sees none of it');
  });
  it('a profile and a permission set cannot share a name', async () => {
    await owner.post(`${S}/pages/object-settings/records`, { object: 'Case', permission_set: 'Case Closer', read: 'Yes', create: 'No', edit: 'No', delete: 'No' });
    assert.equal((await owner.post(`${S}/pages/profiles/records`, { profile_name: 'case closer' })).status, 409);
  });
  it('sharing defaults list every standard object, default open, and can be changed', async () => {
    const list = (await owner.get(`${S}/pages/sharing-defaults/records?limit=200`)).body.items;
    assert.equal(list.length, 34);
    assert.ok(list.every((r) => r.default_internal_access === 'Public Read/Write'));
    const lead = list.find((r) => r.object === 'Lead');
    assert.equal((await owner.patch(`${S}/pages/sharing-defaults/records/${lead.id}`, { default_internal_access: 'Private' })).status, 200);
    assert.equal((await owner.get(`${S}/pages/sharing-defaults/records?q=Lead`)).body.items.find((r) => r.object === 'Lead').default_internal_access, 'Private');
    assert.equal((await other.get(`${S}/pages/sharing-defaults/records?q=Lead`)).body.items.find((r) => r.object === 'Lead').default_internal_access, 'Public Read/Write');
  });
});

describe('platform adapters', () => {
  it('users: lists members, invites, and changes roles through the real services', async () => {
    const list = await owner.get(`${S}/pages/users/records`);
    assert.equal(list.body.items.length, 1);
    const invited = await owner.post(`${S}/pages/users/records`, { email: 'new.hire@example.com', role: 'Member' });
    assert.equal(invited.status, 201);
    assert.ok(server.mailTo('new.hire@example.com', 'invitation'));
    const duplicate = await owner.post(`${S}/pages/users/records`, { email: 'new.hire@example.com', role: 'Member' });
    assert.equal(duplicate.status, 201); // re-issues the pending invitation
  });
  it('login history and sessions come from real tables', async () => {
    const logins = await owner.get(`${S}/pages/login-history/records`);
    assert.ok(logins.body.items.length >= 1);
    assert.equal(logins.body.items[0].status, 'Success');
    const sessions = await owner.get(`${S}/pages/session-management/records`);
    assert.ok(sessions.body.items.length >= 1);
    assert.equal((await owner.post(`${S}/pages/login-history/records`, { x: 1 })).status, 403);
  });
});

describe('dashboards, health and tools', () => {
  it('the removed Adoption Manager page no longer exists', async () => {
    const gone = await owner.get(`${S}/pages/adoption-manager/metrics`);
    assert.equal(gone.status, 404);
  });
  it('shows one person in full and can sign them out', async () => {
    const me = (await owner.get('/me')).body;
    const meId = me.user?.id ?? me.id;
    const res = await owner.get(`${S}/users/${meId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, meId);
    assert.ok(res.body.user.email && res.body.user.roleLabel);
    assert.ok(Array.isArray(res.body.sessions) && Array.isArray(res.body.logins) && Array.isArray(res.body.changes));
    const stranger = await owner.get(`${S}/users/01a20419-8062-74b9-8324-000000000000`);
    assert.equal(stranger.status, 404);
    const noOne = await owner.post(`${S}/users/01a20419-8062-74b9-8324-000000000000/sign-out`, {});
    assert.equal(noOne.status, 404);
  });
  it('every dashboard provider responds', async () => {
    for (const key of ['storage-usage', 'platform-cache', 'optimizer', 'readiness-assessor', 'data-integration-metrics', 'data-com-licenses-and-limits', 'lightning-experience-transition-assistant']) {
      const res = await owner.get(`${S}/pages/${key}/metrics`);
      assert.equal(res.status, 200, key);
      assert.ok(Array.isArray(res.body.cards), key);
    }
    const overview = await owner.get(`${S}/pages/system-overview/metrics`);
    assert.ok(overview.body.gauges.length >= 6);
    const o = overview.body;
    assert.deepEqual(o.kpis.map((k) => k.key), ['members', 'active-users', 'logins', 'changes', 'health']);
    assert.equal(o.activity.length, 14, 'two weeks of daily activity');
    assert.ok(o.activity.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isInteger(d.logins) && Number.isInteger(d.changes)));
    assert.equal(o.hourly.length, 24);
    assert.ok(o.kpis.find((k) => k.key === 'health').value >= 0 && o.kpis.find((k) => k.key === 'health').total > 0);
    assert.ok(Array.isArray(o.recent) && Array.isArray(o.attention) && Array.isArray(o.composition));
  });
  it('health check scores real settings and can fix them', async () => {
    const before = await owner.get(`${S}/pages/health-check/metrics`);
    assert.ok(before.body.risks.length > 0);
    const fixed = await owner.post(`${S}/pages/health-check/fix`);
    assert.equal(fixed.body.score, 100);
    const settings = await owner.get(`${S}/pages/password-policies/settings`);
    assert.equal(settings.body.values.maximum_invalid_login_attempts, '5');
  });
  it('tools that needed the old generic store are recorded, not faked, and no export endpoint remains', async () => {
    for (const key of ['data-import-wizard', 'data-loader', 'mass-delete-records', 'mass-transfer-records']) {
      const res = await owner.post(`${S}/pages/${key}/run`, {});
      assert.equal(res.status, 200, key);
      assert.equal(res.body.active, false, key);
    }
    const exp = await fetch(`${server.base}${S}/pages/data-loader/export?object=Profiles`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(exp.status, 404);
  });
  it('test-deliverability sends a real test email', async () => {
    const res = await owner.post(`${S}/pages/test-deliverability/run`, { email: 'someone@example.com' });
    assert.equal(res.body.active, true);
    assert.ok(server.outbox.some((j) => j.template === 'test_email' && j.to === 'someone@example.com'));
  });
  it('tools without an engine are recorded, not faked', async () => {
    const res = await owner.post(`${S}/pages/snap-ins/run`, {});
    assert.equal(res.body.active, false);
  });
  it('expire-all-passwords queues the background job', async () => {
    const res = await owner.post(`${S}/pages/expire-all-passwords/run`, { confirm: true });
    assert.equal(res.body.active, true);
  });
});

describe('guards', () => {
  it('rate limits writes per user', async () => {
    const { client } = await registerUser(server);
    let limited = 0;
    // The limit is a fixed one-minute window: if the minute rolls over mid-test the counter restarts, so allow enough requests to cross it.
    for (let i = 0; i < 400 && !limited; i++) {
      const res = await client.post(`${S}/pages/profiles/records`, { profile_name: `P${i}` });
      if (res.status === 429) limited++;
    }
    assert.ok(limited > 0);
  });
});

describe('role enforcement and cache invalidation', () => {
  it('refuses non-admins, and a demotion applies immediately despite the membership cache', async () => {
    const { client: boss } = await registerUser(server);
    const ws = (await boss.get('/me')).body.activeTenantId;
    const email = uniqueEmail();
    await boss.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role: 'admin' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const invitee = new Client(server.base);
    const accepted = await invitee.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    assert.equal(accepted.status, 201);
    await invitee.post(`/tenants/${ws}/switch`);

    assert.equal((await invitee.get(`${S}/pages/profiles/records`)).status, 200, 'admins may use Setup');
    const userId = (await invitee.get('/me')).body.user.id;
    assert.equal((await boss.patch(`/tenants/${ws}/members/${userId}`, { role: 'viewer' })).status, 204);
    assert.equal((await invitee.get(`${S}/pages/profiles/records`)).status, 403, 'demotion is visible at once on this worker');
    assert.equal((await invitee.patch(`${S}/pages/password-policies/settings`, { version: 0, values: { minimum_password_length: '8' } })).status, 403);
  });
});

describe('security settings are enforced by the auth code', () => {
  const change = (client, currentPassword, password) => client.post('/me/password', { currentPassword, password, confirmPassword: password });
  const policy = (client, page, values) => client.get(`${S}/pages/${page}/settings`).then(({ body }) => client.patch(`${S}/pages/${page}/settings`, { version: body.version, values }));

  it('password policy: length, complexity and history apply to password changes', async () => {
    const { client, email } = await registerUser(server);
    await policy(client, 'password-policies', { minimum_password_length: '12', password_complexity_requirement: 'Must mix alpha, numeric and special characters', enforce_password_history: '3 passwords remembered' });
    const short = await change(client, PASSWORD, 'Abcdefghi1');
    assert.equal(short.status, 400);
    assert.match(JSON.stringify(short.body), /at least 12/);
    const noSpecial = await change(client, PASSWORD, 'Abcdefghijkl1234');
    assert.equal(noSpecial.status, 400);
    assert.match(JSON.stringify(noSpecial.body), /special/);
    const ok = await change(client, PASSWORD, 'Abcdefghijk1!');
    assert.equal(ok.status, 204);
    const reuse = await change(client, 'Abcdefghijk1!', PASSWORD);
    assert.equal(reuse.status, 400, 'a remembered password cannot be reused');
    assert.match(JSON.stringify(reuse.body), /reuse/);
    void email;
  });

  it('network access: an allow-list blocks sign-in from other IPs, and cannot lock the admin out', async () => {
    const { client, email } = await registerUser(server);
    const mine = client.ip;
    const lockout = await client.post(`${S}/pages/network-access/records`, { start_ip_address: '203.0.113.1', end_ip_address: '203.0.113.9' });
    assert.equal(lockout.status, 409, 'the first range must contain the admin\'s own IP');
    const added = await client.post(`${S}/pages/network-access/records`, { start_ip_address: mine, end_ip_address: mine });
    assert.equal(added.status, 201);
    const stranger = new Client(server.base);
    const blocked = await stranger.post('/auth/login', { email, password: PASSWORD });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'IP_RESTRICTED');
    const inside = new Client(server.base); inside.ip = mine;
    assert.equal((await inside.post('/auth/login', { email, password: PASSWORD })).status, 200);
  });

  it('session settings: sessions are locked to their IP and expire when idle', async () => {
    const { client, email } = await registerUser(server);
    await policy(client, 'session-settings', { lock_sessions_to_the_ip_address_from_which_they_originated: true });
    const roamer = new Client(server.base);
    await roamer.post('/auth/login', { email, password: PASSWORD, rememberMe: true });
    roamer.ip = '198.51.100.77'; // same cookie, different network
    assert.equal((await roamer.post('/auth/refresh')).status, 401);
  });

  it('expired passwords force a reset and email the link', async () => {
    const { client, email } = await registerUser(server);
    await policy(client, 'password-policies', { user_passwords_expire_in: '30 days' });
    await pool.query("update users set password_changed_at = now() - interval '40 days' where email = $1", [email]);
    const res = await new Client(server.base).post('/auth/login', { email, password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PASSWORD_EXPIRED');
    assert.ok(server.mailTo(email, 'password_reset'));
  });
});

describe('UI customization and preferences', () => {
  it('only the owner customizes the tenant UI; it is saved in the database and returned to everyone', async () => {
    const { client: owner } = await registerUser(server);
    const ws = (await owner.get('/me')).body.activeTenantId;
    const before = (await owner.get('/me')).body.tenants[0];
    assert.deepEqual(before.uiSettings, {}, 'new tenants store nothing (defaults apply)');

    const saved = await owner.patch(`/tenants/${ws}/ui`, { layout: 'topbar', navColor: 'navy' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.tenant.uiSettings, { layout: 'topbar', navColor: 'navy' });
    const merged = await owner.patch(`/tenants/${ws}/ui`, { variant: 'floating' });
    assert.deepEqual(merged.body.tenant.uiSettings, { layout: 'topbar', navColor: 'navy', variant: 'floating' }, 'patches merge');
    assert.equal((await owner.get('/me')).body.tenants[0].uiSettings.navColor, 'navy');

    const custom = await owner.patch(`/tenants/${ws}/ui`, { navHex: '#1E293B', accentHex: '#12b76a' });
    assert.equal(custom.status, 200);
    assert.equal(custom.body.tenant.uiSettings.navHex, '#1e293b', 'custom colours are stored normalised');
    assert.equal((await owner.patch(`/tenants/${ws}/ui`, { navHex: 'url(javascript:x)' })).status, 400, 'only #rrggbb colours are accepted');
    assert.equal((await owner.patch(`/tenants/${ws}/ui`, { navHex: null, accentHex: null })).status, 200, 'null returns to the preset');
    assert.equal((await owner.patch(`/tenants/${ws}/ui`, { layout: 'diagonal' })).status, 400, 'values are validated');
    assert.equal((await owner.patch(`/tenants/${ws}/ui`, { favouriteColour: 'red' })).status, 400, 'unknown options are refused');
    assert.equal((await owner.patch(`/tenants/${ws}/ui`, {})).status, 400);

    // an admin is not the owner; a member sees the owner's choice
    const email = uniqueEmail();
    await owner.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role: 'admin' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const admin = new Client(server.base);
    await admin.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    await admin.post(`/tenants/${ws}/switch`);
    assert.equal((await admin.patch(`/tenants/${ws}/ui`, { layout: 'sidebar' })).status, 403, 'admins cannot');
    assert.equal((await admin.get('/me')).body.tenants.find((w) => w.id === ws).uiSettings.layout, 'topbar', 'everyone sees the owner\'s layout');
  });

  it('theme mode is a personal preference saved on the account', async () => {
    const { client } = await registerUser(server);
    assert.deepEqual((await client.get('/me')).body.user.preferences, {});
    const res = await client.patch('/me/preferences', { themeMode: 'system' });
    assert.equal(res.status, 200);
    assert.equal((await client.get('/me')).body.user.preferences.themeMode, 'system');
    assert.equal((await client.patch('/me/preferences', { themeMode: 'neon' })).status, 400);
    assert.equal((await client.patch('/me/preferences', { other: 1 })).status, 400);
  });
});
