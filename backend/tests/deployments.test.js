import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { sql } from 'drizzle-orm';
import { cronError, cronMatches, serviceCreateSchema } from '@app/shared';
import * as cmd from '../src/modules/deployments/commands.js';
import { createDeployments } from '../src/modules/deployments/index.js';
import { FakeRunner } from '../src/modules/deployments/runner.js';
import { db } from '../src/shared/db/index.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server; let fake; let svc;
before(async () => {
  server = await startServer();
  svc = server.container.deployments;
  fake = new FakeRunner((command) => {
    if (command.startsWith('docker version')) return { output: '27.3.1\n' };
    if (command.includes('rev-parse HEAD')) return { output: `Cloning…\n${'a'.repeat(40)}\n` };
    if (command.includes('top -bn1')) return { output: 'cpu 37.5\nmem 2048 8192\ndisk 1000000 20000000\nup 3 days\n' };
    if (command.includes("sh -c 'while true")) return { output: 'Running\n' };
    return { output: '' };
  });
  svc.runnerFactory = () => fake; // no SSH in tests: every command lands in the fake runner
});
after(async () => { await server.stop(); });

const D = '/deployments';
const KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----';
const queued = () => server.outbox.filter((j) => j.deploymentId);

async function admin() {
  const { client } = await registerUser(server);
  const ws = (await client.get('/me')).body.activeWorkspaceId;
  return { client, ws };
}
async function readyServer(client) {
  const created = await client.post(`${D}/servers`, { name: 'prod-1', host: 'deploy.example.com', port: 22, username: 'root', sshKey: KEY });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.server.id;
  const tested = await client.post(`${D}/servers/${id}/test`);
  assert.equal(tested.body.server.status, 'ready', JSON.stringify(tested.body));
  return id;
}
async function project(client) {
  const p = (await client.post(`${D}/projects`, { name: 'Shop' })).body.project;
  return { project: p, env: p.environments[0] };
}
async function runAll() { // run every queued job the way the worker would
  for (const job of server.outbox.splice(0).filter((j) => j.deploymentId)) await (job.jobId ? svc.runJobDeployment(job) : svc.run(job));
}

describe('feature switch and access', () => {
  it('is on here, listed in /me, admin-only, and absent when switched off', async () => {
    const { client } = await admin();
    assert.equal((await client.get('/me')).body.features.deployments, true);
    assert.equal((await new Client(server.base).get(`${D}/overview`)).status, 401);
    assert.equal((await client.get(`${D}/overview`)).status, 200);
    assert.equal(createDeployments({ enabled: false, db: null }), null, 'off = never constructed');
  });
});

describe('servers', () => {
  it('stores the key encrypted and never returns it, validates input, and reports Docker status', async () => {
    const { client, ws } = await admin();
    assert.equal((await client.post(`${D}/servers`, { name: 'x', host: 'not a host!', sshKey: KEY })).status, 400);
    assert.equal((await client.post(`${D}/servers`, { name: 'x', host: 'a.example.com', sshKey: 'short' })).status, 400);
    const created = await client.post(`${D}/servers`, { name: 'prod-1', host: 'deploy.example.com', sshKey: KEY });
    assert.equal(created.status, 201);
    assert.equal(created.body.server.hasKey, true);
    assert.ok(!JSON.stringify(created.body).includes('OPENSSH'));
    const { rows } = await db.execute(sql`select ssh_key_enc from dp_servers where workspace_id = ${ws}`);
    assert.ok(rows[0].ssh_key_enc && !rows[0].ssh_key_enc.includes('OPENSSH'), 'encrypted at rest');
    const id = created.body.server.id;
    assert.equal((await client.post(`${D}/servers/${id}/test`)).body.server.dockerVersion, '27.3.1');
    fake.respond = (c) => (c.startsWith('docker version') ? { code: 127, output: 'bash: docker: command not found' } : { output: '' });
    const missing = await client.post(`${D}/servers/${id}/test`);
    assert.equal(missing.body.server.status, 'error');
    assert.match(missing.body.server.statusMessage, /Set up server/);
    fake.respond = (c) => (c.startsWith('docker version') ? { output: '27.3.1\n' } : c.includes('rev-parse HEAD') ? { output: `${'a'.repeat(40)}\n` } : c.includes("sh -c 'while true") ? { output: 'Running\n' } : { output: '' });
  });

  it('sets a server up (Docker, Swarm, network, Traefik) as a logged deployment', async () => {
    const { client } = await admin();
    const id = (await client.post(`${D}/servers`, { name: 'fresh', host: 'fresh.example.com', sshKey: KEY })).body.server.id;
    assert.equal((await client.post(`${D}/servers/${id}/setup`, { acmeEmail: 'nope' })).status, 400);
    fake.commands.length = 0;
    const res = await client.post(`${D}/servers/${id}/setup`, { acmeEmail: 'ops@example.com' });
    assert.equal(res.status, 202);
    await runAll();
    const script = fake.commands.join('\n');
    assert.match(script, /docker swarm init/);
    assert.match(script, /quelli-traefik/);
    assert.match(script, /acme\.email='ops@example\.com'/);
    const dep = (await client.get(`${D}/deployments/${res.body.deployment.id}`)).body.deployment;
    assert.equal(dep.status, 'done');
    assert.match(dep.log, /Setting up the server/);
    assert.equal((await client.get(`${D}/servers`)).body.servers.find((s) => s.id === id).status, 'ready');
  });
});

describe('applications', () => {
  it('deploys an image: pull, a Swarm stack with routing labels and env, a log, then rollback, stop and start', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    assert.equal((await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Web', source: { type: 'docker', image: 'not an image!!' } })).status, 400);
    const made = await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Web', serverId: sid, source: { type: 'docker', image: 'nginx:1.27' }, config: { port: 80 } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const service = made.body.service;
    assert.match(service.appName, /^web-[0-9a-f]{4}$/);
    assert.equal((await client.put(`${D}/services/${service.id}/env`, { env: 'API_KEY=s3cr3t-value-123\n# comment\nMODE=prod' })).status, 204);
    assert.equal((await client.put(`${D}/services/${service.id}/env`, { env: 'bad line' })).status, 400);
    const withDomain = await client.post(`${D}/services/${service.id}/domains`, { host: 'Shop.Example.com', port: 80, https: true });
    assert.equal(withDomain.status, 201);
    assert.equal(withDomain.body.service.domains[0].url, 'https://shop.example.com');
    assert.equal(withDomain.body.deployment, null, 'nothing deployed yet, so nothing to re-apply');
    assert.equal((await client.post(`${D}/services/${service.id}/domains`, { host: 'shop.example.com', port: 80 })).status, 409, 'a domain is used once');

    fake.commands.length = 0;
    const dep = await client.post(`${D}/services/${service.id}/deploy`);
    assert.equal(dep.status, 202);
    assert.equal(queued().at(-1).deploymentId, dep.body.deployment.id);
    await runAll();
    const all = fake.commands.join('\n---\n');
    assert.match(all, /docker pull 'nginx:1\.27'/);
    assert.match(all, /docker stack deploy/);
    const written = JSON.parse(Buffer.from(/printf %s '([A-Za-z0-9+/=]+)' \| base64 -d/.exec(fake.commands.find((c) => c.includes('docker stack deploy')))[1], 'base64').toString());
    assert.equal(written.services.app.image, 'nginx:1.27');
    assert.equal(written.services.app.environment.API_KEY, 's3cr3t-value-123');
    assert.equal(written.services.app.deploy.labels['traefik.http.routers.' + service.appName + '-0.rule'], 'Host(`shop.example.com`)');
    assert.equal(written.services.app.deploy.labels['traefik.http.services.' + service.appName + '-0.loadbalancer.server.port'], '80');
    const first = (await client.get(`${D}/services/${service.id}/deployments`)).body.deployments[0];
    assert.equal(first.status, 'done');
    assert.equal(first.image, 'nginx:1.27');
    assert.match((await client.get(`${D}/deployments/${first.id}`)).body.deployment.log, /▶ Pulling nginx:1\.27/);
    assert.equal((await client.get(`${D}/services/${service.id}`)).body.service.status, 'done');
    assert.ok(!JSON.stringify((await client.get(`${D}/services/${service.id}`)).body).includes('s3cr3t'), 'env values are never in a service view');

    // routing change on a live service re-applies without a rebuild
    const live = await client.post(`${D}/services/${service.id}/domains`, { host: 'www.example.com', port: 80, https: false });
    assert.ok(live.body.deployment, 'a live service re-applies when its routing changes');
    fake.commands.length = 0; await runAll();
    assert.ok(!fake.commands.some((c) => c.includes('docker pull')), 'applying changes does not pull again');
    assert.ok(fake.commands.some((c) => c.includes('docker stack deploy')));

    // rollback to the first successful image
    fake.commands.length = 0;
    const back = await client.post(`${D}/services/${service.id}/rollback/${first.id}`);
    assert.equal(back.status, 202);
    await runAll();
    assert.ok(fake.commands.some((c) => c.includes('docker service update') && c.includes("'nginx:1.27'")));
    assert.equal((await client.post(`${D}/services/${service.id}/rollback/${crypto.randomUUID()}`)).status, 404);

    fake.commands.length = 0;
    assert.equal((await client.post(`${D}/services/${service.id}/stop`)).body.service.status, 'stopped');
    assert.match(fake.commands.at(-1), /docker service scale '.*_app'=0/);
    assert.equal((await client.post(`${D}/services/${service.id}/start`)).body.service.status, 'done');
    assert.match(fake.commands.at(-1), /=1$/);
  });

  it('hides secrets from the log, and only reveals them on an explicit, audited request', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Leaky', serverId: sid, source: { type: 'docker', image: 'nginx' } })).body.service;
    await client.put(`${D}/services/${service.id}/env`, { env: 'TOKEN=abcd-super-secret' });
    const prev = fake.respond;
    fake.respond = (c) => (c.includes('docker pull') ? { output: 'pulling with TOKEN=abcd-super-secret\n' } : prev(c));
    await client.post(`${D}/services/${service.id}/deploy`); await runAll();
    fake.respond = prev;
    const dep = (await client.get(`${D}/services/${service.id}/deployments`)).body.deployments[0];
    const log = (await client.get(`${D}/deployments/${dep.id}`)).body.deployment.log;
    assert.ok(!log.includes('abcd-super-secret'), 'known secrets never reach a stored log');
    assert.match(log, /TOKEN=•••/);
    const revealed = await client.post(`${D}/services/${service.id}/secrets`);
    assert.match(revealed.body.env, /abcd-super-secret/);
    const { rows: audit } = await db.execute(sql`select summary from setup_audit where workspace_id = ${(await client.get('/me')).body.activeWorkspaceId} and page_key = 'deployments'`);
    assert.ok(audit.some((r) => /Viewed secrets of “Leaky”/.test(r.summary)), 'revealing secrets is audited');
  });

  it('builds from a Git repository with the token kept out of the URL and the log', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    assert.equal((await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'x', source: { type: 'git', repository: 'git@github.com:a/b.git' } })).status, 400, 'https only');
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Api', serverId: sid, source: { type: 'git', repository: 'https://github.com/acme/api.git', branch: 'main', token: 'ghp_verysecrettoken', buildType: 'dockerfile' } })).body.service;
    assert.equal(service.hasGitToken, true);
    assert.ok(!JSON.stringify(service).includes('ghp_'), 'the token is not in the service view');
    fake.commands.length = 0;
    await client.post(`${D}/services/${service.id}/deploy`); await runAll();
    const clone = fake.commands.find((c) => c.includes('git -c http.extraHeader'));
    assert.ok(clone && !clone.includes('ghp_verysecrettoken') && !/https:\/\/[^ ]*@github/.test(clone), 'token goes in a header, not the URL');
    assert.ok(fake.commands.some((c) => c.includes('docker build') && c.includes('-f') && c.includes('Dockerfile')));
    const dep = (await client.get(`${D}/services/${service.id}/deployments`)).body.deployments[0];
    assert.equal(dep.commit, 'a'.repeat(40));
    assert.match(dep.image, new RegExp(`^${service.appName}:[0-9a-f]{12}$`));
    const log = (await client.get(`${D}/deployments/${dep.id}`)).body.deployment.log;
    assert.ok(!log.includes('ghp_verysecrettoken') && !log.includes(Buffer.from('x-access-token:ghp_verysecrettoken').toString('base64')));
  });

  it('fails a deployment with the reason, marks the service, and refuses a server that is not ready', async () => {
    const { client } = await admin();
    const fresh = (await client.post(`${D}/servers`, { name: 'cold', host: 'cold.example.com', sshKey: KEY })).body.server.id;
    const { env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Broken', serverId: fresh, source: { type: 'docker', image: 'nginx' } })).body.service;
    assert.equal((await client.post(`${D}/services/${service.id}/deploy`)).status, 409, 'test the server first');
    await client.post(`${D}/servers/${fresh}/test`);
    const prev = fake.respond;
    fake.respond = (c) => (c.includes('docker pull') ? { code: 1, output: 'Error: pull access denied for nginx\n' } : prev(c));
    await client.post(`${D}/services/${service.id}/deploy`); await runAll();
    fake.respond = prev;
    const dep = (await client.get(`${D}/services/${service.id}/deployments`)).body.deployments[0];
    assert.equal(dep.status, 'error');
    const log = (await client.get(`${D}/deployments/${dep.id}`)).body.deployment.log;
    assert.match(log, /pull access denied/);
    assert.match(log, /✖ Pulling nginx failed/);
    assert.equal((await client.get(`${D}/services/${service.id}`)).body.service.status, 'error');
    // a deployment the log can be read from an offset (cheap polling)
    const tail = (await client.get(`${D}/deployments/${dep.id}?from=${log.length - 5}`)).body.deployment;
    assert.equal(tail.log.length, 5);
    assert.equal(tail.logBytes, log.length);
  });
});

describe('databases, jobs and backups', () => {
  it('creates a database with a generated password, a volume and no domain; reveals the connection string on request', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const db1 = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'postgres', name: 'Main DB', serverId: sid, config: { database: { name: 'shop', user: 'shop' } } })).body.service;
    assert.equal(db1.config.port, 5432);
    assert.deepEqual(db1.config.volumes, [{ name: 'data', path: '/var/lib/postgresql/data' }]);
    assert.equal((await client.post(`${D}/services/${db1.id}/domains`, { host: 'db.example.com', port: 5432 })).status, 400, 'databases are not published on a domain');
    fake.commands.length = 0;
    await client.post(`${D}/services/${db1.id}/deploy`); await runAll();
    const stackCmd = fake.commands.find((c) => c.includes('docker stack deploy'));
    const doc = JSON.parse(Buffer.from(/printf %s '([A-Za-z0-9+/=]+)'/.exec(stackCmd)[1], 'base64').toString());
    assert.equal(doc.services.app.image, 'postgres:16');
    assert.equal(doc.services.app.environment.POSTGRES_DB, 'shop');
    assert.ok(doc.services.app.environment.POSTGRES_PASSWORD.length >= 20);
    assert.ok(doc.volumes && Object.keys(doc.volumes).length === 1);
    const revealed = (await client.post(`${D}/services/${db1.id}/secrets`)).body;
    assert.match(revealed.connectionUrl, new RegExp(`^postgresql://shop:.+@${db1.appName}_app:5432/shop$`));
    assert.equal(revealed.databasePassword, doc.services.app.environment.POSTGRES_PASSWORD);
  });

  it('validates schedules, runs a command job, and a backup needs a connected storage integration', async () => {
    const { client, ws } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const database = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'postgres', name: 'DB', serverId: sid })).body.service;
    assert.equal((await client.post(`${D}/services/${database.id}/jobs`, { name: 'x', cron: '99 * * * *', command: 'ls' })).status, 400);
    assert.equal((await client.post(`${D}/services/${database.id}/jobs`, { name: 'x', cron: '* * * * *' })).status, 400, 'a command job needs a command');
    const job = (await client.post(`${D}/services/${database.id}/jobs`, { name: 'Vacuum', cron: '30 3 * * *', command: 'psql -c "vacuum"' })).body.jobs[0];
    const backup = (await client.post(`${D}/services/${database.id}/jobs`, { kind: 'backup', name: 'Nightly backup', cron: '0 2 * * *', keep: 3 })).body.jobs.find((j) => j.kind === 'backup');
    fake.commands.length = 0;
    assert.equal((await client.post(`${D}/services/${database.id}/jobs/${job.id}/run`)).status, 202);
    await runAll();
    assert.ok(fake.commands.some((c) => c.includes('docker exec') && c.includes('vacuum')));

    await client.post(`${D}/services/${database.id}/jobs/${backup.id}/run`); await runAll();
    const noStorage = (await client.get(`${D}/services/${database.id}/deployments`)).body.deployments.find((d) => d.kind === 'backup');
    assert.equal(noStorage.status, 'error');
    assert.match((await client.get(`${D}/deployments/${noStorage.id}`)).body.deployment.log, /storage integration/);

    // connect MinIO (as enabled + connected) and the backup goes out through rclone
    const box = new (await import('../src/shared/security/crypto.js')).SecretBox(process.env.ENCRYPTION_KEY);
    await db.execute(sql`insert into workspace_integrations (workspace_id, provider, enabled, config, secrets_enc, status) values (${ws}, 'minio', true, ${JSON.stringify({ endpoint: 'https://minio.example.com', bucket: 'backups', region: 'us-east-1', access_key_id: 'AKIAX' })}::jsonb, ${box.encrypt(JSON.stringify({ secret_access_key: 'minio-secret-key' }))}, 'connected')`);
    await new Promise((r) => setTimeout(r, 5100));
    fake.commands.length = 0;
    await client.post(`${D}/services/${database.id}/jobs/${backup.id}/run`); await runAll();
    const script = fake.commands.join('\n');
    assert.match(script, /pg_dump/);
    assert.match(script, /rclone\/rclone copyto/);
    assert.match(script, /RCLONE_CONFIG_S3_ENDPOINT=https:\/\/minio\.example\.com/);
    assert.match(script, /tail -n \+4/, 'keeps the 3 newest');
    const done = (await client.get(`${D}/services/${database.id}/deployments`)).body.deployments.find((d) => d.kind === 'backup' && d.status === 'done');
    assert.ok(done, 'the backup finished');
    assert.ok(!(await client.get(`${D}/deployments/${done.id}`)).body.deployment.log.includes('minio-secret-key'));
  });

  it('queues jobs whose schedule matches this minute, once, and closes deployments a crashed worker left running', async () => {
    const { client, ws } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const database = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'redis', name: 'Cache', serverId: sid })).body.service;
    await client.post(`${D}/services/${database.id}/jobs`, { name: 'Every minute', cron: '* * * * *', command: 'redis-cli ping' });
    await client.post(`${D}/services/${database.id}/jobs`, { name: 'Never today', cron: '0 0 31 2 *', command: 'true' });
    await db.execute(sql`delete from dp_jobs where service_id <> ${database.id}::uuid`); // tick is global: jobs left by other tests must not count
    server.outbox.length = 0;
    const now = new Date();
    assert.equal(await svc.tick(now), 1);
    assert.equal(await svc.tick(now), 0, 'the same minute is not queued twice');
    assert.equal(queued().length, 1);
    await db.execute(sql`insert into dp_deployments (id, workspace_id, kind, title, status, started_at) values (${crypto.randomUUID()}::uuid, ${ws}, 'deploy', 'stuck', 'running', now() - interval '3 hours')`);
    await svc.tick(new Date(now.getTime() + 120_000));
    const { rows } = await db.execute(sql`select status, log from dp_deployments where title = 'stuck'`);
    assert.equal(rows[0].status, 'error');
    assert.match(rows[0].log, /worker stopped/);
  });
});

describe('push-to-deploy webhooks', () => {
  it('accepts a correctly signed push to the watched branch, and refuses or ignores the rest', async () => {
    const { client, ws } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Hooked', serverId: sid, source: { type: 'git', repository: 'https://github.com/acme/app.git', branch: 'main' } })).body.service;
    const { rows } = await db.execute(sql`select webhook_secret from dp_services where id = ${service.id}::uuid`);
    const secret = rows[0].webhook_secret;
    const post = (body, headers = {}, qs = '') => fetch(`${server.base}${D}/hooks/${service.id}${qs}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
    const push = JSON.stringify({ ref: 'refs/heads/main', head_commit: { message: 'Fix the thing\n\nbody' } });
    const sign = (body) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    assert.equal((await post(push)).status, 401, 'no signature');
    assert.equal((await post(push, { 'x-hub-signature-256': 'sha256=deadbeef' })).status, 401, 'bad signature');
    server.outbox.length = 0;
    const ok = await post(push, { 'x-hub-signature-256': sign(push) });
    assert.equal(ok.status, 202);
    assert.equal(queued().length, 1);
    const dep = (await client.get(`${D}/services/${service.id}/deployments`)).body.deployments[0];
    assert.equal(dep.title, 'Push: Fix the thing');
    const other = JSON.stringify({ ref: 'refs/heads/dev' });
    assert.match((await (await post(other, { 'x-hub-signature-256': sign(other) })).json()).skipped, /ignored/);
    assert.equal((await post('{}', { 'x-gitlab-token': secret })).status, 202, 'GitLab token header');
    assert.equal((await post('{}', {}, `?secret=${secret}`)).status, 202, 'generic secret');
    await client.patch(`${D}/services/${service.id}`, { autoDeploy: false });
    assert.match((await (await post(push, { 'x-hub-signature-256': sign(push) })).json()).skipped, /Auto deploy is off/);
    assert.equal((await fetch(`${server.base}${D}/hooks/${crypto.randomUUID()}`, { method: 'POST', body: '{}' })).status, 404);
    void ws;
  });
});

describe('isolation', () => {
  it('another workspace cannot see or touch these resources', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { project: p, env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Mine', serverId: sid, source: { type: 'docker', image: 'nginx' } })).body.service;
    const { client: other } = await admin();
    for (const [method, path] of [['get', `/projects/${p.id}`], ['get', `/services/${service.id}`], ['post', `/servers/${sid}/test`], ['post', `/services/${service.id}/deploy`], ['post', `/services/${service.id}/secrets`], ['get', `/services/${service.id}/deployments`]]) {
      assert.equal((await other[method](`${D}${path}`)).status, method === 'get' && path.endsWith('deployments') ? 200 : 404, `${method} ${path}`);
    }
    assert.deepEqual((await other.get(`${D}/services/${service.id}/deployments`)).body.deployments, []);
    assert.equal((await other.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'x', source: { type: 'docker', image: 'nginx' } })).status, 404);
    assert.equal((await other.get(`${D}/overview`)).body.projects.length, 0);
  });
});

describe('commands and schedules (pure)', () => {
  it('quotes everything a person typed', () => {
    assert.equal(cmd.q("a'b"), `'a'\\''b'`);
    const evil = "x'; rm -rf / #";
    assert.ok(cmd.pullCommand({ image: evil }).includes(cmd.q(evil)));
    assert.ok(cmd.cloneCommand({ repository: 'https://h/r.git', branch: evil }, 'app').includes(cmd.q(evil)));
    assert.equal(cmd.redact('token=abcd1234 and abcd1234', ['abcd1234', 'ab']), 'token=••• and •••', 'secrets under 4 characters are not redacted (they would shred the log)');
  });
  it('rejects unsafe service input before it reaches a command', () => {
    const bad = (source) => serviceCreateSchema.safeParse({ kind: 'application', name: 'x', source }).success;
    assert.equal(bad({ type: 'docker', image: 'nginx; rm -rf /' }), false);
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', branch: 'main; id' }), false);
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', buildPath: '../../etc' }), false, 'a build path cannot leave the repository');
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', buildPath: '/etc' }), false);
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', dockerfile: 'sub/../../Dockerfile' }), false);
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', buildPath: 'apps/web', dockerfile: 'docker/Dockerfile.prod' }), true);
    assert.equal(bad({ type: 'git', repository: 'https://github.com/a/b.git', dockerfile: 'a b' }), false);
    assert.equal(bad({ type: 'docker', image: 'ghcr.io/acme/app:1.2.3' }), true);
  });
  it('knows when a cron expression is valid and when it fires', () => {
    assert.equal(cronError('*/5 * * * *'), null);
    assert.ok(cronError('* * *'));
    assert.ok(cronError('60 * * * *'));
    const t = new Date(Date.UTC(2026, 10, 24, 3, 30));
    assert.deepEqual(['30 3 * * *', '*/15 * * * *', '0 3 * * *', '30 3 * * 2', '30 3 1 * 2', '*/10 2-4 * * 1-5'].map((c) => cronMatches(c, t)), [true, true, false, true, true, true]);
  });
});

describe('server metrics history', () => {
  it('samples ready servers every five minutes, once per slot, and serves the series', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const before = fake.respond;
    fake.respond = (c) => (c.includes('top -bn1') ? { output: 'cpu 37.5\nmem 2048 8192\ndisk 1000000 20000000\nup 3 days\n' } : before(c));
    const at = new Date(Date.UTC(2030, 0, 1, 10, 5));
    assert.ok(await svc.sampleServers(at) >= 1);
    await svc.sampleServers(at);
    await db.execute(sql`update dp_server_metrics set at = now() - interval '10 minutes' where server_id = ${sid}::uuid`);
    const { rows } = await db.execute(sql`select count(*)::int as n from dp_server_metrics where server_id = ${sid}::uuid`);
    assert.equal(rows[0].n, 1, 'a slot is sampled once');
    const res = await client.get(`${D}/servers/${sid}/metrics?hours=1`);
    assert.equal(res.status, 200);
    fake.respond = before;
    assert.deepEqual([res.body.metrics[0].cpu, res.body.metrics[0].memUsedMb, res.body.metrics[0].memTotalMb], [38, 2048, 8192]);
  });
});

describe('console pages: services, queue, schedules, audit, docker, ssh keys', () => {
  it('lists across services, drives Docker on a server with validated ids, and generates a usable SSH key', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const web = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Listed', serverId: sid, source: { type: 'docker', image: 'nginx:1.27' } })).body.service;
    await client.post(`${D}/services/${web.id}/jobs`, { name: 'Tick', cron: '0 1 * * *', command: 'true' });
    await client.post(`${D}/services/${web.id}/deploy`);
    for (const job of server.outbox.splice(0).filter((j) => j.deploymentId)) await svc.run(job);

    const services = (await client.get(`${D}/services`)).body.services;
    assert.ok(services.some((s) => s.name === 'Listed' && s.project === 'Shop' && s.server === 'prod-1'));
    assert.ok((await client.get(`${D}/jobs`)).body.jobs.some((j) => j.service === 'Listed' && j.name === 'Tick'));
    const queue = (await client.get(`${D}/queue?limit=5`)).body.deployments;
    assert.ok(queue.length >= 1 && queue[0].serviceName);
    assert.equal((await client.get(`${D}/queue?status=bogus`)).status, 400);
    assert.ok((await client.get(`${D}/audit`)).body.audit.some((a) => /Created service|Created application|Created/.test(a.summary)));

    const before = fake.respond;
    fake.respond = (c) => c.startsWith('docker ps -a') ? { output: `${JSON.stringify({ ID: 'abc123def456', Names: 'web.1', Image: 'nginx', State: 'running', Status: 'Up 2 hours', Ports: '80/tcp', CreatedAt: 'x' })}\n` } : c.startsWith('docker logs') ? { output: 'hello from the container\n' } : before(c);
    const list = (await client.get(`${D}/servers/${sid}/containers`)).body.containers;
    assert.deepEqual([list[0].id, list[0].state], ['abc123def456', 'running']);
    fake.commands.length = 0;
    assert.equal((await client.post(`${D}/servers/${sid}/containers/abc123def456/restart`)).status, 200);
    assert.ok(fake.commands.some((c) => c === "docker restart 'abc123def456'"));
    assert.equal((await client.post(`${D}/servers/${sid}/containers/${encodeURIComponent('abc;rm -rf /')}/stop`)).status, 400);
    assert.equal((await client.post(`${D}/servers/${sid}/containers/abc123def456/explode`)).status, 400);
    assert.equal((await client.get(`${D}/servers/${sid}/containers/abc123def456/logs`)).body.log.trim(), 'hello from the container');
    fake.respond = before;

    const key = (await client.post(`${D}/credentials/ssh-key`, { name: 'deploy key' })).body.credential;
    assert.match(key.publicKey, /^ssh-ed25519 [A-Za-z0-9+/=]+ quelli$/);
    const { rows: [row] } = await db.execute(sql`select secret_enc from dp_credentials where id = ${key.id}::uuid`);
    assert.ok(!row.secret_enc.includes('PRIVATE KEY'), 'stored encrypted');
    const { default: ssh2 } = await import('ssh2'); const { utils } = ssh2;
    const privateKey = svc.secretBox.decrypt(row.secret_enc);
    const parsed = utils.parseKey(JSON.parse(privateKey).secret);
    assert.ok(!(parsed instanceof Error), 'ssh2 accepts the generated key');
    assert.equal(parsed.type, 'ssh-ed25519');
    assert.equal(parsed.getPublicSSH().toString('base64'), key.publicKey.split(' ')[1], 'the public key matches the private one');
    const made = await client.post(`${D}/servers`, { name: 'by-key', host: 'k.example.com', port: 22, username: 'root', sshKeyId: key.id });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await client.post(`${D}/servers`, { name: 'bad', host: 'k2.example.com', sshKeyId: crypto.randomUUID() })).status, 400);
    assert.equal((await client.post(`${D}/credentials`, { kind: 'ssh', name: 'junk', secret: 'not a key' })).status, 400);
  });
});

describe('compose editor, command runner, advanced settings', () => {
  it('validates and saves a Compose file, runs one command, adds redirects and basic auth to the routing, and exposes a database port', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const compose = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'compose', name: 'Stack', serverId: sid, config: { composeFile: 'services:\n  web:\n    image: nginx\n' } })).body.service;
    assert.equal((await client.post(`${D}/compose/validate`, { composeFile: 'services: [' })).body.validation.ok, false);
    assert.equal((await client.post(`${D}/compose/validate`, { composeFile: 'services:\n  a:\n    privileged: true\n' })).body.validation.ok, false, 'a service needs an image');
    const good = (await client.post(`${D}/compose/validate`, { composeFile: 'services:\n  a:\n    image: x\n    privileged: true\n' })).body.validation;
    assert.deepEqual([good.ok, good.services, good.warnings.length], [true, ['a'], 1]);
    assert.equal((await client.get(`${D}/services/${compose.id}/compose`)).body.composeFile.includes('nginx'), true);
    assert.equal((await client.put(`${D}/services/${compose.id}/compose`, { composeFile: 'nope' })).status, 400);
    assert.equal((await client.put(`${D}/services/${compose.id}/compose`, { composeFile: 'services:\n  web:\n    image: nginx:1.27\n  cache:\n    image: redis:7\n' })).status, 200);
    assert.equal((await client.get(`${D}/services/${compose.id}`)).body.service.config.composeFile, undefined, 'the file is not in the service view');
    await client.post(`${D}/services/${compose.id}/domains`, { host: 'stack.example.com', port: 80, https: true, serviceName: 'web' });
    assert.equal((await client.put(`${D}/services/${compose.id}/compose`, { composeFile: 'services:\n  cache:\n    image: redis:7\n' })).status, 400, 'cannot drop a service a domain points at');

    const before = fake.respond;
    fake.respond = (c) => (c.includes('docker exec "$c" sh -c') ? { output: 'uid=0(root)\n' } : before(c));
    const ran = await client.post(`${D}/services/${compose.id}/exec`, { command: 'id' });
    assert.deepEqual([ran.status, ran.body.output.trim(), ran.body.code], [200, 'uid=0(root)', 0]);
    assert.ok(fake.commands.at(-1).includes("sh -c 'id'"), 'the command is quoted, not interpolated');
    fake.respond = before;

    const web = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Guarded', serverId: sid, source: { type: 'docker', image: 'nginx:1.27' }, config: { port: 80 } })).body.service;
    await client.post(`${D}/services/${web.id}/domains`, { host: 'guarded.example.com', port: 80, https: true });
    const patched = await client.patch(`${D}/services/${web.id}`, { config: { basicAuth: [{ username: 'admin', password: 's3cretpass' }], redirects: [{ regex: '^https://old\\.example\\.com/(.*)', replacement: 'https://guarded.example.com/$1', permanent: true }], memoryLimitMb: 256, cpuLimit: 0.5 } });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.deepEqual(patched.body.service.config.basicAuthUsers, [{ username: 'admin' }], 'hashes never leave the server');
    assert.equal(JSON.stringify(patched.body).includes('s3cretpass'), false);
    fake.commands.length = 0;
    await client.post(`${D}/services/${web.id}/deploy`);
    for (const job of server.outbox.splice(0).filter((j) => j.deploymentId)) await svc.run(job);
    const stack = fake.commands.find((c) => c.includes('docker stack deploy'));
    const doc = JSON.parse(Buffer.from(stack.match(/printf %s '([A-Za-z0-9+/=]+)'/)[1], 'base64').toString());
    const labels = Object.values(doc.services)[0].deploy.labels;
    assert.match(labels[Object.keys(labels).find((k) => k.endsWith('-auth.basicauth.users'))], /^admin:\{SHA\}/);
    assert.ok(Object.keys(labels).some((k) => k.includes('redirectregex.regex')));
    assert.ok(Object.entries(labels).some(([k, v]) => k.endsWith('.middlewares') && /auth/.test(v)));
    // keeping a user without re-entering the password keeps the hash
    await client.patch(`${D}/services/${web.id}`, { config: { basicAuth: [{ username: 'admin', keep: true }, { username: 'ops', password: 'another-pass' }] } });
    const kept = (await client.get(`${D}/services/${web.id}`)).body.service.config.basicAuthUsers;
    assert.deepEqual(kept.map((u) => u.username), ['admin', 'ops']);
    assert.equal((await client.patch(`${D}/services/${web.id}`, { config: { basicAuth: [{ username: 'x', password: '123' }] } })).status, 400);

    const db = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'postgres', name: 'Pg', serverId: sid })).body.service;
    await client.patch(`${D}/services/${db.id}`, { config: { publishedPorts: [{ published: 35432, target: 5432, protocol: 'tcp' }] } });
    const secrets = (await client.post(`${D}/services/${db.id}/secrets`)).body;
    assert.match(secrets.externalUrl, /@deploy\.example\.com:35432\/app$/);
    assert.match(secrets.connectionUrl, /@[a-z0-9-]+_app:5432\/app$/);
  });
});

describe('templates', () => {
  it('lists the catalog, deploys a template as a Compose stack with routing labels and its files, and refuses bad input', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const list = (await client.get(`${D}/templates`)).body.templates;
    assert.ok(list.length > 600 && list.some((t) => t.id === 'plausible'));
    const detail = (await client.get(`${D}/templates/plausible`)).body.template;
    assert.ok(detail.services.includes('plausible') && detail.mounts.length >= 1 && detail.compose.includes('services:'));
    assert.equal((await client.get(`${D}/templates/nope-nothing`)).status, 404);
    assert.equal((await client.get(`${D}/templates/..%2Fetc`)).status, 400);

    const created = await client.post(`${D}/environments/${env.id}/templates`, { templateId: 'plausible', serverId: sid, domain: 'stats.example.com' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const service = created.body.service;
    assert.equal(service.kind, 'compose');
    assert.deepEqual(service.domains.map((d) => [d.host, d.serviceName, d.port, d.https]), [['stats.example.com', 'plausible', 8000, true]]);

    fake.commands.length = 0;
    await client.post(`${D}/services/${service.id}/deploy`);
    for (const job of server.outbox.splice(0).filter((j) => j.deploymentId)) await svc.run(job);
    const script = fake.commands.find((c) => c.includes('docker compose'));
    assert.ok(script, 'brought up with docker compose');
    assert.ok(script.includes('clickhouse-config.xml'), 'template files are written');
    const composeB64 = [...script.matchAll(/printf %s '([A-Za-z0-9+/=]+)' \| base64 -d > '[^']*docker-compose\.yml'/g)][0][1];
    const doc = Buffer.from(composeB64, 'base64').toString();
    assert.match(doc, /traefik\.http\.routers\.[^\n]*Host\(`stats\.example\.com`\)/);
    assert.match(doc, /traefik\.docker\.network: quelli-network/);
    assert.match(doc, /external: true/);
    const envB64 = [...script.matchAll(/printf %s '([A-Za-z0-9+/=]+)' \| base64 -d > '[^']*\/code\/\.env'/g)][0][1];
    assert.match(Buffer.from(envB64, 'base64').toString(), /SECRET_KEY_BASE=[A-Za-z0-9+/=]{80,}/);
    const revealed = (await client.post(`${D}/services/${service.id}/secrets`)).body.env;
    assert.match(revealed, /BASE_URL=http:\/\/stats\.example\.com/);

    assert.equal((await client.post(`${D}/environments/${env.id}/templates`, { templateId: 'ghost', serverId: sid })).status, 400, 'a domain is needed on a server with a hostname');
    assert.equal((await client.post(`${D}/environments/${env.id}/templates`, { templateId: 'ghost', serverId: sid, domain: 'stats.example.com' })).status, 409, 'domain already used');
    assert.equal((await client.post(`${D}/environments/${env.id}/templates`, { templateId: 'nope', serverId: sid, domain: 'x.example.com' })).status, 404);
    const extra = await client.post(`${D}/services/${service.id}/domains`, { host: 'two.example.com', port: 80, https: false });
    assert.equal(extra.status, 400, 'a Compose domain must name its service');
    assert.equal((await client.post(`${D}/services/${service.id}/domains`, { host: 'two.example.com', port: 80, https: false, serviceName: 'plausible' })).status, 201);
  });
});

describe('web terminal', () => {
  const open = async (token, frame) => {
    const ws = new WebSocket(server.base.replace('http', 'ws').replace('/api/v1', '/api/v1/deployments/terminal'));
    const events = []; let closeCode = null;
    ws.onmessage = (m) => events.push(JSON.parse(m.data)); ws.onclose = (e) => { closeCode = e.code; };
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.send(JSON.stringify({ type: 'auth', token, ...frame }));
    const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const hit = fn(); if (hit) return hit; await new Promise((r) => setTimeout(r, 20)); } throw new Error(`timed out: ${JSON.stringify(events)} ${closeCode}`); };
    return { ws, events, until, code: () => closeCode };
  };
  it('bridges a manager to a shell in the service, and refuses everyone else', async () => {
    const { client, ws: wsId } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Shell', serverId: sid, source: { type: 'docker', image: 'nginx:1.27' } })).body.service;
    fake.commands.length = 0;
    const t = await open(client.token, { serviceId: service.id, cols: 100, rows: 30 });
    await t.until(() => t.events.find((e) => e.type === 'ready'));
    assert.ok(fake.commands.some((c) => c.includes('docker exec -it')), 'runs docker exec with a terminal');
    t.ws.send(JSON.stringify({ type: 'data', data: 'ls\n' }));
    assert.equal((await t.until(() => t.events.find((e) => e.type === 'data'))).data, 'echo:ls\n');
    t.ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    await t.until(() => fake.lastSize?.[0] === 120);
    t.ws.close();
    const audit = await db.execute(sql`select count(*)::int as n from setup_audit where workspace_id = ${wsId} and summary like 'Opened a terminal%'`);
    assert.equal(audit.rows[0].n, 1);

    const bad = await open('garbage', {});
    await bad.until(() => bad.code() === 4401);
    // a deployer (not manager) is refused
    const email = uniqueEmail();
    await client.post(`/workspaces/${wsId}/invitations`, { invitations: [{ email, role: 'member' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const person = new Client(server.base);
    await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    await person.post(`/workspaces/${wsId}/switch`);
    const denied = await open(person.token, { serviceId: service.id });
    await denied.until(() => denied.code() === 4403);
  });
});

describe('swarm cluster', () => {
  it('lists nodes, joins a server to a manager with a redacted token, and drains or removes nodes', async () => {
    const { client } = await admin();
    const managerId = await readyServer(client);
    const worker = (await client.post(`${D}/servers`, { name: 'worker-1', host: 'w1.example.com', port: 22, username: 'root', sshKey: KEY })).body.server;
    await client.post(`${D}/servers/${worker.id}/test`);
    const before = fake.respond;
    const node = (id, host, mgr) => JSON.stringify({ ID: id, Hostname: host, Status: 'Ready', Availability: 'Active', ManagerStatus: mgr, EngineVersion: '27.3.1' });
    fake.respond = (c) => c.startsWith('docker node ls') ? { output: `${node('abcdefghij1', 'prod-1', 'Leader')}\n${node('abcdefghij2', 'worker-1', '')}\n` } : c.startsWith('docker swarm join-token') ? { output: 'SWMTKN-1-secrettokenvalue\n' } : before(c);
    const nodes = (await client.get(`${D}/servers/${managerId}/nodes`)).body.nodes;
    assert.deepEqual(nodes.map((n) => [n.hostname, n.role]), [['prod-1', 'manager'], ['worker-1', 'worker']]);
    fake.commands.length = 0;
    const joined = await client.post(`${D}/servers/${worker.id}/join`, { managerId });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.ok(fake.commands.some((c) => c.includes('docker swarm join --token') && c.includes(':2377')));
    assert.equal((await client.post(`${D}/servers/${worker.id}/join`, { managerId: worker.id })).status, 400);
    assert.equal((await client.post(`${D}/servers/${managerId}/nodes/abcdefghij2/drain`)).status, 200);
    assert.ok(fake.commands.some((c) => c.includes('--availability') && c.includes('drain')));
    assert.equal((await client.post(`${D}/servers/${managerId}/nodes/abcdefghij2/remove`)).status, 200);
    assert.equal((await client.post(`${D}/servers/${managerId}/nodes/${encodeURIComponent('x; rm -rf')}/drain`)).status, 400, 'node ids are validated');
    fake.respond = (c) => (c.startsWith('docker node ls') ? { code: 1, output: 'not a swarm manager' } : before(c));
    assert.equal((await client.get(`${D}/servers/${managerId}/nodes`)).status, 400);
    fake.respond = before;
    assert.throws(() => cmd.nodeActionCommand('a b', 'drain'));
  });
});

describe('preview deployments', () => {
  it('deploys one copy per pushed branch, reuses it, and removes it when the branch is deleted', async () => {
    const { client, ws } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const web = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Site', serverId: sid, source: { type: 'git', repository: 'https://github.com/acme/site.git', branch: 'main' }, config: { port: 3000 } })).body.service;
    assert.equal((await client.patch(`${D}/services/${web.id}`, { config: { previews: { enabled: true, domain: 'preview.example.com' } } })).status, 200);
    await client.put(`${D}/services/${web.id}/env`, { env: 'API=1' });
    const { rows } = await db.execute(sql`select webhook_secret from dp_services where id = ${web.id}::uuid`);
    const push = (body) => { const raw = JSON.stringify(body); return fetch(`${server.base}${D}/hooks/${web.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', rows[0].webhook_secret).update(raw).digest('hex')}` }, body: raw }); };
    server.outbox.length = 0;
    const first = await push({ ref: 'refs/heads/feature/Login Page', head_commit: { message: 'wip' } });
    assert.equal(first.status, 202);
    const previews = async () => (await db.execute(sql`select s.id, s.preview_branch, s.env_enc, d.host from dp_services s left join dp_domains d on d.service_id = s.id where s.preview_of = ${web.id}::uuid`)).rows;
    let list = await previews();
    assert.equal(list.length, 1);
    assert.equal(list[0].preview_branch, 'feature/Login Page');
    assert.match(list[0].host, /^feature-login-page-site-[a-f0-9]{4}\.preview\.example\.com$/);
    assert.ok(list[0].env_enc, 'the parent’s variables carry over');
    assert.equal(queued().length, 1);
    await push({ ref: 'refs/heads/feature/Login Page' });
    assert.equal((await previews()).length, 1, 'the same branch reuses its preview');
    assert.equal(queued().length, 2);
    const off = await push({ ref: 'refs/heads/feature/Login Page', deleted: true });
    assert.equal((await off.json()).removed, true);
    assert.equal((await previews()).length, 0);
    await client.patch(`${D}/services/${web.id}`, { config: { previews: { enabled: false } } });
    assert.equal((await (await push({ ref: 'refs/heads/other' })).json()).skipped.includes('ignored'), true, 'previews off: other branches are ignored');
    assert.ok(ws);
  });
});

describe('saved credentials', () => {
  it('stores a registry login and a Git token encrypted and applies them to deployments without leaking', async () => {
    const { client } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const reg = (await client.post(`${D}/credentials`, { kind: 'registry', name: 'GHCR', url: 'ghcr.io', username: 'acme-bot', secret: 'ghp_RegistrySecretValue1' })).body.credential;
    const git = (await client.post(`${D}/credentials`, { kind: 'git', name: 'GitHub', secret: 'ghp_GitSecretValue2' })).body.credential;
    assert.equal(JSON.stringify((await client.get(`${D}/credentials`)).body).includes('ghp_'), false, 'secrets are never returned');
    assert.equal((await client.post(`${D}/credentials`, { kind: 'registry', name: 'bad', secret: 'x' })).status, 400);
    const stored = await db.execute(sql`select secret_enc from dp_credentials`);
    assert.ok(stored.rows.every((r) => !r.secret_enc.includes('ghp_')));

    const web = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Private', serverId: sid, source: { type: 'docker', image: 'ghcr.io/acme/web:1', credentialId: reg.id } })).body.service;
    assert.equal((await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Wrong', serverId: sid, source: { type: 'docker', image: 'ghcr.io/acme/web:1', credentialId: git.id } })).status, 400, 'a Git token is not a registry login');
    fake.commands.length = 0;
    await client.post(`${D}/services/${web.id}/deploy`);
    for (const job of server.outbox.splice(0).filter((j) => j.deploymentId)) await svc.run(job);
    assert.ok(fake.commands.some((c) => c.includes('docker login') && c.includes("'acme-bot'") && c.includes("'ghcr.io'")), 'logs in with the saved registry');
    const dep = (await client.get(`${D}/services/${web.id}/deployments`)).body.deployments[0];
    const log = (await client.get(`${D}/deployments/${dep.id}`)).body.deployment.log;
    assert.equal(log.includes('RegistrySecretValue'), false);
    assert.equal((await client.delete(`${D}/credentials/${reg.id}`)).status, 409, 'in use');
    assert.equal((await client.delete(`${D}/credentials/${git.id}`)).status, 200);
  });
});

describe('access follows Quelli roles', () => {
  async function join(boss, ws, role) {
    const email = uniqueEmail();
    await boss.post(`/workspaces/${ws}/invitations`, { invitations: [{ email, role }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const person = new Client(server.base);
    await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    await person.post(`/workspaces/${ws}/switch`);
    return person;
  }
  it('admins manage, members deploy, viewers look, and there is no separate permission list', async () => {
    const { client, ws } = await admin();
    const sid = await readyServer(client);
    const { env } = await project(client);
    const service = (await client.post(`${D}/environments/${env.id}/services`, { kind: 'application', name: 'Web', serverId: sid, source: { type: 'docker', image: 'nginx:1.27' } })).body.service;
    const member = await join(client, ws, 'member');
    const viewer = await join(client, ws, 'viewer');
    assert.equal((await client.get(`${D}/me`)).body.level, 'manager');
    assert.equal((await member.get(`${D}/me`)).body.level, 'deployer');
    assert.equal((await viewer.get(`${D}/me`)).body.level, 'viewer');
    assert.equal((await viewer.get(`${D}/overview`)).status, 200);
    assert.equal((await viewer.post(`${D}/services/${service.id}/deploy`)).status, 403);
    assert.equal((await member.post(`${D}/services/${service.id}/deploy`)).status, 202);
    assert.equal((await member.post(`${D}/services/${service.id}/secrets`)).status, 403, 'secrets are for admins');
    assert.equal((await member.post(`${D}/servers`, { name: 'x', host: 'h.example.com', port: 22, username: 'root', sshKey: KEY })).status, 403);
    assert.equal((await client.get(`${D}/access`)).status, 404, 'no access list exists');
  });
});

