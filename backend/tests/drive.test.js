import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { LocalStorageDriver, TooLargeError } from '../src/shared/storage/localStorage.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const D = '/drive';
const list = (c, query = '') => c.get(`${D}/list${query}`).then((r) => r);
const names = (r) => [...r.body.folders.map((f) => f.name), ...r.body.files.map((f) => f.name)].sort();

async function join(boss, role) {
  const ws = (await boss.get('/me')).body.activeWorkspaceId;
  const email = uniqueEmail();
  await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/workspaces/${ws}/switch`);
  const id = (await person.get('/me')).body.user.id;
  return { person, email, ws, id };
}

describe('documents: folders, files and storage', () => {
  it('uploads, lists, downloads bytes exactly, supports ranges, and never shows risky types inline', async () => {
    const { client } = await registerUser(server);
    const folder = (await client.post(`${D}/folders`, { name: 'Contracts' })).body.folder;
    const up = await client.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'terms.txt', content: '0123456789', type: 'text/plain' });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const file = up.body.file;
    assert.equal(file.size, 10); assert.equal(file.name, 'terms.txt'); assert.equal(file.kind, 'text');

    const listed = await list(client, `?folder=${folder.id}`);
    assert.deepEqual(listed.body.files.map((f) => f.name), ['terms.txt']);
    assert.equal(listed.body.folder.role, 'manager');
    assert.deepEqual(listed.body.folder.breadcrumbs.map((b) => b.name), ['Contracts']);

    const full = await client.download(`${D}/files/${file.id}/download`);
    assert.equal(full.status, 200); assert.equal(full.text, '0123456789');
    assert.match(full.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''terms\.txt/);
    const part = await client.download(`${D}/files/${file.id}/download?inline=1`, { Range: 'bytes=2-5' });
    assert.equal(part.status, 206); assert.equal(part.text, '2345'); assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal((await client.download(`${D}/files/${file.id}/download`, { Range: 'bytes=50-60' })).status, 416);

    const html = (await client.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'page.html', content: '<script>alert(1)</script>', type: 'text/html' })).body.file;
    const shown = await client.download(`${D}/files/${html.id}/download?inline=1`);
    assert.equal(shown.headers.get('content-type'), 'application/octet-stream', 'HTML is never rendered inline');
    assert.match(shown.headers.get('content-disposition'), /^attachment/);
    assert.equal(shown.headers.get('x-content-type-options'), 'nosniff');

    const again = (await client.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'terms.txt', content: 'second' })).body.file;
    assert.equal(again.name, 'terms (1).txt', 'a clashing name gets a suffix');
    assert.equal((await client.upload(`${D}/files`, { filename: 'x.txt' })).status, 400, 'a folder is required');
    assert.equal((await client.post(`${D}/folders`, { name: 'Contracts' })).status, 409, 'folder names are unique in a folder');
    assert.equal((await client.post(`${D}/folders`, { name: 'a/b' })).status, 400, 'names cannot contain a slash');
    assert.ok((await client.get(`${D}/usage`)).body.used >= 10 + 24);
  });

  it('signed links let media load without a token, and expire/tamper safely', async () => {
    const { client } = await registerUser(server);
    const folder = (await client.post(`${D}/folders`, { name: 'Media' })).body.folder;
    const file = (await client.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'a.mp3', content: 'abcdef', type: 'audio/mpeg' })).body.file;
    const { url } = (await client.get(`${D}/files/${file.id}/link`)).body;
    const path = url.replace('/api/v1', '');
    const anon = await client.download(path, { Range: 'bytes=0-2' }, { auth: false });
    assert.equal(anon.status, 206); assert.equal(anon.text, 'abc'); assert.equal(anon.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await client.download(`${path.slice(0, -2)}xx`, {}, { auth: false })).status, 404, 'a tampered signature is refused');
    assert.equal((await client.download('/drive/raw/nonsense', {}, { auth: false })).status, 404);
  });

  it('rename, move (with paths), copy, trash, restore and delete forever', async () => {
    const { client, server: _ } = { client: (await registerUser(server)).client };
    const a = (await client.post(`${D}/folders`, { name: 'A' })).body.folder;
    const b = (await client.post(`${D}/folders`, { name: 'B', parentId: a.id })).body.folder;
    const c = (await client.post(`${D}/folders`, { name: 'C' })).body.folder;
    const f = (await client.upload(`${D}/files`, { fields: { folderId: b.id }, filename: 'deep.txt', content: 'deep' })).body.file;

    assert.equal((await client.patch(`${D}/folders/${a.id}`, { parentId: b.id })).status, 400, 'cannot move a folder into itself');
    const moved = await client.patch(`${D}/folders/${a.id}`, { parentId: c.id, name: 'A2' });
    assert.equal(moved.status, 200); assert.equal(moved.body.folder.name, 'A2');
    const crumbs = (await list(client, `?folder=${b.id}`)).body.folder.breadcrumbs.map((x) => x.name);
    assert.deepEqual(crumbs, ['C', 'A2', 'B'], 'descendants follow the moved folder');
    assert.equal((await client.download(`${D}/files/${f.id}/download`)).text, 'deep');

    const renamed = await client.patch(`${D}/files/${f.id}`, { name: 'renamed.txt' });
    assert.equal(renamed.body.file.name, 'renamed.txt');
    const copy = await client.post(`${D}/files/${f.id}/copy`, { folderId: c.id });
    assert.equal(copy.status, 201);
    assert.equal((await client.download(`${D}/files/${copy.body.file.id}/download`)).text, 'deep', 'copies carry the bytes');

    // trash the whole subtree, then restore it
    await client.post(`${D}/trash`, { type: 'folder', id: a.id });
    assert.equal((await list(client, `?folder=${b.id}`)).status, 404, 'a trashed folder is gone from the tree');
    const trash = await list(client, '?view=trash');
    assert.deepEqual(trash.body.folders.map((x) => x.name), ['A2'], 'only the trashed root is listed');
    assert.equal((await client.post(`${D}/delete-forever`, { type: 'file', id: copy.body.file.id })).status, 409, 'only trashed items can be deleted forever');
    await client.post(`${D}/restore`, { type: 'folder', id: a.id });
    assert.equal((await list(client, `?folder=${b.id}`)).status, 200);
    assert.equal((await client.download(`${D}/files/${f.id}/download`)).status, 200);

    // delete forever removes the stored bytes too
    const key = (await server.container.drive.fileForDownload({ workspaceId: (await client.get('/me')).body.activeWorkspaceId, userId: 'x', actor: { role: 'owner' } }, f.id)).storage_key;
    assert.ok((await server.container.drive.storage.size(key)) > 0);
    await client.post(`${D}/trash`, { type: 'file', id: f.id });
    assert.equal((await client.post(`${D}/delete-forever`, { type: 'file', id: f.id })).status, 200);
    assert.equal(await server.container.drive.storage.size(key), null, 'the bytes are gone');
    assert.equal((await client.get(`${D}/files/${f.id}`)).status, 404);
  });

  it('stars and the Recent view', async () => {
    const { client } = await registerUser(server);
    const folder = (await client.post(`${D}/folders`, { name: 'Notes' })).body.folder;
    const file = (await client.upload(`${D}/files`, { fields: { folderId: folder.id }, filename: 'todo.txt' })).body.file;
    await client.request('PUT', `${D}/stars`, { type: 'file', id: file.id, starred: true });
    await client.request('PUT', `${D}/stars`, { type: 'folder', id: folder.id, starred: true });
    assert.deepEqual(names(await list(client, '?view=starred')), ['Notes', 'todo.txt']);
    assert.equal((await list(client, `?folder=${folder.id}`)).body.files[0].starred, true);
    assert.deepEqual((await list(client, '?view=recent')).body.files.map((f) => f.name), ['todo.txt']);
    await client.request('PUT', `${D}/stars`, { type: 'file', id: file.id, starred: false });
    assert.deepEqual(names(await list(client, '?view=starred')), ['Notes']);
  });
});

describe('documents: access control', () => {
  it('people only see folders they are allowed into; access inherits until a Restricted folder', async () => {
    const { client: boss } = await registerUser(server);
    const { person: alice, id: aliceId } = await join(boss, 'member');
    const { person: bob, id: bobId } = await join(boss, 'member');
    const finance = (await alice.post(`${D}/folders`, { name: 'Finance' })).body.folder; // alice owns it
    const q1 = (await alice.post(`${D}/folders`, { name: 'Q1', parentId: finance.id })).body.folder;
    await alice.upload(`${D}/files`, { fields: { folderId: finance.id }, filename: 'budget.txt', content: 'secret' });
    const q1file = (await alice.upload(`${D}/files`, { fields: { folderId: q1.id }, filename: 'q1.txt', content: 'q1' })).body.file;

    // bob has no access: nothing visible, direct access answers 404 (existence is not revealed)
    assert.deepEqual(names(await list(bob)), ['Records']);
    assert.equal((await list(bob, `?folder=${finance.id}`)).status, 404);
    assert.equal((await bob.download(`${D}/files/${q1file.id}/download`)).status, 404);
    assert.equal((await bob.upload(`${D}/files`, { fields: { folderId: finance.id }, filename: 'x.txt' })).status, 404);
    assert.deepEqual((await list(bob, '?view=recent')).body.files, []);

    // alice (manager) shares with bob as viewer
    const shared = await alice.request('PUT', `${D}/folders/${finance.id}/access`, { entries: [{ principalType: 'user', principalId: bobId, role: 'viewer' }] });
    assert.equal(shared.status, 200, JSON.stringify(shared.body));
    assert.deepEqual(names(await list(bob)), ['Finance', 'Records']);
    assert.deepEqual(names(await list(bob, '?view=shared')), ['Finance']);
    assert.deepEqual(names(await list(bob, `?folder=${finance.id}`)), ['Q1', 'budget.txt'], 'the subfolder inherits the grant');
    assert.equal((await bob.download(`${D}/files/${q1file.id}/download`)).text, 'q1');
    assert.equal((await bob.upload(`${D}/files`, { fields: { folderId: finance.id }, filename: 'x.txt' })).status, 403, 'a viewer cannot upload');
    assert.equal((await bob.post(`${D}/folders`, { name: 'Mine', parentId: finance.id })).status, 403);
    assert.equal((await bob.request('PUT', `${D}/folders/${finance.id}/access`, { entries: [] })).status, 403, 'only managers change access');
    assert.deepEqual((await list(bob, '?view=recent')).body.files.map((f) => f.name).sort(), ['budget.txt', 'q1.txt']);
    assert.ok((await bob.get(`/search?q=budget&type=documents`)).body.groups.documents.some((d) => d.title === 'budget.txt'), 'search finds what you may see');

    // upgrade to editor
    await alice.request('PUT', `${D}/folders/${finance.id}/access`, { entries: [{ principalType: 'user', principalId: bobId, role: 'editor' }] });
    assert.equal((await bob.upload(`${D}/files`, { fields: { folderId: q1.id }, filename: 'bob.txt' })).status, 201);

    // Q1 becomes Restricted: bob keeps Finance but loses Q1 (and its files, in every view and in search)
    await alice.request('PUT', `${D}/folders/${q1.id}/access`, { inherit: false, entries: [] });
    assert.deepEqual(names(await list(bob, `?folder=${finance.id}`)), ['budget.txt']);
    assert.equal((await list(bob, `?folder=${q1.id}`)).status, 404);
    assert.equal((await bob.download(`${D}/files/${q1file.id}/download`)).status, 404);
    assert.ok(!(await list(bob, '?view=recent')).body.files.some((f) => f.name === 'q1.txt'));
    assert.equal((await bob.get(`/search?q=q1&type=documents`)).body.groups.documents.length, 0);
    assert.equal((await alice.download(`${D}/files/${q1file.id}/download`)).status, 200, 'the owner keeps access');

    // the workspace as a principal: everyone in it gets the grant
    const ws = (await boss.get('/me')).body.activeWorkspaceId;
    await alice.request('PUT', `${D}/folders/${q1.id}/access`, { inherit: false, entries: [{ principalType: 'workspace', principalId: ws, role: 'viewer' }] });
    assert.equal((await list(bob, `?folder=${q1.id}`)).status, 200, 'granted to the whole workspace');

    // admins manage everything; grants only go to members
    assert.equal((await list(boss, `?folder=${finance.id}`)).body.folder.role, 'manager');
    assert.ok(names(await list(boss, '?view=all')).includes('Finance'));
    const stranger = (await registerUser(server)).client;
    const strangerId = (await stranger.get('/me')).body.user.id;
    assert.equal((await alice.request('PUT', `${D}/folders/${finance.id}/access`, { entries: [{ principalType: 'user', principalId: strangerId, role: 'viewer' }] })).status, 400, 'cannot share with a non-member');
    const info = await alice.get(`${D}/folders/${finance.id}/access`);
    assert.equal(info.body.owner.id, aliceId); assert.equal(info.body.folder.role, 'manager');
    assert.equal((await boss.get(`${D}/people?q=meera`)).body.people.length >= 2, true, 'the share dialog can search members');
  });

  it('record attachments use the record uuid, follow the record permission, and show up in Documents', async () => {
    const { client: boss } = await registerUser(server);
    const { person: viewer } = await join(boss, 'viewer');
    const { person: member } = await join(boss, 'member');
    const lead = (await boss.post('/objects/Lead/records', { name: 'Ada Lovelace' })).body.record;

    const up = await boss.upload(`${D}/records/Lead/${lead.id}/files`, { filename: 'contract.pdf', content: '%PDF-1.4 test', type: 'application/pdf' });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.file.recordObject, 'Lead'); assert.equal(up.body.file.recordId, lead.id);
    const files = (await boss.get(`${D}/records/Lead/${lead.id}/files`)).body;
    assert.deepEqual(files.files.map((f) => f.name), ['contract.pdf']); assert.equal(files.canUpload, true);

    // visible in Documents: Records › Leads › the record
    const root = (await list(boss)).body.folders.find((f) => f.name === 'Records');
    const objectFolder = (await list(boss, `?folder=${root.id}`)).body.folders[0];
    assert.equal(objectFolder.name, 'Leads');
    const recordFolder = (await list(boss, `?folder=${objectFolder.id}`)).body.folders[0];
    assert.equal(recordFolder.recordId, lead.id, 'the folder is keyed by the record uuid');
    const inside = await list(boss, `?folder=${recordFolder.id}`);
    assert.deepEqual(inside.body.files.map((f) => f.name), ['contract.pdf']);
    assert.deepEqual(inside.body.folder.breadcrumbs.map((b) => b.name), ['Records', 'Leads', 'Ada Lovelace']);

    // a second upload goes to the same folder (one folder per record uuid)
    await boss.upload(`${D}/records/Lead/${lead.id}/files`, { filename: 'notes.txt' });
    assert.equal((await list(boss, `?folder=${recordFolder.id}`)).body.files.length, 2);
    assert.equal((await list(boss, `?folder=${objectFolder.id}`)).body.folders.length, 1);

    // readers (viewer role) can see and download but not upload; the record permission decides, not folder grants
    assert.equal((await viewer.get(`${D}/records/Lead/${lead.id}/files`)).body.files.length, 2);
    assert.equal((await viewer.get(`${D}/records/Lead/${lead.id}/files`)).body.canUpload, false);
    assert.equal((await viewer.upload(`${D}/records/Lead/${lead.id}/files`, { filename: 'v.txt' })).status, 403);
    assert.equal((await viewer.download(`${D}/files/${up.body.file.id}/download`)).status, 200);
    assert.deepEqual((await list(viewer, `?folder=${recordFolder.id}`)).body.files.length, 2, 'browsable through Records');
    assert.equal((await viewer.post(`${D}/trash`, { type: 'file', id: up.body.file.id })).status, 403, 'a viewer cannot delete attachments');
    assert.ok((await viewer.get('/search?q=contract&type=documents')).body.groups.documents.some((d) => d.title === 'contract.pdf'));

    // a record that does not exist, or a profile without read access, gives nothing
    assert.equal((await boss.get(`${D}/records/Lead/${'00000000-0000-4000-8000-000000000000'}/files`)).status, 404);
    const ws = (await boss.get('/me')).body.activeWorkspaceId;
    await boss.get(`/setup/pages/profiles/records`);
    const users = (await boss.get('/setup/pages/users/records')).body.items;
    const mEmail = (await member.get('/me')).body.user.email;
    await boss.patch(`/setup/pages/users/records/${users.find((u) => u.email === mEmail).id}`, { profile: 'Minimum Access - API Only' });
    assert.equal((await member.get(`${D}/records/Lead/${lead.id}/files`)).status, 403, 'no read access to Leads');
    assert.equal((await member.download(`${D}/files/${up.body.file.id}/download`)).status, 404);
    const recordsRoot = (await list(member)).body.folders.find((f) => f.name === 'Records');
    assert.deepEqual((await list(member, `?folder=${recordsRoot.id}`)).body.folders, [], 'the Leads folder disappears from Records');
    assert.equal((await list(member, `?folder=${objectFolder.id}`)).status, 404);
    assert.equal(ws.length > 0, true);
  });
});

describe('storage driver', () => {
  it('streams to disk with a checksum, enforces the size limit and cleans up', async () => {
    const driver = new LocalStorageDriver('/tmp/cloudbase-driver-test');
    const { size, checksum } = await driver.put('a/b/one', Readable.from([Buffer.from('hello '), Buffer.from('world')]));
    assert.equal(size, 11);
    assert.equal(checksum, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    await assert.rejects(driver.put('a/b/big', Readable.from([Buffer.alloc(100)]), { maxBytes: 50 }), TooLargeError);
    assert.equal(await driver.size('a/b/big'), null, 'a rejected upload leaves nothing behind');
    assert.throws(() => driver.open('../../etc/passwd'), /Invalid storage key/);
    await driver.remove('a/b/one'); await driver.remove('a/b/one');
    assert.equal(await driver.size('a/b/one'), null);
  });
});
