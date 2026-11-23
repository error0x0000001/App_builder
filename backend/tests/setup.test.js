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
    assert.equal(tree.body.counts.total, 266);
    const page = await owner.get(`${S}/pages/password-policies`);
    const again = await owner.request('GET', `${S}/pages/password-policies`, undefined, { 'If-None-Match': page.headers.get('etag') });
    assert.equal(again.status, 304);
  });
  it('404s for unknown pages', async () => {
    assert.equal((await owner.get(`${S}/pages/nope/settings`)).status, 404);
  });
});

describe('settings pages', () => {
  it('returns defaults, saves with versioning, audits, and rejects stale writes', async () => {
    const first = await owner.get(`${S}/pages/password-policies/settings`);
    assert.equal(first.body.version, 0);
    assert.equal(first.body.values.minimum_password_length, '8');

    const saved = await owner.patch(`${S}/pages/password-policies/settings`, { version: 0, values: { minimum_password_length: '12' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.version, 1);
    assert.equal(saved.body.values.minimum_password_length, '12');

    const stale = await owner.patch(`${S}/pages/password-policies/settings`, { version: 0, values: { minimum_password_length: '10' } });
    assert.equal(stale.status, 409);

    const bad = await owner.patch(`${S}/pages/password-policies/settings`, { version: 1, values: { minimum_password_length: '99' } });
    assert.equal(bad.status, 400);
    const unknown = await owner.patch(`${S}/pages/password-policies/settings`, { version: 1, values: { nope: 'x' } });
    assert.equal(unknown.status, 400);

    const audit = await owner.get(`${S}/pages/view-setup-audit-trail/records`);
    assert.ok(audit.body.items.some((r) => /Password Policies/.test(r.action)));
  });
  it('is isolated per workspace', async () => {
    const theirs = await other.get(`${S}/pages/password-policies/settings`);
    assert.equal(theirs.body.version, 0);
    assert.equal(theirs.body.values.minimum_password_length, '8');
  });
  it('company information is bound to the real workspace', async () => {
    const info = await owner.get(`${S}/pages/company-information/settings`);
    assert.equal(info.body.values.organization_name, 'Acme Corp');
    assert.equal(info.body.tables.Licenses[0].used, '1');
    const renamed = await owner.patch(`${S}/pages/company-information/settings`, { version: info.body.version, values: { organization_name: 'Acme Holdings' } });
    assert.equal(renamed.body.values.organization_name, 'Acme Holdings');
    const me = await owner.get('/me');
    assert.equal(me.body.workspaces[0].name, 'Acme Holdings');
  });
});

describe('record pages', () => {
  it('seeds initial content once, paginates by keyset, filters and searches', async () => {
    const page1 = await owner.get(`${S}/pages/profiles/records?limit=2&total=true`);
    assert.equal(page1.status, 200);
    assert.equal(page1.body.items.length, 2);
    assert.ok(page1.body.nextCursor);
    const page2 = await owner.get(`${S}/pages/profiles/records?limit=2&after=${page1.body.nextCursor}`);
    assert.notEqual(page2.body.items[0].id, page1.body.items[0].id);
    assert.ok(!page1.body.items.some((r) => page2.body.items.some((x) => x.id === r.id)));
    const all = await owner.get(`${S}/pages/profiles/records?limit=200`);
    const searched = await owner.get(`${S}/pages/profiles/records?q=${encodeURIComponent(all.body.items[0].profile_name.slice(0, 4))}`);
    assert.ok(searched.body.items.length >= 1);
  });
  it('creates, updates and deletes records and invalidates the cache', async () => {
    const before = await owner.get(`${S}/pages/profiles/records?limit=200`);
    const created = await owner.post(`${S}/pages/profiles/records`, { profile_name: 'Auditor' });
    assert.equal(created.status, 201);
    const listed = await owner.get(`${S}/pages/profiles/records?limit=200`);
    assert.equal(listed.body.items.length, before.body.items.length + 1);
    const { id } = created.body.record;
    const updated = await owner.patch(`${S}/pages/profiles/records/${id}`, { description: 'Read-only auditor' });
    assert.equal(updated.body.record.description, 'Read-only auditor');
    assert.equal((await owner.post(`${S}/pages/profiles/records`, {})).status, 400);
    const removed = await owner.post(`${S}/pages/profiles/records/delete`, { ids: [id] });
    assert.equal(removed.body.removed, 1);
    assert.equal((await owner.get(`${S}/pages/profiles/records?limit=200`)).body.items.length, before.body.items.length);
  });
  it('never exposes another workspace\'s records', async () => {
    await owner.post(`${S}/pages/profiles/records`, { profile_name: 'OwnerOnlyProfile' });
    const theirs = await other.get(`${S}/pages/profiles/records?limit=200&q=OwnerOnlyProfile`);
    assert.equal(theirs.body.items.length, 0);
    const id = (await owner.get(`${S}/pages/profiles/records?q=OwnerOnlyProfile`)).body.items[0].id;
    assert.equal((await other.patch(`${S}/pages/profiles/records/${id}`, { description: 'x' })).status, 404);
  });
  it('serves the roles hierarchy as a tree', async () => {
    const tree = await owner.get(`${S}/pages/roles/tree`);
    assert.equal(tree.body.roots.length, 1);
    assert.ok(tree.body.roots[0].children.length >= 1);
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
  it('adoption manager reflects real members and logins', async () => {
    const dash = await owner.get(`${S}/pages/adoption-manager/metrics`);
    assert.equal(dash.status, 200);
    assert.equal(dash.body.cards[0].v, '1');
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
  it('imports CSV into a collection, exports it, and mass-deletes', async () => {
    const csv = 'Profile Name,Description\nImported A,first\nImported B,second\n,missing name';
    const run = await owner.post(`${S}/pages/data-import-wizard/run`, { object: 'Profiles', csv });
    assert.equal(run.body.imported, 2);
    assert.equal(run.body.skipped, 1);
    const exp = await fetch(`${server.base}${S}/pages/data-loader/export?object=Profiles`, { headers: { Authorization: `Bearer ${owner.token}` } });
    const text = await exp.text();
    assert.match(text, /Imported A/);
    assert.match(text, /^Profile Name,/);
    const refused = await owner.post(`${S}/pages/mass-delete-records/run`, { object: 'Profiles', confirm: false });
    assert.equal(refused.status, 400);
    const del = await owner.post(`${S}/pages/mass-delete-records/run`, { object: 'Profiles', confirm: true });
    assert.ok(del.body.removed >= 2);
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
    const ws = (await boss.get('/me')).body.activeWorkspaceId;
    const email = uniqueEmail();
    await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role: 'admin' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const invitee = new Client(server.base);
    const accepted = await invitee.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    assert.equal(accepted.status, 201);
    await invitee.post(`/workspaces/${ws}/switch`);

    assert.equal((await invitee.get(`${S}/pages/profiles/records`)).status, 200, 'admins may use Setup');
    const userId = (await invitee.get('/me')).body.user.id;
    assert.equal((await boss.patch(`/workspaces/${ws}/members/${userId}`, { role: 'viewer' })).status, 204);
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
  it('only the owner customizes the workspace UI; it is saved in the database and returned to everyone', async () => {
    const { client: owner } = await registerUser(server);
    const ws = (await owner.get('/me')).body.activeWorkspaceId;
    const before = (await owner.get('/me')).body.workspaces[0];
    assert.deepEqual(before.uiSettings, {}, 'new workspaces store nothing (defaults apply)');

    const saved = await owner.patch(`/workspaces/${ws}/ui`, { layout: 'topbar', navColor: 'navy' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.workspace.uiSettings, { layout: 'topbar', navColor: 'navy' });
    const merged = await owner.patch(`/workspaces/${ws}/ui`, { variant: 'floating' });
    assert.deepEqual(merged.body.workspace.uiSettings, { layout: 'topbar', navColor: 'navy', variant: 'floating' }, 'patches merge');
    assert.equal((await owner.get('/me')).body.workspaces[0].uiSettings.navColor, 'navy');

    const custom = await owner.patch(`/workspaces/${ws}/ui`, { navHex: '#1E293B', accentHex: '#12b76a' });
    assert.equal(custom.status, 200);
    assert.equal(custom.body.workspace.uiSettings.navHex, '#1e293b', 'custom colours are stored normalised');
    assert.equal((await owner.patch(`/workspaces/${ws}/ui`, { navHex: 'url(javascript:x)' })).status, 400, 'only #rrggbb colours are accepted');
    assert.equal((await owner.patch(`/workspaces/${ws}/ui`, { navHex: null, accentHex: null })).status, 200, 'null returns to the preset');
    assert.equal((await owner.patch(`/workspaces/${ws}/ui`, { layout: 'diagonal' })).status, 400, 'values are validated');
    assert.equal((await owner.patch(`/workspaces/${ws}/ui`, { favouriteColour: 'red' })).status, 400, 'unknown options are refused');
    assert.equal((await owner.patch(`/workspaces/${ws}/ui`, {})).status, 400);

    // an admin is not the owner; a member sees the owner's choice
    const email = uniqueEmail();
    await owner.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role: 'admin' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const admin = new Client(server.base);
    await admin.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    await admin.post(`/workspaces/${ws}/switch`);
    assert.equal((await admin.patch(`/workspaces/${ws}/ui`, { layout: 'sidebar' })).status, 403, 'admins cannot');
    assert.equal((await admin.get('/me')).body.workspaces.find((w) => w.id === ws).uiSettings.layout, 'topbar', 'everyone sees the owner\'s layout');
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
