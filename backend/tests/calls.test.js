import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { jwtVerify } from 'jose';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
let livekitUp = false;
before(async () => {
  server = await startServer();
  livekitUp = await fetch('http://127.0.0.1:7880/', { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
});
after(async () => { await server.stop(); });

const C = '/chat';
async function join(boss, name) {
  const ws = (await boss.get('/me')).body.activeTenantId;
  const email = uniqueEmail();
  await boss.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role: 'member' }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: name, lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/tenants/${ws}/switch`);
  return { person, id: (await person.get('/me')).body.user.id };
}
async function connect(client) {
  const ws = new WebSocket(server.wsUrl);
  const events = []; const waiters = [];
  ws.onmessage = (m) => { const e = JSON.parse(m.data); events.push(e); for (const w of [...waiters]) if (w.match(e)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(e); } };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.send(JSON.stringify({ type: 'auth', token: client.token }));
  const wait = (match, ms = 3000) => { const hit = events.find(match); return hit ? Promise.resolve(hit) : new Promise((resolve, reject) => { waiters.push({ match, resolve }); setTimeout(() => reject(new Error(`timed out; saw ${events.map((e) => e.type)}`)), ms); }); };
  await wait((e) => e.type === 'ready');
  return { events, wait, close: () => ws.close() };
}

describe('calls inside chat', () => {
  it('rings the other members, issues room tokens only to members, and records the call in the conversation', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela'); const outsider = await join(boss, 'Chitra');
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const sb = await connect(b.person); const so = await connect(outsider.person);

    assert.equal((await a.person.get(`${C}/config`)).body.enabled, true);
    assert.equal((await a.person.post(`${C}/conversations/${conv}/call/join`)).status, 404, 'no call yet');
    const started = await a.person.post(`${C}/conversations/${conv}/call`, { video: true });
    assert.equal(started.status, 201, JSON.stringify(started.body)); assert.equal(started.body.ringing, true);
    const ring = await sb.wait((e) => e.type === 'call.ring');
    assert.equal(ring.conversationId, conv); assert.equal(ring.video, true); assert.ok(ring.from.name.startsWith('Asha'));
    assert.ok(!so.events.some((e) => e.type === 'call.ring'), 'people outside the conversation are never rung');

    const again = await a.person.post(`${C}/conversations/${conv}/call`, { video: false });
    assert.equal(again.body.call.id, started.body.call.id, 'starting again joins the running call instead of creating a second');
    assert.equal(again.body.ringing, false);

    const joined = (await b.person.post(`${C}/conversations/${conv}/call/join`)).body;
    assert.equal(joined.url, 'ws://127.0.0.1:7880'); assert.equal(joined.identity, b.id);
    const { payload } = await jwtVerify(joined.token, new TextEncoder().encode(process.env.LIVEKIT_API_SECRET), { issuer: 'devkey' });
    assert.equal(payload.sub, b.id); assert.equal(payload.video.room, conv); assert.equal(payload.video.roomJoin, true); assert.equal(payload.video.canUpdateOwnMetadata, true, 'people may raise their own hand');
    assert.ok(payload.exp - payload.nbf <= 3600, 'tokens are short-lived');
    assert.equal((await outsider.person.post(`${C}/conversations/${conv}/call/join`)).status, 404, 'non-members cannot get a token');

    const detail = (await b.person.get(`${C}/conversations/${conv}`)).body.conversation;
    assert.equal(detail.activeCall.id, started.body.call.id);
    assert.equal((await b.person.get(`${C}/conversations`)).body.conversations[0].inCall, true);

    await b.person.post(`${C}/conversations/${conv}/call/decline`);
    assert.equal((await b.person.post(`${C}/conversations/${conv}/call/decline`)).status, 200);
    sb.close(); so.close();
  });

  it('ends a call only when the room is empty, and writes "Missed call" or "Call ended" into the conversation', async (t) => {
    if (!livekitUp) return t.skip('start `livekit-server --dev` to run this');
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela');
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const sa = await connect(a.person);

    // nobody picks up: the caller hangs up → missed
    await a.person.post(`${C}/conversations/${conv}/call`, { video: false });
    await a.person.post(`${C}/conversations/${conv}/call/join`);
    const left = await a.person.post(`${C}/conversations/${conv}/call/leave`);
    assert.equal(left.body.ended, true, 'an empty room ends the call');
    await sa.wait((e) => e.type === 'call.ended');
    const log = (await a.person.get(`${C}/conversations/${conv}/messages`)).body.messages.filter((m) => m.kind === 'call').map((m) => m.body.split(':').slice(0, 1)[0] + ':' + m.body.split(':')[2]);
    assert.deepEqual(log, ['started:audio', 'missed:audio']);
    assert.equal((await a.person.get(`${C}/conversations/${conv}`)).body.conversation.activeCall, null);

    // a real call: both join, only the starter can end it for everyone
    await a.person.post(`${C}/conversations/${conv}/call`, { video: true });
    await a.person.post(`${C}/conversations/${conv}/call/join`);
    await b.person.post(`${C}/conversations/${conv}/call/join`);
    assert.equal((await b.person.post(`${C}/conversations/${conv}/call/end`)).status, 403, 'a participant cannot end a DM call for the starter');
    assert.equal((await a.person.post(`${C}/conversations/${conv}/call/end`)).status, 200);
    const after2 = (await a.person.get(`${C}/conversations/${conv}/messages`)).body.messages.filter((m) => m.kind === 'call').map((m) => m.body.split(':')[0]);
    assert.deepEqual(after2, ['started', 'missed', 'started', 'ended']);
    assert.equal((await a.person.get(`${C}/conversations`)).body.conversations[0].inCall, false);
    sa.close();
  });

  it('ends a call when LiveKit reports the room finished, and rejects forged webhooks', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela');
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    await a.person.post(`${C}/conversations/${conv}/call`, { video: true });
    const hook = server.base.replace('/api/v1', '/api/v1/calls/livekit-webhook');
    const body = JSON.stringify({ event: 'room_finished', room: { name: conv } });
    const sign = async (payload, secret = process.env.LIVEKIT_API_SECRET) => {
      const { SignJWT } = await import('jose');
      const { createHash } = await import('node:crypto');
      return new SignJWT({ sha256: createHash('sha256').update(payload).digest('base64') }).setProtectedHeader({ alg: 'HS256' }).setIssuer('devkey').setExpirationTime('1m').sign(new TextEncoder().encode(secret));
    };
    const post = async (payload, auth) => fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/webhook+json', Authorization: auth }, body: payload });
    assert.equal((await post(body, await sign(body, 'wrong-secret'))).status, 403, 'a wrong signature is refused');
    assert.equal((await post(body, await sign('{"tampered":true}'))).status, 403, 'a signature for different bytes is refused');
    assert.equal((await a.person.get(`${C}/conversations/${conv}`)).body.conversation.activeCall !== null, true, 'forged hooks changed nothing');
    assert.equal((await post(body, await sign(body))).status, 200);
    assert.equal((await a.person.get(`${C}/conversations/${conv}`)).body.conversation.activeCall, null);
  });

  it('host controls: only the host mutes or removes, a removed person cannot rejoin', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela'); const c = await join(boss, 'Chitra');
    const group = (await a.person.post(`${C}/groups`, { title: 'Standup', memberIds: [b.id, c.id] })).body.conversation.id;
    const calls = server.container.calls;
    const real = calls.livekit;
    const log = [];
    const originals = { participants: real.participants, muteMicrophone: real.muteMicrophone, removeParticipant: real.removeParticipant, updateAttributes: real.updateAttributes };
    Object.assign(real, {
      participants: async () => [a.id, b.id, c.id],
      muteMicrophone: async (room, id) => { log.push(`mute:${id}`); return 1; },
      removeParticipant: async (room, id) => { log.push(`remove:${id}`); },
      updateAttributes: async (room, id, attrs) => { log.push(`attrs:${id}:${JSON.stringify(attrs)}`); },
    });
    try {
      await a.person.post(`${C}/conversations/${group}/call`, { video: true });
      const M = `${C}/conversations/${group}/call/moderate`;
      assert.equal((await b.person.post(M, { action: 'mute', userId: c.id })).status, 403, 'a participant is not the host');
      assert.equal((await b.person.post(M, { action: 'remove', userId: c.id })).status, 403);
      assert.equal((await a.person.post(M, { action: 'mute', userId: b.id })).body.muted, 1);
      assert.equal((await a.person.post(M, { action: 'mute-all' })).body.muted, 2, 'mute-all skips the host');
      assert.equal((await a.person.post(M, { action: 'mute', userId: a.id })).status, 400, 'the host cannot target themself');
      assert.equal((await b.person.post(M, { action: 'lower-hand', userId: c.id })).status, 403, 'only the host lowers hands');
      assert.equal((await a.person.post(M, { action: 'lower-hand', userId: c.id })).status, 200);
      assert.equal((await a.person.post(M, { action: 'remove', userId: c.id })).status, 200);
      assert.deepEqual(log, [`mute:${b.id}`, `mute:${b.id}`, `mute:${c.id}`, `attrs:${c.id}:{"hand":""}`, `remove:${c.id}`]);
      assert.equal((await c.person.post(`${C}/conversations/${group}/call/join`)).status, 403, 'a removed person cannot rejoin');
      assert.equal((await b.person.post(`${C}/conversations/${group}/call/join`)).status, 200);
      await a.person.put(`${C}/conversations/${group}/members/${b.id}`, { role: 'admin' }); // a group admin is a host too
      assert.equal((await b.person.post(M, { action: 'mute', userId: c.id })).status, 200);
    } finally { Object.assign(real, originals); }
  });

  it('refuses to start calls when LiveKit is not configured', async () => {
    const calls = server.container.calls;
    const original = calls.livekit.enabled;
    calls.livekit.enabled = false;
    try {
      const { client: boss } = await registerUser(server);
      const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela');
      const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
      assert.equal((await a.person.post(`${C}/conversations/${conv}/call`, { video: true })).status, 409);
      assert.equal((await a.person.get(`${C}/config`)).body.enabled, false);
    } finally { calls.livekit.enabled = original; }
  });
});
