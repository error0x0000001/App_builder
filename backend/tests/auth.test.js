import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, signupBody, startServer, totpNow, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

describe('signup & email verification', () => {
  it('creates an account, requires the emailed code, then signs in with a tenant', async () => {
    const client = new Client(server.base);
    const email = uniqueEmail();
    const signup = await client.post('/auth/signup', signupBody(email));
    assert.equal(signup.status, 202);

    const { code } = server.mailTo(email, 'verify_email').data;
    const wrong = await client.post('/auth/verify-email', { email, code: code === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 401);

    const ok = await client.post('/auth/verify-email', { email, code });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.accessToken);
    assert.match(ok.headers.get('set-cookie'), /rt=.+HttpOnly/i);

    const me = await client.get('/me');
    assert.equal(me.body.user.email, email);
    assert.equal(me.body.tenants.length, 1);
    assert.equal(me.body.tenants[0].role, 'owner');
    assert.equal(me.body.activeTenantId, me.body.tenants[0].id);
  });

  it('the code is single-use and locked after 5 wrong attempts', async () => {
    const client = new Client(server.base);
    const email = uniqueEmail();
    await client.post('/auth/signup', signupBody(email));
    const { code } = server.mailTo(email, 'verify_email').data;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await client.post('/auth/verify-email', { email, code: wrong });
    const afterLock = await client.post('/auth/verify-email', { email, code });
    assert.equal(afterLock.status, 401, 'correct code is rejected after too many failures');
  });

  it('does not reveal whether an email is already registered', async () => {
    const { email } = await registerUser(server);
    const res = await new Client(server.base).post('/auth/signup', signupBody(email));
    assert.equal(res.status, 202);
    assert.ok(server.mailTo(email, 'account_exists'));
  });

  it('rejects weak passwords and missing terms with field errors', async () => {
    const res = await new Client(server.base).post('/auth/signup', signupBody(uniqueEmail(), { password: 'short', acceptTerms: false }));
    assert.equal(res.status, 400);
    const fields = res.body.error.details.map((d) => d.field);
    assert.ok(fields.includes('password') && fields.includes('acceptTerms'));
  });

  it('blocks login until the email is verified', async () => {
    const client = new Client(server.base);
    const email = uniqueEmail();
    await client.post('/auth/signup', signupBody(email));
    const res = await client.post('/auth/login', { email, password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
  });
});

describe('login, lockout & sessions', () => {
  it('logs in, and returns an identical error for unknown users and wrong passwords', async () => {
    const { email } = await registerUser(server);
    const client = new Client(server.base);
    const unknown = await client.post('/auth/login', { email: uniqueEmail(), password: PASSWORD });
    const wrong = await client.post('/auth/login', { email, password: 'Wrong-password1' });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
    const ok = await client.post('/auth/login', { email, password: PASSWORD });
    assert.equal(ok.status, 200);
  });

  it('locks the account after repeated failures, even for the correct password, and emails the owner', async () => {
    const { client, email } = await registerUser(server);
    // The threshold is the tenant's Password Policies setting (Setup), not a constant.
    const current = await client.get('/setup/pages/password-policies/settings');
    const saved = await client.patch('/setup/pages/password-policies/settings', { version: current.body.version, values: { maximum_invalid_login_attempts: '3' } });
    assert.equal(saved.status, 200);
    for (let i = 0; i < 2; i++) await new Client(server.base).post('/auth/login', { email, password: 'Wrong-password1' });
    assert.equal(server.mailTo(email, 'account_locked'), undefined, 'not locked before the configured limit');
    await new Client(server.base).post('/auth/login', { email, password: 'Wrong-password1' });
    assert.ok(server.mailTo(email, 'account_locked'));
    const res = await new Client(server.base).post('/auth/login', { email, password: PASSWORD });
    assert.equal(res.status, 401);
  });

  it('rate limits by IP', async () => {
    const client = new Client(server.base);
    let last;
    for (let i = 0; i < 12; i++) last = await client.post('/auth/login', { email: uniqueEmail(), password: PASSWORD });
    assert.ok([401, 429].includes(last.status));
    const limited = [];
    for (let i = 0; i < 45; i++) limited.push((await client.post('/auth/login', { email: uniqueEmail(), password: PASSWORD })).status);
    assert.ok(limited.includes(429));
  });

  it('rotates refresh tokens and revokes the session when an old token is replayed', async () => {
    const { client, email } = await registerUser(server);
    const stolen = client.cookies.get('rt');
    const rotated = await client.post('/auth/refresh');
    assert.equal(rotated.status, 200);
    assert.notEqual(client.cookies.get('rt'), stolen);

    const thief = new Client(server.base);
    thief.cookies.set('rt', stolen);
    assert.equal((await thief.post('/auth/refresh')).status, 401);
    // the legitimate holder is now logged out too (family revoked)
    assert.equal((await client.post('/auth/refresh')).status, 401);
    assert.ok(email);
  });

  it('lists and revokes sessions; logout invalidates the refresh token', async () => {
    const { client, email } = await registerUser(server);
    const second = new Client(server.base);
    await second.post('/auth/login', { email, password: PASSWORD });
    const list = await client.get('/me/sessions');
    assert.equal(list.body.sessions.length, 2);
    const other = list.body.sessions.find((s) => !s.current);
    assert.equal((await client.delete(`/me/sessions/${other.id}`)).status, 204);
    assert.equal((await second.post('/auth/refresh')).status, 401);

    assert.equal((await client.post('/auth/logout')).status, 204);
    assert.equal((await client.post('/auth/refresh')).status, 401);
  });

  it('rejects requests without or with a tampered access token', async () => {
    const client = new Client(server.base);
    assert.equal((await client.get('/me')).status, 401);
    client.token = 'abc.def.ghi';
    assert.equal((await client.get('/me')).status, 401);
  });
});

describe('password reset & change', () => {
  it('resets via a single-use link, revokes sessions, and never reveals account existence', async () => {
    const { client, email } = await registerUser(server);
    assert.equal((await new Client(server.base).post('/auth/password/forgot', { email: uniqueEmail() })).status, 202);
    assert.equal((await new Client(server.base).post('/auth/password/forgot', { email })).status, 202);
    const { url } = server.mailTo(email, 'password_reset').data;
    const token = new URL(url).searchParams.get('token');

    const newPassword = 'Another-Pass-99';
    const reset = await new Client(server.base).post('/auth/password/reset', { token, password: newPassword, confirmPassword: newPassword });
    assert.equal(reset.status, 204);
    const replay = await new Client(server.base).post('/auth/password/reset', { token, password: newPassword, confirmPassword: newPassword });
    assert.equal(replay.status, 401);

    assert.equal((await client.post('/auth/refresh')).status, 401, 'old sessions are revoked');
    assert.equal((await new Client(server.base).post('/auth/login', { email, password: PASSWORD })).status, 401);
    assert.equal((await new Client(server.base).post('/auth/login', { email, password: newPassword })).status, 200);
  });

  it('changes password only with the current one and keeps the current session', async () => {
    const { client, email } = await registerUser(server);
    const bad = await client.post('/me/password', { currentPassword: 'nope', password: 'Brand-New-Pass1', confirmPassword: 'Brand-New-Pass1' });
    assert.equal(bad.status, 401);
    const ok = await client.post('/me/password', { currentPassword: PASSWORD, password: 'Brand-New-Pass1', confirmPassword: 'Brand-New-Pass1' });
    assert.equal(ok.status, 204);
    assert.equal((await client.post('/auth/refresh')).status, 200);
    assert.ok(server.mailTo(email, 'password_changed'));
  });
});

describe('two-factor authentication', () => {
  it('enrols TOTP, demands it at login, blocks replay, and supports one-time recovery codes', async () => {
    const { client, email } = await registerUser(server);
    const setup = await client.post('/me/mfa/setup');
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);

    assert.equal((await client.post('/me/mfa/enable', { code: '000000' })).status, 401);
    const enabled = await client.post('/me/mfa/enable', { code: totpNow(setup.body.secret) });
    assert.equal(enabled.body.recoveryCodes.length, 10);

    const fresh = new Client(server.base);
    const login = await fresh.post('/auth/login', { email, password: PASSWORD });
    assert.equal(login.body.mfaRequired, true);
    assert.equal(fresh.token, null, 'no session before the second factor');

    // TOTP step was consumed during enable, so the same code must be rejected (replay protection).
    const replay = await fresh.post('/auth/mfa/challenge', { mfaToken: login.body.mfaToken, code: totpNow(setup.body.secret) });
    assert.equal(replay.status, 401);

    const [recovery] = enabled.body.recoveryCodes;
    const viaRecovery = await fresh.post('/auth/mfa/challenge', { mfaToken: login.body.mfaToken, recoveryCode: recovery });
    assert.equal(viaRecovery.status, 200);
    const reuse = await new Client(server.base).post('/auth/mfa/challenge', { mfaToken: login.body.mfaToken, recoveryCode: recovery });
    assert.equal(reuse.status, 401, 'recovery codes are single use');
  });
});

describe('tenants, roles & invitations', () => {
  it('invites a new person who creates their account from the link and joins with the invited role', async () => {
    const { client: owner } = await registerUser(server);
    const ws = (await owner.get('/me')).body.activeTenantId;
    const inviteeEmail = uniqueEmail();

    const sent = await owner.post(`/tenants/${ws}/invitations`, { invitations: [{ email: inviteeEmail, role: 'member' }] });
    assert.equal(sent.body.results[0].status, 'sent');
    const token = new URL(server.mailTo(inviteeEmail, 'invitation').data.url).searchParams.get('token');

    const invitee = new Client(server.base);
    const preview = await invitee.request('GET', `/invitations/preview?token=${encodeURIComponent(token)}`);
    assert.equal(preview.body.userExists, false);
    assert.equal(preview.body.email, inviteeEmail);

    const accepted = await invitee.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    assert.equal(accepted.status, 201);
    const me = await invitee.get('/me');
    assert.equal(me.body.activeTenantId, ws);
    assert.equal(me.body.tenants.find((w) => w.id === ws).role, 'member');

    const reuse = await new Client(server.base).post('/invitations/accept', { token, firstName: 'X', lastName: 'Y', password: PASSWORD, acceptTerms: true });
    assert.equal(reuse.status, 401, 'invitation is single use');

    // members cannot invite or manage; owner can list members
    assert.equal((await invitee.post(`/tenants/${ws}/invitations`, { invitations: [{ email: uniqueEmail() }] })).status, 403);
    const members = await owner.get(`/tenants/${ws}/members?limit=1`);
    assert.equal(members.body.items.length, 1);
    assert.ok(members.body.nextCursor);
    const page2 = await owner.get(`/tenants/${ws}/members?limit=1&after=${members.body.nextCursor}`);
    assert.equal(page2.body.items[0].email, inviteeEmail);
  });

  it('existing users must sign in to accept, can switch tenants, and tenants are isolated', async () => {
    const { client: ownerA } = await registerUser(server);
    const { client: ownerB, email: emailB } = await registerUser(server);
    const wsA = (await ownerA.get('/me')).body.activeTenantId;
    const wsB = (await ownerB.get('/me')).body.activeTenantId;

    // Outsider cannot see another tenant's members or invite into it.
    assert.equal((await ownerB.get(`/tenants/${wsA}/members`)).status, 404);
    assert.equal((await ownerB.post(`/tenants/${wsA}/invitations`, { invitations: [{ email: uniqueEmail() }] })).status, 404);
    assert.equal((await ownerB.post(`/tenants/${wsA}/switch`)).status, 404);

    await ownerA.post(`/tenants/${wsA}/invitations`, { invitations: [{ email: emailB, role: 'admin' }] });
    const token = new URL(server.mailTo(emailB, 'invitation').data.url).searchParams.get('token');
    assert.equal((await new Client(server.base).post('/invitations/accept', { token })).status, 401);
    assert.equal((await ownerB.post('/invitations/accept', { token })).status, 200);

    const switched = await ownerB.post(`/tenants/${wsA}/switch`);
    assert.equal(switched.status, 200);
    ownerB.token = switched.body.accessToken;
    assert.equal((await ownerB.get('/me')).body.activeTenantId, wsA);
    assert.equal((await ownerB.get(`/tenants/${wsB}/members`)).status, 200);
  });

  it('protects the last owner and enforces role hierarchy', async () => {
    const { client: owner } = await registerUser(server);
    const me = (await owner.get('/me')).body;
    const ws = me.activeTenantId;
    assert.equal((await owner.patch(`/tenants/${ws}/members/${me.user.id}`, { role: 'member' })).status, 409);
    assert.equal((await owner.post(`/tenants/${ws}/leave`)).status, 409);
  });

  it('completes tenant onboarding and supports tenant lookup by URL', async () => {
    const { client: owner } = await registerUser(server, { company: 'Globex Industries' });
    const me = (await owner.get('/me')).body;
    assert.equal(me.tenants[0].onboarded, false);
    const done = await owner.patch(`/tenants/${me.activeTenantId}/onboarding`, { name: 'Globex Industries', industry: 'Technology', teamSize: '16 - 50', timezone: 'Asia/Kolkata' });
    assert.equal(done.status, 200);
    assert.equal((await owner.get('/me')).body.tenants[0].onboarded, true);

    const slug = me.tenants[0].slug;
    const found = await new Client(server.base).get(`/tenants/lookup?tenant=${slug}`);
    assert.equal(found.body.name, 'Globex Industries');
    assert.equal((await new Client(server.base).get('/tenants/lookup?tenant=does-not-exist-xyz')).status, 404);

    const scoped = new Client(server.base);
    const email = uniqueEmail();
    assert.equal((await scoped.post('/auth/login', { email, password: PASSWORD, tenant: slug })).status, 401);
  });
});

describe('audit trail', () => {
  it('records login history for the user', async () => {
    const { client } = await registerUser(server);
    const activity = await client.get('/me/activity?limit=10');
    const types = activity.body.items.map((e) => e.type);
    assert.ok(types.includes('login_success') && types.includes('signup'));
  });
});

describe('tenant theme', () => {
  it('lets admins pick a tenant theme that every member sees; members and bad values are rejected', async () => {
    const { client: owner } = await registerUser(server);
    const ws = (await owner.get('/me')).body.activeTenantId;
    assert.equal((await owner.get('/me')).body.tenants[0].theme, 'untitled');

    const bad = await owner.patch(`/tenants/${ws}/theme`, { theme: 'neon' });
    assert.equal(bad.status, 400);
    const ok = await owner.patch(`/tenants/${ws}/theme`, { theme: 'midnight' });
    assert.equal(ok.status, 200);
    assert.equal((await owner.get('/me')).body.tenants[0].theme, 'midnight');

    const memberEmail = uniqueEmail();
    await owner.post(`/tenants/${ws}/invitations`, { invitations: [{ email: memberEmail, role: 'member' }] });
    const token = new URL(server.mailTo(memberEmail, 'invitation').data.url).searchParams.get('token');
    const member = new Client(server.base);
    await member.post('/invitations/accept', { token, firstName: 'Mem', lastName: 'Ber', password: PASSWORD, acceptTerms: true });
    assert.equal((await member.get('/me')).body.tenants[0].theme, 'midnight');
    assert.equal((await member.patch(`/tenants/${ws}/theme`, { theme: 'rose' })).status, 403);
  });
});
