import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ChatRetentionService } from '../src/modules/chat/retention.service.js';
import { isPrivateAddress } from '../src/modules/chat/linkPreview.service.js';
import { db } from '../src/shared/db/index.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const C = '/chat';
async function join(boss, name) {
  const ws = (await boss.get('/me')).body.activeWorkspaceId;
  const email = uniqueEmail();
  await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role: 'member' }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: name, lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/workspaces/${ws}/switch`);
  return { person, id: (await person.get('/me')).body.user.id };
}
async function trio() {
  const { client: boss } = await registerUser(server);
  const a = await join(boss, 'Asha'); const b = await join(boss, 'Bela'); const c = await join(boss, 'Chitra');
  return { boss, a, b, c };
}
const msgs = (client, conv) => client.get(`${C}/conversations/${conv}/messages?limit=100`).then((r) => r.body.messages);

describe('chat: message features', () => {
  it('stars messages per person, lists them across conversations, and keeps stars private', async () => {
    const { a, b } = await trio();
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const m1 = (await a.person.post(`${C}/conversations/${conv}/messages`, { body: 'remember this' })).body.message;
    await a.person.post(`${C}/conversations/${conv}/messages`, { body: 'and not this' });
    assert.equal((await b.person.put(`${C}/conversations/${conv}/messages/${m1.id}/star`, { on: true })).body.starred, true);
    assert.equal((await msgs(b.person, conv)).find((m) => m.id === m1.id).starred, true);
    assert.equal((await msgs(a.person, conv)).find((m) => m.id === m1.id).starred, false, 'Asha did not star it');
    const list = (await b.person.get(`${C}/starred`)).body;
    assert.deepEqual(list.items.map((i) => i.message.body), ['remember this']);
    assert.equal(list.items[0].conversation.peerId, a.id);
    assert.equal((await a.person.get(`${C}/starred`)).body.items.length, 0);
    await b.person.put(`${C}/conversations/${conv}/messages/${m1.id}/star`, { on: false });
    assert.equal((await b.person.get(`${C}/starred`)).body.items.length, 0);
  });

  it('"delete for me" hides a message only from the person who asked', async () => {
    const { a, b } = await trio();
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const m = (await a.person.post(`${C}/conversations/${conv}/messages`, { body: 'oops' })).body.message;
    assert.equal((await a.person.delete(`${C}/conversations/${conv}/messages/${m.id}/me`)).status, 200);
    assert.equal((await msgs(a.person, conv)).some((x) => x.id === m.id), false);
    assert.equal((await msgs(b.person, conv)).some((x) => x.id === m.id), true, 'Bela still sees it');
  });

  it('disappearing messages: timer set by admins in groups, messages expire, legal hold keeps them, files go with them', async () => {
    const { boss, a, b } = await trio();
    const group = (await a.person.post(`${C}/groups`, { title: 'Temp', memberIds: [b.id] })).body.conversation.id;
    assert.equal((await b.person.put(`${C}/conversations/${group}/disappearing`, { seconds: 86400 })).status, 403, 'members of a group cannot set it');
    assert.equal((await a.person.put(`${C}/conversations/${group}/disappearing`, { seconds: 123 })).status, 400, 'only the offered durations');
    assert.equal((await a.person.put(`${C}/conversations/${group}/disappearing`, { seconds: 86400 })).body.disappearAfter, 86400);
    const file = (await a.person.upload(`${C}/conversations/${group}/files`, { filename: 'secret.txt', content: 'bytes' })).body.file;
    const m = (await a.person.post(`${C}/conversations/${group}/messages`, { body: 'this will vanish', attachments: [file.id] })).body.message;
    assert.ok(m.expiresAt, 'new messages get an expiry');
    assert.equal((await a.person.get(`${C}/conversations/${group}`)).body.conversation.disappearAfter, 86400);

    const purge = () => new ChatRetentionService({ db, storage: server.container.drive.storage }).purgeExpired();
    await db.execute(sql`update chat_messages set expires_at = now() - interval '1 minute' where conversation_id = ${group} and id = ${m.id}`);
    assert.equal((await msgs(b.person, group)).some((x) => x.id === m.id), false, 'an expired message is hidden at once, before any cleanup');

    // legal hold: nothing is destroyed
    await boss.put(`${C}/conversations/${group}/legal-hold`, { on: true });
    assert.equal((await purge()).messages, 0);
    const [kept] = (await db.execute(sql`select count(*)::int as n from chat_messages where conversation_id = ${group} and id = ${m.id}`)).rows;
    assert.equal(kept.n, 1, 'legal hold blocks the purge');
    await boss.put(`${C}/conversations/${group}/legal-hold`, { on: false });
    const result = await purge();
    assert.ok(result.messages >= 1 && result.files >= 1);
    const [gone] = (await db.execute(sql`select count(*)::int as n from drive_files where id = ${file.id}`)).rows;
    assert.equal(gone.n, 0, 'the attached file is removed too');
  });

  it('polls: single and multiple choice, counts, own votes, validation', async () => {
    const { a, b, c } = await trio();
    const group = (await a.person.post(`${C}/groups`, { title: 'Lunch', memberIds: [b.id, c.id] })).body.conversation.id;
    assert.equal((await a.person.post(`${C}/conversations/${group}/polls`, { question: 'Where?', options: ['Pizza'] })).status, 400, 'at least two options');
    assert.equal((await a.person.post(`${C}/conversations/${group}/polls`, { question: 'Where?', options: ['Pizza', 'pizza'] })).status, 400, 'options must differ');
    const created = await a.person.post(`${C}/conversations/${group}/polls`, { question: 'Where?', options: ['Pizza', 'Sushi', 'Salad'] });
    assert.equal(created.status, 201);
    const poll = created.body.message;
    assert.equal(poll.kind, 'poll'); assert.deepEqual(poll.poll.options.map((o) => o.votes), [0, 0, 0]);
    const V = `${C}/conversations/${group}/messages/${poll.id}/vote`;
    assert.equal((await b.person.put(V, { options: [0, 1] })).status, 400, 'single choice');
    assert.equal((await b.person.put(V, { options: [5] })).status, 400, 'unknown option');
    await b.person.put(V, { options: [1] }); await c.person.put(V, { options: [1] });
    const mine = (await a.person.put(V, { options: [0] })).body.poll;
    assert.deepEqual(mine.options.map((o) => [o.votes, o.mine]), [[1, true], [2, false], [0, false]]);
    assert.equal(mine.voters, 3);
    const changed = (await b.person.put(V, { options: [2] })).body.poll; // changing a vote replaces it
    assert.deepEqual(changed.options.map((o) => o.votes), [1, 1, 1]);
    assert.deepEqual((await b.person.put(V, { options: [] })).body.poll.options.map((o) => o.votes), [1, 1, 0], 'an empty list withdraws');
    const listed = (await c.person.get(`${C}/conversations/${group}/messages`)).body.messages.find((m) => m.id === poll.id);
    assert.equal(listed.poll.options[1].mine, true); assert.equal(listed.poll.voters, 2);
    const multi = (await a.person.post(`${C}/conversations/${group}/polls`, { question: 'Toppings?', options: ['Ham', 'Olives'], multi: true })).body.message;
    assert.deepEqual((await a.person.put(`${C}/conversations/${group}/messages/${multi.id}/vote`, { options: [0, 1] })).body.poll.options.map((o) => o.mine), [true, true]);
    assert.equal((await c.person.get(`${C}/conversations`)).body.conversations[0].unread, 2, 'polls count as unread');
  });

  it('message info shows who read your message; only the sender may ask', async () => {
    const { a, b, c } = await trio();
    const group = (await a.person.post(`${C}/groups`, { title: 'Info', memberIds: [b.id, c.id] })).body.conversation.id;
    const m = (await a.person.post(`${C}/conversations/${group}/messages`, { body: 'seen?' })).body.message;
    await b.person.post(`${C}/conversations/${group}/read`, { messageId: m.id });
    const info = (await a.person.get(`${C}/conversations/${group}/messages/${m.id}/info`)).body;
    assert.deepEqual(info.readBy, [b.id]); assert.deepEqual(info.pending, [c.id]);
    assert.equal((await b.person.get(`${C}/conversations/${group}/messages/${m.id}/info`)).status, 403);
  });

  it('group icon: admins only, JPEG only, signed URL shown to members', async () => {
    const { a, b } = await trio();
    const group = (await a.person.post(`${C}/groups`, { title: 'Icons', memberIds: [b.id] })).body.conversation.id;
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('icon')]);
    const put = (client, bytes) => { const f = new FormData(); f.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'i.jpg'); return fetch(`${server.base}${C}/conversations/${group}/icon`, { method: 'PUT', headers: { Authorization: `Bearer ${client.token}` }, body: f }); };
    assert.equal((await put(b.person, JPEG)).status, 403, 'members cannot set the icon');
    assert.equal((await put(a.person, Buffer.from('nope'))).status, 400);
    const res = await put(a.person, JPEG);
    assert.equal(res.status, 200);
    const { icon } = await res.json();
    assert.match(icon, /^\/api\/v1\/chat-icons\/[0-9a-f-]{36}\/1\.jpg\?s=/);
    assert.equal((await fetch(server.base.replace('/api/v1', '') + icon)).status, 200);
    assert.equal((await b.person.get(`${C}/conversations`)).body.conversations[0].icon, icon);
    assert.equal((await a.person.delete(`${C}/conversations/${group}/icon`)).body.icon, null);
  });

  it('flags unread @mentions in the inbox', async () => {
    const { a, b, c } = await trio();
    const group = (await a.person.post(`${C}/groups`, { title: 'Mentions', memberIds: [b.id, c.id] })).body.conversation.id;
    await a.person.post(`${C}/conversations/${group}/messages`, { body: 'hello @Bela', mentions: [b.id] });
    assert.equal((await b.person.get(`${C}/conversations`)).body.conversations[0].mentioned, true);
    assert.equal((await c.person.get(`${C}/conversations`)).body.conversations[0].mentioned, false);
    const last = (await msgs(b.person, group)).at(-1).id;
    await b.person.post(`${C}/conversations/${group}/read`, { messageId: last });
    assert.equal((await b.person.get(`${C}/conversations`)).body.conversations[0].mentioned, false, 'reading clears it');
  });
});

describe('chat: link previews', () => {
  it('knows which addresses must never be fetched', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(isPrivateAddress(a), true, a);
    for (const a of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPrivateAddress(a), false, a);
  });

  it('reads titles from public pages, caches them, and never connects to private addresses', async () => {
    const { a } = await trio();
    const svc = server.container.linkPreviews;
    const original = svc.fetchHtml;
    let calls = 0;
    svc.fetchHtml = async () => { calls += 1; return '<html><head><title>Fallback</title><meta property="og:title" content="Spec &amp; Plan"><meta property="og:description" content="The plan"><meta property="og:site_name" content="Example"></head></html>'; };
    try {
      const url = `https://example.com/spec-${uuidv7()}`;
      const first = (await a.person.get(`${C}/link-preview?url=${encodeURIComponent(url)}`)).body.preview;
      assert.deepEqual([first.title, first.description, first.site], ['Spec & Plan', 'The plan', 'Example']);
      await a.person.get(`${C}/link-preview?url=${encodeURIComponent(url)}`);
      assert.equal(calls, 1, 'the second look comes from the cache');
      assert.equal((await a.person.get(`${C}/link-preview?url=${encodeURIComponent('ftp://example.com/x')}`)).status, 400);
    } finally { svc.fetchHtml = original; }
    // the real fetcher refuses the loopback address (our own API) without sending a request
    const local = `${server.base.replace('/api/v1', '')}/api/v1/auth/config?x=${uuidv7()}`;
    assert.equal((await a.person.get(`${C}/link-preview?url=${encodeURIComponent(local)}`)).body.preview, null);
    assert.equal((await a.person.get(`${C}/link-preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`)).body.preview, null);
  });
});
