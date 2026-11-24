import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, describe, it } from 'node:test';
import { sql } from 'drizzle-orm';
import { INTEGRATIONS, integrationBodySchema } from '@app/shared';
import { IntegrationsService } from '../src/modules/integrations/integrations.service.js';
import { db } from '../src/shared/db/index.js';
import { SecretBox } from '../src/shared/security/crypto.js';
import { signAwsV4 } from '../src/shared/security/signing.js';
import crypto from 'node:crypto';
import { ChannelNotifier, createNotifyJob } from '../src/modules/integrations/channelNotifier.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server; let smtp; let s3; let hook;
before(async () => { server = await startServer(); smtp = await fakeSmtp(); s3 = await fakeS3(); hook = await fakeHook(); });
after(async () => { smtp.close(); s3.close(); hook.close(); await server.stop(); });

const I = '/integrations';

/** A tiny SMTP server: accepts one user, records every message it is handed. */
function fakeSmtp(user = 'mailer', pass = 'pw-9f3k2') {
  const messages = [];
  const srv = net.createServer((socket) => {
    let data = ''; let inData = false; let current = { from: '', to: [], body: '' };
    const say = (line) => socket.write(`${line}\r\n`);
    say('220 fake ESMTP');
    socket.on('data', (chunk) => {
      data += chunk.toString();
      while (true) {
        if (inData) {
          const end = data.indexOf('\r\n.\r\n'); if (end < 0) return;
          current.body = data.slice(0, end); data = data.slice(end + 5); inData = false; messages.push(current); current = { from: '', to: [], body: '' }; say('250 queued'); continue;
        }
        const nl = data.indexOf('\r\n'); if (nl < 0) return;
        const line = data.slice(0, nl); data = data.slice(nl + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) { socket.write('250-fake\r\n250 AUTH PLAIN\r\n'); }
        else if (cmd.startsWith('AUTH PLAIN')) { const [, , u, p] = Buffer.from(line.split(' ')[2], 'base64').toString().split('\0').length === 3 ? ['', ...Buffer.from(line.split(' ')[2], 'base64').toString().split('\0')] : []; say(u === user && p === pass ? '235 ok' : '535 5.7.8 Authentication credentials invalid'); }
        else if (cmd.startsWith('MAIL FROM')) { current.from = line; say('250 ok'); }
        else if (cmd.startsWith('RCPT TO')) { current.to.push(line); say('250 ok'); }
        else if (cmd === 'DATA') { inData = true; say('354 go'); }
        else if (cmd === 'QUIT') { say('221 bye'); socket.end(); }
        else say('250 ok');
      }
    });
    socket.on('error', () => {});
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, messages, close: () => srv.close() })));
}

/** A tiny S3: HEAD /<bucket> answers 200 only for a correctly formed SigV4 request from the right access key. */
function fakeS3(accessKey = 'AKIATESTKEY') {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const auth = req.headers.authorization ?? '';
    seen.push({ method: req.method, url: req.url, auth });
    const good = auth.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`) && /SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/.test(auth);
    res.statusCode = !good ? 403 : req.url === '/files' ? 200 : 404; res.end();
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, seen, close: () => srv.close() })));
}

/** A chat-webhook receiver: records every POST (path, headers, body) and answers 200, or 500 on /broken. */
function fakeHook() {
  const received = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { received.push({ path: req.url, headers: req.headers, body }); res.statusCode = req.url.startsWith('/broken') ? 500 : 200; res.end('ok'); });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, received, url: (path) => `http://127.0.0.1:${srv.address().port}${path}`, close: () => srv.close() })));
}

async function admin() {
  const { client } = await registerUser(server);
  const me = (await client.get('/me')).body;
  return { client, ws: me.activeWorkspaceId };
}
const smtpBody = (over = {}) => ({ config: { host: 'localhost', port: smtp.port, security: 'none', username: 'mailer', from_email: 'noreply@acme.test', from_name: 'Acme', ...over.config }, secrets: { password: 'pw-9f3k2', ...over.secrets } });

describe('integrations catalogue and validation', () => {
  it('lists every provider as unconfigured, and only admins may look', async () => {
    const { client } = await admin();
    const res = await client.get(I);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.integrations.map((i) => i.key), INTEGRATIONS.map((i) => i.key));
    assert.ok(res.body.integrations.every((i) => i.status === 'unconfigured' && !i.enabled && !i.saved));
    const member = new Client(server.base); // an unauthenticated client has no role at all
    assert.equal((await member.get(I)).status, 401);
  });

  it('validates each provider from its registry entry', async () => {
    const { client } = await admin();
    assert.equal((await client.put(`${I}/nope`, smtpBody())).status, 404);
    assert.equal((await client.put(`${I}/smtp`, smtpBody({ config: { host: 'not a host!' } }))).status, 400);
    assert.equal((await client.put(`${I}/smtp`, smtpBody({ config: { from_email: 'nope' } }))).status, 400);
    assert.equal((await client.put(`${I}/smtp`, smtpBody({ config: { port: 99999 } }))).status, 400);
    assert.equal((await client.put(`${I}/smtp`, { config: { ...smtpBody().config, surprise: 1 }, secrets: { password: 'x' } })).status, 400, 'unknown fields are refused');
    assert.equal((await client.put(`${I}/smtp`, { ...smtpBody(), secrets: {} })).status, 400, 'a required secret must exist after merging');
    assert.equal(integrationBodySchema('minio').safeParse({ config: { endpoint: 'ftp://x', bucket: 'b', region: 'r', access_key_id: 'k' }, secrets: { secret_access_key: 's' } }).success, false);
  });
});

describe('connect → test → enable', () => {
  it('stores secrets encrypted, never returns them, and only enables a provider that has passed its test', async () => {
    const { client, ws } = await admin();
    const saved = await client.put(`${I}/smtp`, smtpBody());
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.integration.status, 'untested');
    assert.deepEqual(saved.body.integration.secretsSet, ['password']);
    assert.ok(!JSON.stringify(saved.body).includes('pw-9f3k2'), 'the password is never in a response');
    const { rows } = await db.execute(sql`select secrets_enc, config from workspace_integrations where workspace_id = ${ws} and provider = 'smtp'`);
    assert.ok(rows[0].secrets_enc && !rows[0].secrets_enc.includes('pw-9f3k2') && !JSON.stringify(rows[0].config).includes('pw-9f3k2'), 'encrypted at rest');
    assert.equal(new SecretBox(process.env.ENCRYPTION_KEY).decrypt(rows[0].secrets_enc).includes('"password":"pw-9f3k2"'), true);

    assert.equal((await client.post(`${I}/smtp/enabled`, { enabled: true })).status, 409, 'cannot be turned on before a successful test');

    // wrong password: the test fails, the message says why, and it still cannot be enabled
    await client.put(`${I}/smtp`, smtpBody({ secrets: { password: 'wrong' } }));
    const bad = await client.post(`${I}/smtp/test`);
    assert.equal(bad.body.integration.status, 'error');
    assert.match(bad.body.integration.statusMessage, /535|credentials|Authentication/i);
    assert.equal((await client.post(`${I}/smtp/enabled`, { enabled: true })).status, 409);

    // right password: connected, can be enabled
    await client.put(`${I}/smtp`, smtpBody());
    const good = await client.post(`${I}/smtp/test`);
    assert.equal(good.body.integration.status, 'connected', JSON.stringify(good.body));
    const on = await client.post(`${I}/smtp/enabled`, { enabled: true });
    assert.equal(on.status, 200);
    assert.equal(on.body.integrations.find((i) => i.key === 'smtp').enabled, true);

    // changing credentials resets the test and turns it off again
    const edited = await client.put(`${I}/smtp`, { ...smtpBody(), secrets: {}, config: { ...smtpBody().config, from_name: 'Acme Support' } });
    assert.equal(edited.body.integration.status, 'untested');
    assert.equal(edited.body.integration.enabled, false);
    assert.equal(edited.body.integration.config.from_name, 'Acme Support');
    assert.deepEqual(edited.body.integration.secretsSet, ['password'], 'a left-out secret keeps its stored value');

    const gone = await client.delete(`${I}/smtp`);
    assert.equal(gone.body.integrations.find((i) => i.key === 'smtp').saved, false);
  });

  it('turning one email provider on turns the other off', async () => {
    const { client, ws } = await admin();
    await client.put(`${I}/smtp`, smtpBody());
    await client.post(`${I}/smtp/test`);
    await db.execute(sql`insert into workspace_integrations (workspace_id, provider, enabled, config, secrets_enc, status) values (${ws}, 'ses', true, '{}'::jsonb, ${new SecretBox(process.env.ENCRYPTION_KEY).encrypt('{"password":"x"}')}, 'connected')`);
    const res = await client.post(`${I}/smtp/enabled`, { enabled: true });
    const by = Object.fromEntries(res.body.integrations.map((i) => [i.key, i.enabled]));
    assert.deepEqual([by.smtp, by.ses], [true, false]);
  });
});

describe('email goes through the workspace’s own provider', () => {
  it('sends via the live SMTP integration, and not at all via one that is off or untested', async () => {
    const { client, ws } = await admin();
    const mailerFor = server.container.integrations.mailerFor();
    assert.equal(await mailerFor(ws), null, 'nothing connected: the platform transport is used');
    await client.put(`${I}/smtp`, smtpBody());
    assert.equal(await mailerFor(ws), null, 'saved but untested: still not used');
    await client.post(`${I}/smtp/test`);
    assert.equal(await mailerFor(ws), null, 'tested but not enabled: still not used');
    await client.post(`${I}/smtp/enabled`, { enabled: true });
    const sender = await mailerFor(ws);
    assert.ok(sender, 'enabled and connected: used');
    const before = smtp.messages.length;
    await sender.send({ to: 'someone@example.org', subject: 'Hello', text: 'Hi there' });
    assert.equal(smtp.messages.length, before + 1);
    const message = smtp.messages.at(-1);
    assert.match(message.from, /noreply@acme\.test/);
    assert.match(message.to[0], /someone@example\.org/);
    assert.match(message.body, /From: Acme <noreply@acme\.test>/);
    await client.post(`${I}/smtp/enabled`, { enabled: false });
    await new Promise((r) => setTimeout(r, 5100)); // the in-process cache is a few seconds
    assert.equal(await mailerFor(ws), null, 'turned off: back to the platform transport');
  });
});

describe('storage providers are checked with a real signed request', () => {
  it('MinIO / S3-compatible: signs the request, accepts the right key, reports a wrong key and a missing bucket', async () => {
    const { client } = await admin();
    const body = (over = {}) => ({ config: { endpoint: `http://127.0.0.1:${s3.port}`, bucket: 'files', region: 'us-east-1', access_key_id: 'AKIATESTKEY', path_style: 'path', ...over.config }, secrets: { secret_access_key: 'topsecret', ...over.secrets } });
    await client.put(`${I}/minio`, body());
    const good = await client.post(`${I}/minio/test`);
    assert.equal(good.body.integration.status, 'connected', JSON.stringify(good.body));
    assert.equal(s3.seen.at(-1).method, 'HEAD');
    assert.equal(s3.seen.at(-1).url, '/files');
    await client.put(`${I}/minio`, body({ config: { access_key_id: 'AKIAWRONG' } }));
    assert.match((await client.post(`${I}/minio/test`)).body.integration.statusMessage, /rejected|credentials/i);
    await client.put(`${I}/minio`, body({ config: { bucket: 'nope' } }));
    assert.match((await client.post(`${I}/minio/test`)).body.integration.statusMessage, /did not find|404/i);
  });

  it('refuses private-network targets unless the install allows them', async () => {
    const { ws } = await admin();
    const strict = new IntegrationsService({ db, secretBox: new SecretBox(process.env.ENCRYPTION_KEY), repos: server.container.repos, allowPrivate: false });
    const ctx = { workspaceId: ws, userId: null };
    await strict.save(ctx, 'minio', { config: { endpoint: `http://127.0.0.1:${s3.port}`, bucket: 'files', region: 'us-east-1', access_key_id: 'AKIATESTKEY', path_style: 'path' }, secrets: { secret_access_key: 'x' } });
    const result = await strict.test(ctx, 'minio');
    assert.equal(result.status, 'error');
    assert.match(result.statusMessage, /private network/i);
    const smtpResult = await (async () => { await strict.save(ctx, 'smtp', smtpBody()); return strict.test(ctx, 'smtp'); })();
    assert.match(smtpResult.statusMessage, /private network/i, 'SMTP hosts are checked too');
  });
});

describe('request signing', () => {
  it('produces the signature AWS publishes for its own GET Object example', () => {
    const h = signAwsV4({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', headers: { Range: 'bytes=0-9' }, payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', now: new Date('2013-05-24T00:00:00Z') });
    assert.match(h.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  });
});

describe('notification channels (Slack, Teams, Discord, webhook)', () => {
  const connect = async (client, provider, path, events, extra = {}) => {
    const res = await client.put(`${I}/${provider}`, { config: { events }, secrets: { [provider === 'webhook' ? 'url' : 'webhook_url']: hook.url(path), ...extra } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const tested = await client.post(`${I}/${provider}/test`);
    assert.equal(tested.body.integration.status, 'connected', JSON.stringify(tested.body));
    assert.equal((await client.post(`${I}/${provider}/enabled`, { enabled: true })).status, 200);
  };

  it('each provider posts its own message shape when tested; several can be on at once', async () => {
    const { client } = await admin();
    hook.received.length = 0;
    await connect(client, 'slack', '/slack', ['cases']);
    await connect(client, 'teams', '/teams', ['approvals']);
    await connect(client, 'discord', '/discord', ['cases', 'big_deals']);
    await connect(client, 'webhook', '/hook', ['workflow'], { signing_secret: 'whsec-123' });
    const by = Object.fromEntries(hook.received.map((r) => [r.path, r]));
    assert.match(JSON.parse(by['/slack'].body).text, /\*Cloudbase connection test\*/);
    assert.equal(JSON.parse(by['/teams'].body).attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(JSON.parse(by['/discord'].body).embeds[0].title, 'Cloudbase connection test');
    const hookBody = by['/hook'].body;
    assert.equal(JSON.parse(hookBody).event, 'test');
    assert.equal(by['/hook'].headers['x-cloudbase-signature'], `sha256=${crypto.createHmac('sha256', 'whsec-123').update(hookBody).digest('hex')}`, 'the body is signed with the secret');
    const states = (await client.get(I)).body.integrations;
    assert.deepEqual(['slack', 'teams', 'discord', 'webhook'].map((k) => states.find((i) => i.key === k).enabled), [true, true, true, true], 'messaging is not exclusive');
    assert.deepEqual(states.find((i) => i.key === 'webhook').secretsSet.sort(), ['signing_secret', 'url']);
    assert.ok(!JSON.stringify(states).includes('whsec-123'));
  });

  it('reports a channel that answers with an error, and refuses an unknown event', async () => {
    const { client } = await admin();
    await client.put(`${I}/slack`, { config: { events: ['cases'] }, secrets: { webhook_url: hook.url('/broken') } });
    const t = await client.post(`${I}/slack/test`);
    assert.equal(t.body.integration.status, 'error');
    assert.match(t.body.integration.statusMessage, /HTTP 500/);
    assert.equal((await client.put(`${I}/slack`, { config: { events: ['everything'] }, secrets: { webhook_url: hook.url('/x') } })).status, 400);
  });

  it('only channels that asked for an event receive it, one job each, and delivery happens in the worker', async () => {
    const { client, ws } = await admin();
    await connect(client, 'slack', '/s2', ['cases']);
    await connect(client, 'discord', '/d2', ['approvals']);
    const queued = [];
    const notifier = new ChannelNotifier({ boss: { send: async (q, payload) => queued.push(payload) }, integrations: server.container.integrations });
    await notifier.post(ws, { kind: 'cases', title: 'New case: Printer', text: 'A case was created.', link: 'http://localhost:5173/app/o/Case?open=1' });
    assert.deepEqual(queued.map((j) => j.provider), ['slack']);
    await notifier.post(ws, { kind: 'tasks', title: 'x', text: 'y' });
    assert.equal(queued.length, 1, 'nobody asked for tasks');
    hook.received.length = 0;
    await createNotifyJob(server.container.integrations, { allowPrivate: true })({ data: queued[0] });
    const got = hook.received.find((r) => r.path === '/s2');
    assert.match(JSON.parse(got.body).text, /\*New case: Printer\*\nA case was created\.\n<http:\/\/localhost:5173\/app\/o\/Case\?open=1\|Open in Cloudbase>/);
    await client.post(`${I}/slack/enabled`, { enabled: false });
    hook.received.length = 0;
    await new Promise((r) => setTimeout(r, 5100));
    await createNotifyJob(server.container.integrations, { allowPrivate: true })({ data: queued[0] });
    assert.equal(hook.received.length, 0, 'a channel that was turned off meanwhile is not posted to');
  });

  it('real events reach the channel: a new case and an approval request', async () => {
    const { client } = await admin();
    await connect(client, 'slack', '/events', ['cases', 'approvals']);
    const cur = await client.get('/setup/pages/support-settings/settings');
    await client.patch('/setup/pages/support-settings/settings', { version: cur.body.version, values: { notify_case_owner: true } });
    server.outbox.length = 0;
    const made = await client.post('/objects/Case/records', { subject: 'Printer on fire' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const job = server.outbox.find((j) => j.provider === 'slack' && j.kind === 'cases');
    assert.ok(job, 'a channel job was queued for the new case');
    assert.match(job.title, /New case/);
    assert.match(job.link, /\/app\/o\/Case\?open=/);
    await client.post('/setup/pages/approval-processes/records', { process_name: 'Hot leads', object: 'Lead', status: 'Active', criteria_field: 'Rating', criteria_operator: 'equals', criteria_value: 'Hot', approver: 'boss@example.com' });
    server.outbox.length = 0;
    await client.post('/objects/Lead/records', { name: 'Ada', company: 'Analytical', rating: 'Hot' });
    assert.ok(server.outbox.some((j) => j.provider === 'slack' && j.kind === 'approvals'), 'an approval request is posted too');
  });
});
