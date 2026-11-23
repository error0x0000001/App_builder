import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { v7 as uuidv7 } from 'uuid';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const C = '/chat';

async function join(boss, role = 'member', name = 'Meera') {
  const ws = (await boss.get('/me')).body.activeWorkspaceId;
  const email = uniqueEmail();
  await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: name, lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/workspaces/${ws}/switch`);
  const id = (await person.get('/me')).body.user.id;
  return { person, email, ws, id };
}

/** A tiny realtime client: collects every event and lets a test wait for one. */
async function connect(client) {
  const ws = new WebSocket(server.wsUrl);
  const events = [];
  const waiters = [];
  ws.onmessage = (m) => {
    const event = JSON.parse(m.data); events.push(event);
    for (const w of [...waiters]) if (w.match(event)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(event); }
  };
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.send(JSON.stringify({ type: 'auth', token: client.token }));
  const wait = (match, ms = 3000) => {
    const hit = events.find(match);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { match, resolve }; waiters.push(w);
      setTimeout(() => reject(new Error(`timed out waiting; saw ${JSON.stringify(events.map((e) => e.type))}`)), ms);
    });
  };
  await wait((e) => e.type === 'ready');
  return { ws, events, wait, send: (frame) => ws.send(JSON.stringify(frame)), close: () => ws.close() };
}

describe('chat: conversations', () => {
  it('opens a DM idempotently, only with workspace members, and lists it in both inboxes', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const first = await a.person.post(`${C}/dm`, { userId: b.id });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const again = await b.person.post(`${C}/dm`, { userId: a.id });
    assert.equal(again.body.conversation.id, first.body.conversation.id, 'both directions give the same conversation');
    assert.equal(first.body.conversation.kind, 'dm');
    assert.equal((await a.person.post(`${C}/dm`, { userId: a.id })).status, 400, 'no DM with yourself');

    const outsider = await registerUser(server);
    const otherId = (await outsider.client.get('/me')).body.user.id;
    assert.equal((await a.person.post(`${C}/dm`, { userId: otherId })).status, 400, 'people outside the workspace cannot be messaged');

    const inbox = await b.person.get(`${C}/conversations`);
    assert.deepEqual(inbox.body.conversations.map((c) => c.id), [first.body.conversation.id]);
    assert.equal(inbox.body.conversations[0].peerId, a.id);
    assert.ok(inbox.body.people[a.id].name.startsWith('Asha'));
  });

  it('sends idempotently, pages by keyset, edits, deletes, replies, reacts and tracks unread + read cursors', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const M = `${C}/conversations/${conv}/messages`;

    const id = uuidv7();
    const sent = await a.person.post(M, { id, body: 'Hello Bela' });
    assert.equal(sent.status, 201);
    const retry = await a.person.post(M, { id, body: 'Hello Bela' });
    assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true, 'a retry never posts twice');
    assert.equal((await a.person.post(M, { id: '018f0000-0000-7000-8000-000000000000', body: 'old' })).status, 400, 'a client id must be from now');
    assert.equal((await a.person.post(M, { body: '   ' })).status, 400, 'empty messages are refused');

    for (let i = 1; i <= 5; i += 1) await a.person.post(M, { body: `msg ${i}` });
    const page1 = await b.person.get(`${M}?limit=3`);
    assert.deepEqual(page1.body.messages.map((m) => m.body), ['msg 3', 'msg 4', 'msg 5']);
    assert.equal(page1.body.hasMore, true);
    const page2 = await b.person.get(`${M}?limit=3&before=${page1.body.messages[0].id}`);
    assert.deepEqual(page2.body.messages.map((m) => m.body), ['Hello Bela', 'msg 1', 'msg 2']);
    assert.equal(page2.body.hasMore, false);
    const newer = await b.person.get(`${M}?after=${page2.body.messages[2].id}&limit=2`);
    assert.deepEqual(newer.body.messages.map((m) => m.body), ['msg 3', 'msg 4']);

    // unread + read cursor
    const unread = await b.person.get(`${C}/conversations`);
    assert.equal(unread.body.conversations[0].unread, 6);
    assert.equal((await b.person.get(`${C}/unread`)).body.unread, 6);
    assert.equal((await a.person.get(`${C}/conversations`)).body.conversations[0].unread, 0, 'my own messages are never unread');
    const last = page1.body.messages[2].id;
    await b.person.post(`${C}/conversations/${conv}/read`, { messageId: last });
    assert.equal((await b.person.get(`${C}/conversations`)).body.conversations[0].unread, 0);
    await b.person.post(`${C}/conversations/${conv}/read`, { messageId: page2.body.messages[0].id });
    const cursors = (await a.person.get(`${C}/conversations/${conv}`)).body.conversation.members;
    assert.equal(cursors.find((m) => m.userId === b.id).lastReadId, last, 'the cursor never moves backwards');

    // reply, react, edit, delete
    const reply = (await b.person.post(M, { body: 'Hi!', replyTo: id })).body.message;
    assert.equal(reply.replyPreview.body, 'Hello Bela');
    assert.equal((await b.person.put(`${M}/${id}/reactions`, { emoji: '👍' })).body.on, true);
    assert.equal((await a.person.put(`${M}/${id}/reactions`, { emoji: '👍' })).body.on, true);
    const withReaction = (await a.person.get(`${M}?limit=100`)).body.messages.find((m) => m.id === id);
    assert.deepEqual(withReaction.reactions, [{ emoji: '👍', count: 2, mine: true }]);
    assert.equal((await b.person.put(`${M}/${id}/reactions`, { emoji: '👍' })).body.on, false, 'reacting twice toggles it off');

    assert.equal((await b.person.patch(`${M}/${id}`, { body: 'hijack' })).status, 404, 'only the sender edits');
    const edited = (await a.person.patch(`${M}/${id}`, { body: 'Hello Bela!' })).body.message;
    assert.equal(edited.body, 'Hello Bela!'); assert.ok(edited.editedAt);
    assert.equal((await b.person.delete(`${M}/${id}`)).status, 404, 'a member cannot delete someone else\'s message in a DM');
    const removed = (await a.person.delete(`${M}/${id}`)).body.message;
    assert.equal(removed.body, ''); assert.ok(removed.deletedAt);
    assert.equal((await a.person.put(`${M}/${id}/reactions`, { emoji: '👍' })).status, 404, 'no reactions on deleted messages');

    // strangers see nothing
    const stranger = await join(boss, 'member', 'Chitra');
    assert.equal((await stranger.person.get(M)).status, 404);
    assert.equal((await stranger.person.post(M, { body: 'hi' })).status, 404);
  });

  it('groups: admins manage members, invite links work, the last admin is replaced, legal hold freezes edits', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const c = await join(boss, 'member', 'Chitra');
    const d = await join(boss, 'member', 'Dev');
    const made = await a.person.post(`${C}/groups`, { title: 'Launch team', memberIds: [b.id, c.id] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const id = made.body.conversation.id;
    assert.equal(made.body.conversation.role, 'admin');
    assert.equal(made.body.conversation.members.length, 3);

    assert.equal((await b.person.post(`${C}/conversations/${id}/members`, { userIds: [d.id] })).status, 403, 'members cannot add people');
    assert.equal((await b.person.patch(`${C}/conversations/${id}`, { title: 'x' })).status, 403);
    const added = await a.person.post(`${C}/conversations/${id}/members`, { userIds: [d.id] });
    assert.equal(added.body.conversation.members.length, 4);
    assert.equal((await d.person.get(`${C}/conversations/${id}`)).status, 200);

    const sys = (await d.person.get(`${C}/conversations/${id}/messages`)).body.messages.map((m) => `${m.kind}:${m.body}`);
    assert.deepEqual(sys, ['system:created', 'system:added']);

    // invite link
    const outsider = await join(boss, 'member', 'Esha');
    const { inviteCode } = (await a.person.post(`${C}/conversations/${id}/invite`)).body;
    assert.equal((await outsider.person.get(`${C}/conversations/${id}`)).status, 404);
    assert.equal((await outsider.person.post(`${C}/join/${inviteCode}`)).status, 200);
    await a.person.delete(`${C}/conversations/${id}/invite`);
    assert.equal((await outsider.person.post(`${C}/join/${inviteCode}`)).status, 404, 'a revoked link stops working');

    // removing, leaving, the last admin
    assert.equal((await a.person.delete(`${C}/conversations/${id}/members/${outsider.id}`)).status, 200);
    assert.equal((await outsider.person.get(`${C}/conversations/${id}`)).status, 404, 'removed people lose access');
    assert.equal((await b.person.put(`${C}/conversations/${id}/members/${b.id}`, { role: 'admin' })).status, 403);
    await a.person.put(`${C}/conversations/${id}/members/${b.id}`, { role: 'admin' });
    await a.person.delete(`${C}/conversations/${id}/members/${a.id}`); // admin leaves
    assert.equal((await b.person.get(`${C}/conversations/${id}`)).body.conversation.role, 'admin');
    await b.person.delete(`${C}/conversations/${id}/members/${b.id}`);
    const promoted = (await c.person.get(`${C}/conversations/${id}`)).body.conversation;
    assert.equal(promoted.role, 'admin', 'the longest-standing member becomes admin when the last admin leaves');

    // group admins may delete anyone's message; legal hold blocks it
    const msg = (await d.person.post(`${C}/conversations/${id}/messages`, { body: 'draft numbers' })).body.message;
    assert.equal((await c.person.put(`${C}/conversations/${id}/legal-hold`, { on: true })).status, 403, 'only workspace admins place holds');
    assert.equal((await boss.put(`${C}/conversations/${id}/legal-hold`, { on: true })).status, 200, 'a workspace admin can freeze a conversation they are not even in');
    const held = await c.person.delete(`${C}/conversations/${id}/messages/${msg.id}`);
    assert.equal(held.status, 409); assert.match(held.body.message ?? held.body.error?.message ?? JSON.stringify(held.body), /LEGAL_HOLD/);
    assert.equal((await d.person.patch(`${C}/conversations/${id}/messages/${msg.id}`, { body: 'changed' })).status, 409, 'edits are frozen too');
    assert.equal((await d.person.post(`${C}/conversations/${id}/messages`, { body: 'new messages still flow' })).status, 201);
    await boss.put(`${C}/conversations/${id}/legal-hold`, { on: false });
    assert.equal((await c.person.delete(`${C}/conversations/${id}/messages/${msg.id}`)).status, 200, 'after the hold, a group admin can delete a member\'s message');
  });

  it('searches only inside the conversations you belong to, with prefix matching', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const c = await join(boss, 'member', 'Chitra');
    const ab = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const ac = (await a.person.post(`${C}/dm`, { userId: c.id })).body.conversation.id;
    await a.person.post(`${C}/conversations/${ab}/messages`, { body: 'The quarterly budget review is on Friday' });
    await a.person.post(`${C}/conversations/${ac}/messages`, { body: 'Secret budget for the surprise party' });

    const mine = await b.person.get(`${C}/search?q=budget`);
    assert.equal(mine.body.results.length, 1, 'Bela only searches her own conversation');
    assert.equal(mine.body.results[0].conversationId, ab);
    const prefix = await a.person.get(`${C}/search?q=quart`);
    assert.equal(prefix.body.results.length, 1, 'the last word matches as a prefix');
    assert.equal((await a.person.get(`${C}/search?q=budget`)).body.results.length, 2);
    assert.equal((await a.person.get(`${C}/search?q=budget&conversationId=${ac}`)).body.results.length, 1);
    assert.equal((await a.person.get(`${C}/search?q=a`)).status, 400, 'one letter is not a query');
  });

  it('tracks presence for people with an open socket', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const before = await a.person.get(`${C}/presence?ids=${b.id}`);
    assert.deepEqual(before.body.online, []);
    const sock = await connect(b.person);
    assert.deepEqual((await a.person.get(`${C}/presence?ids=${b.id}`)).body.online, [b.id]);
    sock.close();
  });
});

describe('chat: realtime', () => {
  it('pushes messages, edits, reactions, read receipts and typing to members only — and wires new conversations live', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const c = await join(boss, 'member', 'Chitra');
    const sa = await connect(a.person); const sb = await connect(b.person); const sc = await connect(c.person);

    // a brand-new DM reaches Bela's already-open socket without a reconnect
    const conv = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    await sb.wait((e) => e.type === 'conversation.joined' && e.conversationId === conv);
    const M = `${C}/conversations/${conv}/messages`;

    const sent = (await a.person.post(M, { body: 'live!' })).body.message;
    const got = await sb.wait((e) => e.type === 'message.new' && e.message.id === sent.id);
    assert.equal(got.message.body, 'live!'); assert.equal(got.conversationId, conv);
    await sa.wait((e) => e.type === 'message.new' && e.message.id === sent.id); // the sender's other devices hear it too

    await b.person.patch(`${M}/${sent.id}`, { body: 'nope' }); // not his message
    await a.person.patch(`${M}/${sent.id}`, { body: 'live!!' });
    assert.equal((await sb.wait((e) => e.type === 'message.updated')).message.body, 'live!!');
    await b.person.put(`${M}/${sent.id}/reactions`, { emoji: '❤️' });
    assert.equal((await sa.wait((e) => e.type === 'reaction')).emoji, '❤️');
    await b.person.post(`${C}/conversations/${conv}/read`, { messageId: sent.id });
    assert.equal((await sa.wait((e) => e.type === 'read')).userId, b.id);

    sa.send({ type: 'typing', conversationId: conv });
    assert.equal((await sb.wait((e) => e.type === 'typing')).userId, a.id);
    assert.ok(!sa.events.some((e) => e.type === 'typing'), 'typing is not echoed to the typist');

    // Chitra is not in the conversation: she heard nothing, and cannot inject typing
    sc.send({ type: 'typing', conversationId: conv });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!sc.events.some((e) => e.type === 'message.new'), 'non-members receive nothing');
    assert.equal(sb.events.filter((e) => e.type === 'typing' && e.userId === c.id).length, 0, 'non-members cannot type into it');

    // adding Chitra to a group wires her socket live; removing her unwires it
    const group = (await a.person.post(`${C}/groups`, { title: 'Ops', memberIds: [b.id] })).body.conversation.id;
    await a.person.post(`${C}/conversations/${group}/members`, { userIds: [c.id] });
    await sc.wait((e) => e.type === 'conversation.joined' && e.conversationId === group);
    const m1 = (await a.person.post(`${C}/conversations/${group}/messages`, { body: 'welcome' })).body.message;
    await sc.wait((e) => e.type === 'message.new' && e.message.id === m1.id);
    await a.person.delete(`${C}/conversations/${group}/members/${c.id}`);
    await sc.wait((e) => e.type === 'conversation.left' && e.conversationId === group);
    const m2 = (await a.person.post(`${C}/conversations/${group}/messages`, { body: 'secret after removal' })).body.message;
    await sb.wait((e) => e.type === 'message.new' && e.message.id === m2.id);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!sc.events.some((e) => e.type === 'message.new' && e.message.id === m2.id), 'a removed member stops receiving');
    [sa, sb, sc].forEach((s) => s.close());
  });

  it('closes sockets that do not authenticate', async () => {
    const ws = new WebSocket(server.wsUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });
    ws.send(JSON.stringify({ type: 'auth', token: 'garbage' }));
    const code = await new Promise((resolve) => { ws.onclose = (e) => resolve(e.code); });
    assert.equal(code, 4401);
  });
});

describe('chat: attachments, shared media, profile photos', () => {
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);

  it('stores attachments in a private chat folder, shows them in the shared lists, and keeps outsiders (even admins) out', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const c = await join(boss, 'member', 'Chitra');
    const ab = (await a.person.post(`${C}/dm`, { userId: b.id })).body.conversation.id;
    const ac = (await a.person.post(`${C}/dm`, { userId: c.id })).body.conversation.id;

    assert.equal((await c.person.upload(`${C}/conversations/${ab}/files`, { filename: 'x.txt' })).status, 404, 'non-members cannot upload into a conversation');
    const photo = (await a.person.upload(`${C}/conversations/${ab}/files`, { filename: 'team.png', content: 'PNGDATA', type: 'image/png' })).body.file;
    const doc = (await a.person.upload(`${C}/conversations/${ab}/files`, { filename: 'plan.pdf', content: 'PDFDATA', type: 'application/pdf' })).body.file;
    assert.equal(photo.name, 'team.png');
    assert.equal((await b.person.post(`${C}/conversations/${ab}/messages`, { body: 'steal', attachments: [photo.id] })).status, 400, 'you can only attach files you uploaded');

    const sent = await a.person.post(`${C}/conversations/${ab}/messages`, { body: 'Look at this https://example.com/spec', attachments: [photo.id, doc.id] });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.deepEqual(sent.body.message.attachments.map((x) => x.name), ['team.png', 'plan.pdf']);
    assert.equal((await a.person.post(`${C}/conversations/${ab}/messages`, { attachments: [photo.id, doc.id] })).status, 201, 'a file alone is a message');

    // members can download; everyone else cannot — including the workspace owner who is not in the conversation
    assert.equal((await b.person.download(`/drive/files/${photo.id}/download`)).text, 'PNGDATA');
    assert.equal((await c.person.download(`/drive/files/${photo.id}/download`)).status, 404, 'a non-member gets nothing');
    assert.equal((await boss.download(`/drive/files/${photo.id}/download`)).status, 404, 'workspace admins do not read other people\'s chats');
    assert.equal((await boss.get('/drive/list?view=recent')).body.files.some((f) => f.id === photo.id), false, 'and chat files do not leak into their Documents');
    assert.equal((await b.person.get('/drive/list?view=recent')).body.files.some((f) => f.id === photo.id), true, 'members see them in Documents');

    // forwarding copies the file into the other conversation's own folder
    const fwd = (await a.person.post(`${C}/conversations/${ac}/messages`, { forwardOf: { conversationId: ab, messageId: sent.body.message.id } })).body.message;
    assert.equal(fwd.forwarded, true);
    assert.notEqual(fwd.attachments[0].id, photo.id);
    assert.equal((await c.person.download(`/drive/files/${fwd.attachments[0].id}/download`)).text, 'PNGDATA', 'the recipient reads their own copy');
    assert.equal((await b.person.download(`/drive/files/${fwd.attachments[0].id}/download`)).status, 404, 'and Bela cannot read Chitra\'s conversation');

    // shared lists
    const S = `${C}/conversations/${ab}/shared`;
    const media = (await b.person.get(`${S}?type=media`)).body;
    assert.equal(media.items.length, 2); assert.ok(media.items.every((i) => i.file.name === 'team.png'));
    assert.equal((await b.person.get(`${S}?type=docs`)).body.items.length, 2);
    const links = (await b.person.get(`${S}?type=links`)).body.items;
    assert.deepEqual(links.map((l) => l.url), ['https://example.com/spec']);
    assert.equal((await c.person.get(`${S}?type=media`)).status, 404, 'non-members cannot list shared media');
    const page1 = (await b.person.get(`${S}?type=media&limit=1`)).body;
    assert.equal(page1.items.length, 1); assert.ok(page1.nextBefore);
    assert.equal((await b.person.get(`${S}?type=media&limit=1&before=${page1.nextBefore}`)).body.items.length, 1);
  });

  it('profile photos: JPEG only, signed immutable URLs, shown to colleagues, removable', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha');
    const b = await join(boss, 'member', 'Bela');
    const putPhoto = (bytes, type, name) => { const f = new FormData(); f.append('file', new Blob([bytes], { type }), name); return fetch(`${server.base}/me/avatar`, { method: 'PUT', headers: { Authorization: `Bearer ${a.person.token}` }, body: f }); };
    assert.equal((await putPhoto('not a jpeg', 'image/png', 'me.png')).status, 400, 'only JPEG is accepted');
    assert.equal((await putPhoto(Buffer.alloc(600 * 1024, 0xff), 'image/jpeg', 'big.jpg')).status, 400, 'and only small ones');
    const res = await putPhoto(JPEG, 'image/jpeg', 'me.jpg');
    assert.equal(res.status, 200);
    const { avatar } = await res.json();
    assert.match(avatar, /^\/api\/v1\/avatars\/[0-9a-f-]{36}\/1\.jpg\?s=/);
    const origin = server.base.replace('/api/v1', '');
    const img = await fetch(origin + avatar);
    assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.match(img.headers.get('cache-control'), /immutable/);
    assert.equal(Buffer.from(await img.arrayBuffer()).equals(JPEG), true);
    assert.equal((await fetch(origin + avatar.replace(/s=.*/, 's=forged'))).status, 404, 'a forged signature gets nothing');
    assert.equal((await a.person.get('/me')).body.user.avatar, avatar);
    assert.equal((await b.person.get(`/people?q=asha`)).body.people.find((p) => p.id === a.id).avatar, avatar, 'colleagues see it in pickers');
    const dm = (await b.person.post(`${C}/dm`, { userId: a.id })).body;
    assert.equal(dm.people[a.id].avatar, avatar, 'and in chat');
    assert.equal((await a.person.delete('/me/avatar')).body.avatar, null);
    assert.equal((await fetch(origin + avatar)).status, 404, 'the old photo is gone');
  });

  it('lists the groups you share with someone', async () => {
    const { client: boss } = await registerUser(server);
    const a = await join(boss, 'member', 'Asha'); const b = await join(boss, 'member', 'Bela'); const c = await join(boss, 'member', 'Chitra');
    await a.person.post(`${C}/groups`, { title: 'Alpha', memberIds: [b.id] });
    await a.person.post(`${C}/groups`, { title: 'Beta', memberIds: [b.id, c.id] });
    await a.person.post(`${C}/groups`, { title: 'Gamma', memberIds: [c.id] });
    const common = (await a.person.get(`${C}/people/${b.id}/common-groups`)).body.groups.map((g) => g.title).sort();
    assert.deepEqual(common, ['Alpha', 'Beta']);
  });
});
