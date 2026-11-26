import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const claims = (client) => JSON.parse(Buffer.from(client.token.split('.')[1], 'base64url').toString());
async function invite(boss, role = 'member') {
  const tenantId = (await boss.get('/me')).body.activeTenantId;
  const email = uniqueEmail();
  await boss.post(`/tenants/${tenantId}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  await person.post(`/tenants/${tenantId}/switch`);
  const userId = (await person.get('/me')).body.user.id;
  return { person, userId, tenantId };
}

describe('workspaces inside a tenant', () => {
  it('every organisation starts with a default workspace the owner works in, carried by the token', async () => {
    const { client } = await registerUser(server);
    const me = (await client.get('/me')).body;
    assert.equal(me.workspaces.length, 1);
    assert.equal(me.workspaces[0].isDefault, true);
    assert.equal(me.activeWorkspaceId, me.workspaces[0].id);
    assert.equal(claims(client).wsp, me.activeWorkspaceId);
    assert.equal(claims(client).tid, me.activeTenantId);
  });

  it('people who join land in the default workspace; admins create more and assign people', async () => {
    const { client: boss } = await registerUser(server);
    const { person, userId, tenantId } = await invite(boss);
    const base = `/tenants/${tenantId}/workspaces`;
    const home = (await person.get('/me')).body.workspaces;
    assert.deepEqual(home.map((w) => w.isDefault), [true], 'an invited member is assigned to the default workspace');

    const created = (await boss.post(base, { name: 'Berlin branch' })).body.workspace;
    assert.equal(created.slug, 'berlin-branch');
    assert.equal((await boss.post(base, { name: 'berlin BRANCH' })).status, 409, 'names are unique per organisation, ignoring case');
    assert.equal((await person.post(base, { name: 'Sneaky' })).status, 403, 'members cannot create workspaces');
    assert.equal((await person.get(base)).body.workspaces.length, 1, 'the member only sees assigned workspaces');

    assert.equal((await person.post(`${base}/${created.id}/switch`)).status, 403, 'switching to an unassigned workspace is refused');
    const list = (await boss.get(`${base}/all`)).body.workspaces;
    assert.equal(list.length, 2);

    const put = await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [list.find((w) => w.isDefault).id, created.id] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal((await person.get(base)).body.workspaces.length, 2);
    const switched = await person.post(`${base}/${created.id}/switch`);
    assert.equal(switched.status, 200);
    assert.equal(claims(person).wsp, created.id);
    assert.equal((await person.get('/me')).body.activeWorkspaceId, created.id);
    assert.equal((await boss.get(`${base}/${created.id}/members`)).body.members.length, 2, 'the creator and the assigned member');
  });

  it('a person always keeps at least one workspace; assignments are replaced as a set', async () => {
    const { client: boss } = await registerUser(server);
    const { userId, tenantId } = await invite(boss);
    const base = `/tenants/${tenantId}/workspaces`;
    const extra = (await boss.post(base, { name: 'Ops' })).body.workspace;
    assert.equal((await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [] })).status, 400);
    assert.equal((await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: ['0198f000-0000-7000-8000-000000000000'] })).status, 400, 'unknown workspace');
    await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [extra.id] });
    assert.deepEqual((await boss.get(`/tenants/${tenantId}/members/${userId}/workspaces`)).body.workspaceIds, [extra.id]);
  });

  it('removing the current workspace falls back to another one at the next refresh', async () => {
    const { client: boss } = await registerUser(server);
    const { person, userId, tenantId } = await invite(boss);
    const base = `/tenants/${tenantId}/workspaces`;
    const extra = (await boss.post(base, { name: 'Pop-up' })).body.workspace;
    const main = (await boss.get(`${base}/all`)).body.workspaces.find((w) => w.isDefault);
    await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [main.id, extra.id] });
    await person.post(`${base}/${extra.id}/switch`);
    await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [main.id] });
    assert.equal((await person.post('/auth/refresh')).status, 200);
    assert.equal(claims(person).wsp, main.id);
  });

  it('archived workspaces leave every switcher; the default one cannot be archived; restoring brings it back', async () => {
    const { client: boss } = await registerUser(server);
    const tenantId = (await boss.get('/me')).body.activeTenantId;
    const base = `/tenants/${tenantId}/workspaces`;
    const extra = (await boss.post(base, { name: 'Temp' })).body.workspace;
    const main = (await boss.get(`${base}/all`)).body.workspaces.find((w) => w.isDefault);
    assert.equal((await boss.post(`${base}/${main.id}/archive`)).status, 409);
    assert.equal((await boss.post(`${base}/${extra.id}/archive`)).status, 204);
    assert.equal((await boss.get(base)).body.workspaces.length, 1);
    assert.equal((await boss.post(`${base}/${extra.id}/switch`)).status, 403, 'an archived workspace can’t be entered');
    assert.equal((await boss.post(`${base}/${extra.id}/restore`)).status, 204);
    assert.equal((await boss.get(base)).body.workspaces.length, 2);
    assert.equal((await boss.patch(`${base}/${extra.id}`, { name: 'Temporary' })).body.workspace.name, 'Temporary');
  });

  it('Documents belong to a workspace: another workspace can’t see, open, search or move them', async () => {
    const { client: boss } = await registerUser(server);
    const tenantId = (await boss.get('/me')).body.activeTenantId;
    const base = `/tenants/${tenantId}/workspaces`;
    const home = (await boss.get('/me')).body.activeWorkspaceId;
    const other = (await boss.post(base, { name: 'Branch' })).body.workspace;
    const folder = (await boss.post('/drive/folders', { name: 'Home plans' })).body.folder;
    const file = (await boss.upload('/drive/files', { fields: { folderId: folder.id }, filename: 'home-budget.txt', content: 'x' })).body.file;
    const sub = (await boss.post('/drive/folders', { name: 'Nested', parentId: folder.id })).body.folder;
    assert.equal((await boss.get(`/drive/list?folder=${sub.id}`)).status, 200, 'children stay in the parent’s workspace');

    await boss.post(`${base}/${other.id}/switch`);
    assert.deepEqual((await boss.get('/drive/list')).body.folders.filter((f) => f.kind === 'folder'), [], 'the other workspace starts empty');
    assert.equal((await boss.get(`/drive/list?folder=${folder.id}`)).status, 404, 'and cannot open the folder');
    assert.equal((await boss.download(`/drive/files/${file.id}/download`)).status, 404);
    assert.equal((await boss.get('/search?q=home&type=documents')).body.groups.documents.length, 0, 'global search is scoped too');
    const mine = (await boss.post('/drive/folders', { name: 'Branch plans' })).body.folder;
    assert.equal((await boss.get('/drive/list')).body.folders.length, 1);

    await boss.post(`${base}/${home}/switch`);
    assert.equal((await boss.get('/drive/list')).body.folders.length, 1, 'back home only the home folder shows');
    assert.equal((await boss.get('/search?q=home&type=documents')).body.groups.documents.length, 2);
    assert.equal((await boss.patch(`/drive/folders/${folder.id}`, { parentId: mine.id })).status, 404, 'a folder of another workspace is not even a valid target');
  });

  it('a token whose workspace was removed is asked to refresh before touching Documents', async () => {
    const { client: boss } = await registerUser(server);
    const { person, userId, tenantId } = await invite(boss);
    const base = `/tenants/${tenantId}/workspaces`;
    const extra = (await boss.post(base, { name: 'Pop-up' })).body.workspace;
    const main = (await boss.get(`${base}/all`)).body.workspaces.find((w) => w.isDefault);
    await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [main.id, extra.id] });
    await person.post(`${base}/${extra.id}/switch`);
    assert.equal((await person.get('/drive/list')).status, 200);
    await boss.put(`/tenants/${tenantId}/members/${userId}/workspaces`, { workspaceIds: [main.id] });
    assert.equal((await person.get('/drive/list')).status, 401);
    assert.equal((await person.post('/auth/refresh')).status, 200);
    assert.equal((await person.get('/drive/list')).status, 200);
  });

  it('never crosses organisations', async () => {
    const { client: a } = await registerUser(server);
    const { client: b } = await registerUser(server);
    const aTenant = (await a.get('/me')).body.activeTenantId;
    const bWorkspace = (await b.get('/me')).body.workspaces[0];
    assert.equal((await a.get(`/tenants/${aTenant}/workspaces/${bWorkspace.id}/members`)).status, 404);
    assert.equal((await a.post(`/tenants/${aTenant}/workspaces/${bWorkspace.id}/switch`)).status, 403);
    const bTenant = (await b.get('/me')).body.activeTenantId;
    assert.equal((await a.get(`/tenants/${bTenant}/workspaces/all`)).status, 404, 'another organisation does not even appear to exist');
  });
});
