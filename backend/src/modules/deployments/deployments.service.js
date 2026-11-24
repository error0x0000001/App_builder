import crypto from 'node:crypto';
import { DATABASE_DEFAULTS, DATABASE_KINDS, DEPLOYMENT_STATUS, SERVICE_STATUS, appNameFor, branchSlug, cronMatches } from '@app/shared';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import * as cmd from './commands.js';

const LOG_CAP = 2_000_000;
const rand = (n = 4) => crypto.randomBytes(n).toString('hex').slice(0, n);
const jsonOf = (v) => JSON.stringify(v ?? {});
const SECRET_SOURCE_KEYS = { token: 'gitToken', registryPassword: 'registryPassword' };

/**
 * The Deployments engine: servers you connect over SSH, projects → environments → services (applications from an image or a Git repo,
 * Compose stacks, databases), their domains, deployments with logs, scheduled commands and backups. Everything runs on the customer's
 * own servers through a Runner; Quelli stores the desired state and the history. Secrets are encrypted at rest and never returned.
 */
export class DeploymentsService {
  constructor({ db, secretBox, repos, integrations, notifier, boss, queues, appUrl, runnerFactory, logger }) {
    Object.assign(this, { db, secretBox, repos, integrations, notifier, boss, queues, appUrl, runnerFactory, logger });
  }

  #q(rows) { return rows.rows ?? rows; }
  #enc(obj) { return this.secretBox.encrypt(JSON.stringify(obj ?? {})); }
  #dec(text) { return text ? JSON.parse(this.secretBox.decrypt(text)) : {}; }
  #audit(ctx, text) { return this.repos?.setupAudit?.record(ctx.workspaceId, ctx.userId, 'deployments', 'update', text); }

  // ---------- servers ----------
  #serverView(r) { return { id: r.id, name: r.name, kind: r.kind, host: r.host, port: r.port, username: r.username, status: r.status, statusMessage: r.status_message, dockerVersion: r.docker_version, readyAt: r.ready_at, hasKey: Boolean(r.ssh_key_enc), createdAt: r.created_at }; }
  async #server(ws, id) {
    const { rows } = await this.db.execute(sql`select * from dp_servers where workspace_id = ${ws} and id = ${id}::uuid`);
    if (!rows[0]) throw new NotFoundError('Server not found');
    return rows[0];
  }

  async listServers(ws) {
    const { rows } = await this.db.execute(sql`select s.*, (select count(*)::int from dp_services v where v.server_id = s.id) as services from dp_servers s where s.workspace_id = ${ws} order by s.created_at`);
    return rows.map((r) => ({ ...this.#serverView(r), services: r.services }));
  }

  async createServer(ctx, body) {
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_servers (id, workspace_id, name, kind, host, port, username, ssh_key_enc) values (${id}::uuid, ${ctx.workspaceId}, ${body.name}, 'ssh', ${body.host}, ${body.port}, ${body.username}, ${body.sshKey ? this.#enc({ key: body.sshKey }) : null})`);
    await this.#audit(ctx, `Added server “${body.name}”`);
    return this.#serverView(await this.#server(ctx.workspaceId, id));
  }

  /** The machine the API runs on, as a server. Only offered when the install allows it (DEPLOYMENTS_ALLOW_LOCAL). */
  async createLocalServer(ctx, name = 'This machine') {
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_servers (id, workspace_id, name, kind) values (${id}::uuid, ${ctx.workspaceId}, ${name}, 'local')`);
    return this.#serverView(await this.#server(ctx.workspaceId, id));
  }

  async updateServer(ctx, id, patch) {
    const cur = await this.#server(ctx.workspaceId, id);
    const next = { name: patch.name ?? cur.name, host: patch.host ?? cur.host, port: patch.port ?? cur.port, username: patch.username ?? cur.username };
    const changedTarget = next.host !== cur.host || next.port !== cur.port || next.username !== cur.username || patch.sshKey;
    await this.db.execute(sql`update dp_servers set name = ${next.name}, host = ${next.host}, port = ${next.port}, username = ${next.username}, ssh_key_enc = ${patch.sshKey ? this.#enc({ key: patch.sshKey }) : cur.ssh_key_enc},
      status = ${changedTarget ? 'untested' : cur.status}, host_key = ${changedTarget ? null : cur.host_key}, updated_at = now() where id = ${id}::uuid`);
    await this.#audit(ctx, `Updated server “${next.name}”`);
    return this.#serverView(await this.#server(ctx.workspaceId, id));
  }

  async deleteServer(ctx, id) {
    const cur = await this.#server(ctx.workspaceId, id);
    const used = this.#q(await this.db.execute(sql`select count(*)::int as n from dp_services where server_id = ${id}::uuid`))[0].n;
    if (used) throw new ConflictError(`${used} service${used === 1 ? '' : 's'} still run on this server. Move or delete them first.`);
    await this.db.execute(sql`delete from dp_servers where id = ${id}::uuid`);
    await this.#audit(ctx, `Removed server “${cur.name}”`);
  }

  #runnerFor(server) {
    const secret = server?.ssh_key_enc ? this.#dec(server.ssh_key_enc) : {};
    const runner = this.runnerFactory(server ? { ...server, privateKey: secret.key, hostKey: server.host_key, onHostKey: (fp) => this.db.execute(sql`update dp_servers set host_key = ${fp} where id = ${server.id}::uuid and host_key is null`) } : null);
    if (!runner) throw new ConflictError('This service has no server to run on. Choose one first.');
    return runner;
  }

  /** Connects and asks Docker for its version. Records the outcome. */
  async testServer(ctx, id) {
    const server = await this.#server(ctx.workspaceId, id);
    let status = 'error'; let message; let version = null;
    try {
      const { code, output } = await this.#runnerFor(server).run(cmd.probeCommand, { timeoutMs: 40_000 });
      if (code === 0 && /^\d/.test(output.trim())) { status = 'ready'; version = output.trim().split('\n')[0]; message = `Docker ${version} is running`; }
      else message = /command not found|not found/i.test(output) ? 'Connected, but Docker is not installed. Use “Set up server”.' : `Connected, but Docker did not answer: ${output.trim().slice(0, 160) || `exit ${code}`}`;
    } catch (e) { message = e.message.slice(0, 240); }
    await this.db.execute(sql`update dp_servers set status = ${status}, status_message = ${message}, docker_version = ${version}, ready_at = ${status === 'ready' ? sql`now()` : null}, updated_at = now() where id = ${id}::uuid`);
    return this.#serverView(await this.#server(ctx.workspaceId, id));
  }

  /** Queues the setup script (Docker, Swarm, network, Traefik) as a deployment with a log. */
  async setupServer(ctx, id, { acmeEmail }) {
    const server = await this.#server(ctx.workspaceId, id);
    const dep = await this.#createDeployment({ ctx, serverId: id, kind: 'setup', title: `Set up ${server.name}` });
    await this.boss.send(this.queues.DEPLOY, { deploymentId: dep.id, acmeEmail });
    await this.#audit(ctx, `Started setup of server “${server.name}”`);
    return dep;
  }

  async #readStats(server) {
    const { code, output } = await this.#runnerFor(server).run(cmd.serverStatsCommand, { timeoutMs: 30_000 });
    if (code !== 0) throw new ValidationError(undefined, 'Could not read the server’s statistics');
    const get = (k) => output.split('\n').find((l) => l.startsWith(`${k} `))?.split(' ').slice(1).map(Number) ?? [];
    const [cpu] = get('cpu'); const [memUsed, memTotal] = get('mem'); const [diskUsed, diskTotal] = get('disk');
    return { cpuPercent: Math.round(cpu ?? 0), memUsedMb: memUsed ?? 0, memTotalMb: memTotal ?? 0, diskUsedKb: diskUsed ?? 0, diskTotalKb: diskTotal ?? 0, uptime: output.split('\n').find((l) => l.startsWith('up ')) ?? '' };
  }

  async serverStats(ctx, id) { return this.#readStats(await this.#server(ctx.workspaceId, id)); }

  /** Samples every ready server (called each 5th minute by the tick) and keeps a week of history. */
  async sampleServers(at = new Date()) {
    const { rows } = await this.db.execute(sql`select * from dp_servers where status = 'ready'`);
    const stamp = new Date(Math.floor(at.getTime() / 300_000) * 300_000);
    let saved = 0;
    for (let i = 0; i < rows.length; i += 10) {
      const results = await Promise.allSettled(rows.slice(i, i + 10).map(async (server) => {
        const m = await this.#readStats(server);
        await this.db.execute(sql`insert into dp_server_metrics (server_id, at, cpu, mem_used_mb, mem_total_mb, disk_used_kb, disk_total_kb) values (${server.id}::uuid, ${stamp.toISOString()}, ${m.cpuPercent}, ${m.memUsedMb}, ${m.memTotalMb}, ${m.diskUsedKb}, ${m.diskTotalKb}) on conflict do nothing`);
      }));
      saved += results.filter((r) => r.status === 'fulfilled').length;
    }
    await this.db.execute(sql`delete from dp_server_metrics where at < now() - interval '7 days'`);
    return saved;
  }

  async serverMetrics(ws, id, hours = 24) {
    await this.#server(ws, id);
    const { rows } = await this.db.execute(sql`select at, cpu, mem_used_mb, mem_total_mb, disk_used_kb, disk_total_kb from dp_server_metrics where server_id = ${id}::uuid and at > now() - make_interval(hours => ${hours}) order by at`);
    return rows.map((r) => ({ at: r.at, cpu: r.cpu, memUsedMb: r.mem_used_mb, memTotalMb: r.mem_total_mb, diskUsedKb: Number(r.disk_used_kb), diskTotalKb: Number(r.disk_total_kb) }));
  }

  // ---------- Swarm cluster ----------
  #parseNodes(output) {
    return output.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
      .map((n) => ({ id: n.ID, hostname: n.Hostname, status: n.Status, availability: n.Availability, role: n.ManagerStatus ? 'manager' : 'worker', managerStatus: n.ManagerStatus || null, engine: n.EngineVersion, self: /\*$/.test(n.ID ?? '') || n.Self === true }));
  }

  async clusterNodes(ctx, serverId) {
    const server = await this.#server(ctx.workspaceId, serverId);
    const { code, output } = await this.#runnerFor(server).run(cmd.nodesCommand, { timeoutMs: 30_000 });
    if (code !== 0) throw new ValidationError(undefined, 'This server is not a Swarm manager. Run “Set up server” on it first.');
    return this.#parseNodes(output);
  }

  /** Makes `serverId` a node of the swarm run by `managerId`. */
  async joinCluster(ctx, serverId, { managerId, role = 'worker' }) {
    if (serverId === managerId) throw new ValidationError(undefined, 'Choose a different server as the manager.');
    const worker = await this.#server(ctx.workspaceId, serverId); const manager = await this.#server(ctx.workspaceId, managerId);
    if (!manager.host) throw new ValidationError(undefined, 'The manager needs a public address.');
    const { rows: [used] } = await this.db.execute(sql`select count(*)::int as n from dp_services where server_id = ${serverId}::uuid`);
    if (used.n > 0) throw new ConflictError('Services still run on this server’s own swarm. Move or delete them before joining it to another cluster.');
    const { code, output } = await this.#runnerFor(manager).run(cmd.joinTokenCommand(role), { timeoutMs: 30_000 });
    const token = output.trim().split('\n').pop();
    if (code !== 0 || !token) throw new ValidationError(undefined, 'The manager did not give a join token. Is it a Swarm manager?');
    const joined = await this.#runnerFor(worker).run(cmd.joinCommand({ token, managerHost: manager.host }), { timeoutMs: 60_000 });
    if (joined.code !== 0) throw new ValidationError(undefined, `Could not join: ${cmd.redact(joined.output, [token]).trim().slice(-200)}`);
    await this.#audit(ctx, `Joined “${worker.name}” to the cluster of “${manager.name}” as a ${role}`);
    return this.clusterNodes(ctx, managerId);
  }

  async nodeAction(ctx, serverId, nodeId, action) {
    const server = await this.#server(ctx.workspaceId, serverId);
    let command; try { command = cmd.nodeActionCommand(nodeId, action); } catch (e) { throw new ValidationError(undefined, e.message); }
    const { code, output } = await this.#runnerFor(server).run(command, { timeoutMs: 60_000 });
    if (code !== 0) throw new ValidationError(undefined, output.trim().slice(-200) || 'The cluster refused that.');
    await this.#audit(ctx, `Cluster node ${action}: ${server.name}`);
    return this.clusterNodes(ctx, serverId);
  }

  // ---------- projects and environments ----------
  async listProjects(ws) {
    const { rows } = await this.db.execute(sql`
      select p.id, p.name, p.description, p.created_at,
        (select count(*)::int from dp_environments e where e.project_id = p.id) as environments,
        coalesce(jsonb_object_agg(s.status, s.n) filter (where s.status is not null), '{}'::jsonb) as statuses,
        coalesce(sum(s.n), 0)::int as services
      from dp_projects p
      left join (select e.project_id, v.status, count(*)::int as n from dp_services v join dp_environments e on e.id = v.environment_id where v.workspace_id = ${ws} group by e.project_id, v.status) s on s.project_id = p.id
      where p.workspace_id = ${ws} group by p.id order by p.created_at`);
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, environments: r.environments, services: r.services, statuses: r.statuses, createdAt: r.created_at }));
  }

  async createProject(ctx, { name, description }) {
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_projects (id, workspace_id, name, description) values (${id}::uuid, ${ctx.workspaceId}, ${name}, ${description ?? null})`);
    await this.db.execute(sql`insert into dp_environments (id, workspace_id, project_id, name) values (${uuidv7()}::uuid, ${ctx.workspaceId}, ${id}::uuid, 'production')`);
    await this.#audit(ctx, `Created project “${name}”`);
    return this.getProject(ctx.workspaceId, id);
  }

  async getProject(ws, id) {
    const { rows: [project] } = await this.db.execute(sql`select * from dp_projects where workspace_id = ${ws} and id = ${id}::uuid`);
    if (!project) throw new NotFoundError('Project not found');
    const envs = (await this.db.execute(sql`select id, name, (env_enc is not null) as has_env from dp_environments where project_id = ${id}::uuid order by created_at`)).rows;
    const services = (await this.db.execute(sql`
      select v.id, v.environment_id, v.kind, v.name, v.app_name, v.status, v.server_id, v.last_deployed_at, v.preview_branch,
        coalesce((select jsonb_agg(d.host order by d.created_at) from dp_domains d where d.service_id = v.id), '[]'::jsonb) as domains
      from dp_services v join dp_environments e on e.id = v.environment_id where e.project_id = ${id}::uuid order by v.created_at`)).rows;
    return {
      id: project.id, name: project.name, description: project.description,
      environments: envs.map((e) => ({ id: e.id, name: e.name, hasEnv: e.has_env, services: services.filter((s) => s.environment_id === e.id).map((s) => ({ id: s.id, kind: s.kind, name: s.name, appName: s.app_name, status: s.status, serverId: s.server_id, lastDeployedAt: s.last_deployed_at, previewBranch: s.preview_branch, domains: s.domains })) })),
    };
  }

  async deleteProject(ctx, id) {
    const p = await this.getProject(ctx.workspaceId, id);
    const running = p.environments.flatMap((e) => e.services);
    if (running.length) throw new ConflictError('Delete the project’s services first.');
    await this.db.execute(sql`delete from dp_projects where id = ${id}::uuid`);
    await this.#audit(ctx, `Deleted project “${p.name}”`);
  }

  async createEnvironment(ctx, projectId, { name }) {
    await this.getProject(ctx.workspaceId, projectId);
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_environments (id, workspace_id, project_id, name) values (${id}::uuid, ${ctx.workspaceId}, ${projectId}::uuid, ${name})`);
    return { id, name };
  }

  async #environment(ws, id) {
    const { rows: [e] } = await this.db.execute(sql`select * from dp_environments where workspace_id = ${ws} and id = ${id}::uuid`);
    if (!e) throw new NotFoundError('Environment not found');
    return e;
  }

  async setEnvironmentEnv(ctx, id, env) {
    await this.#environment(ctx.workspaceId, id);
    await this.db.execute(sql`update dp_environments set env_enc = ${env.trim() ? this.#enc({ env }) : null} where id = ${id}::uuid`);
    await this.#audit(ctx, 'Changed shared environment variables');
  }

  async getEnvironmentEnv(ws, id) { return { env: this.#dec((await this.#environment(ws, id)).env_enc).env ?? '' }; }

  async deleteEnvironment(ctx, id) {
    const e = await this.#environment(ctx.workspaceId, id);
    const n = this.#q(await this.db.execute(sql`select count(*)::int as n from dp_services where environment_id = ${id}::uuid`))[0].n;
    if (n) throw new ConflictError('Delete the environment’s services first.');
    await this.db.execute(sql`delete from dp_environments where id = ${id}::uuid`);
    await this.#audit(ctx, `Deleted environment “${e.name}”`);
  }

  // ---------- services ----------
  async #service(ws, id) {
    const { rows: [s] } = await this.db.execute(sql`select * from dp_services where workspace_id = ${ws} and id = ${id}::uuid`);
    if (!s) throw new NotFoundError('Service not found');
    return s;
  }

  async #serviceView(s) {
    const [domains, jobs] = await Promise.all([
      this.db.execute(sql`select id, host, path, port, https from dp_domains where service_id = ${s.id}::uuid order by created_at`),
      this.db.execute(sql`select id, kind, name, cron, command, keep, enabled, last_run_at from dp_jobs where service_id = ${s.id}::uuid order by created_at`),
    ]);
    const secrets = this.#dec(s.secrets_enc);
    return {
      id: s.id, environmentId: s.environment_id, serverId: s.server_id, kind: s.kind, name: s.name, appName: s.app_name, status: s.status,
      source: s.source, config: s.config, autoDeploy: s.auto_deploy, lastDeployedAt: s.last_deployed_at, createdAt: s.created_at,
      hasGitToken: Boolean(secrets.gitToken), hasRegistryPassword: Boolean(secrets.registryPassword), hasEnv: Boolean(s.env_enc),
      previewOf: s.preview_of, previewBranch: s.preview_branch,
      webhookPath: `/api/v1/deployments/hooks/${s.id}`,
      domains: domains.rows.map((d) => ({ id: d.id, host: d.host, path: d.path, port: d.port, https: d.https, url: `${d.https ? 'https' : 'http'}://${d.host}${d.path === '/' ? '' : d.path}` })),
      jobs: jobs.rows.map((j) => ({ id: j.id, kind: j.kind, name: j.name, cron: j.cron, command: j.command, keep: j.keep, enabled: j.enabled, lastRunAt: j.last_run_at })),
    };
  }

  async getService(ws, id) { return this.#serviceView(await this.#service(ws, id)); }

  async #checkCredential(ws, source) {
    if (!source?.credentialId) return;
    const { rows: [c] } = await this.db.execute(sql`select kind from dp_credentials where id = ${source.credentialId}::uuid and workspace_id = ${ws}`);
    if (!c || c.kind !== (source.type === 'git' ? 'git' : 'registry')) throw new ValidationError(undefined, 'Choose one of your saved credentials of the right kind.');
  }

  #splitSecrets(source) {
    const clean = { ...source }; const secrets = {};
    for (const [field, key] of Object.entries(SECRET_SOURCE_KEYS)) { if (clean[field]) secrets[key] = clean[field]; delete clean[field]; }
    return { clean, secrets };
  }

  async createService(ctx, environmentId, body) {
    await this.#environment(ctx.workspaceId, environmentId);
    if (body.serverId) await this.#server(ctx.workspaceId, body.serverId);
    const id = uuidv7(); const appName = appNameFor(body.name, rand(4));
    await this.#checkCredential(ctx.workspaceId, body.source);
    const { clean, secrets } = this.#splitSecrets(body.source ?? {});
    const config = { replicas: 1, volumes: [], publishedPorts: [], ...(body.config ?? {}) };
    if (DATABASE_KINDS.includes(body.kind)) {
      secrets.dbPassword = config.database?.password ?? crypto.randomBytes(18).toString('base64url');
      config.database = { name: config.database?.name ?? 'app', user: config.database?.user ?? 'app' };
      const d = DATABASE_DEFAULTS[body.kind];
      config.port = d.port; config.volumes = [{ name: 'data', path: d.dataDir }];
      clean.type = 'docker'; clean.image = d.image;
    }
    await this.db.execute(sql`insert into dp_services (id, workspace_id, environment_id, server_id, kind, name, app_name, source, config, secrets_enc, auto_deploy, webhook_secret, created_by)
      values (${id}::uuid, ${ctx.workspaceId}, ${environmentId}::uuid, ${body.serverId ?? null}, ${body.kind}, ${body.name}, ${appName}, ${jsonOf(clean)}::jsonb, ${jsonOf(config)}::jsonb, ${this.#enc(secrets)}, ${body.autoDeploy ?? true}, ${crypto.randomBytes(24).toString('base64url')}, ${ctx.userId})`);
    await this.#audit(ctx, `Created ${body.kind} “${body.name}”`);
    return this.getService(ctx.workspaceId, id);
  }

  async updateService(ctx, id, patch) {
    const cur = await this.#service(ctx.workspaceId, id);
    if (patch.serverId) await this.#server(ctx.workspaceId, patch.serverId);
    const secrets = this.#dec(cur.secrets_enc);
    let source = cur.source;
    if (patch.source) {
      if (cur.kind !== 'application') throw new ValidationError(undefined, 'Only applications have a source');
      await this.#checkCredential(ctx.workspaceId, patch.source);
      const split = this.#splitSecrets(patch.source);
      source = split.clean; Object.assign(secrets, split.secrets);
      if (patch.source.type === 'git' && !patch.source.token && source.type === 'git') { /* keep the stored token */ }
    }
    const config = patch.config ? { ...cur.config, ...patch.config } : cur.config;
    await this.db.execute(sql`update dp_services set name = ${patch.name ?? cur.name}, server_id = ${patch.serverId === undefined ? cur.server_id : patch.serverId}, source = ${jsonOf(source)}::jsonb, config = ${jsonOf(config)}::jsonb,
      secrets_enc = ${this.#enc(secrets)}, auto_deploy = ${patch.autoDeploy ?? cur.auto_deploy}, updated_at = now() where id = ${id}::uuid`);
    await this.#audit(ctx, `Updated “${cur.name}”`);
    return this.getService(ctx.workspaceId, id);
  }

  async setServiceEnv(ctx, id, env) {
    const cur = await this.#service(ctx.workspaceId, id);
    await this.db.execute(sql`update dp_services set env_enc = ${env.trim() ? this.#enc({ env }) : null}, updated_at = now() where id = ${id}::uuid`);
    await this.#audit(ctx, `Changed environment variables of “${cur.name}”`);
  }

  /** The only place a secret is read back: explicit, and audited. */
  async revealSecrets(ctx, id) {
    const s = await this.#service(ctx.workspaceId, id);
    const secrets = this.#dec(s.secrets_enc);
    await this.#audit(ctx, `Viewed secrets of “${s.name}”`);
    const out = { env: this.#dec(s.env_enc).env ?? '', webhookSecret: s.webhook_secret };
    if (secrets.dbPassword) { out.databasePassword = secrets.dbPassword; out.connectionUrl = cmd.databaseSpec(s.kind, s.app_name, { ...s.config.database, password: secrets.dbPassword }).internalUrl; }
    return out;
  }

  async deleteService(ctx, id) {
    const s = await this.#service(ctx.workspaceId, id);
    const { rows: previews } = await this.db.execute(sql`select id from dp_services where preview_of = ${id}::uuid`);
    for (const p of previews) await this.deleteService(ctx, p.id);
    const server = s.server_id ? await this.#server(ctx.workspaceId, s.server_id) : null;
    let note = null;
    try {
      const runner = this.#runnerFor(server);
      await runner.run(s.kind === 'compose' ? cmd.composeDownCommand(s.app_name) : cmd.removeCommand(s.app_name), { timeoutMs: 120_000 });
    } catch (e) { note = `Removed from Quelli, but the server could not be reached to stop it: ${e.message}`; }
    await this.db.execute(sql`delete from dp_services where id = ${id}::uuid`);
    await this.#audit(ctx, `Deleted “${s.name}”`);
    return { note };
  }

  // ---------- access (who may use Deployments) ----------
  /** Owners and admins are managers; anyone else has a level only if one was granted. */
  async levelFor(ctx) {
    if (ctx.role === 'owner' || ctx.role === 'admin') return 'manager';
    const { rows: [r] } = await this.db.execute(sql`select level from dp_access where workspace_id = ${ctx.workspaceId} and user_id = ${ctx.userId}`);
    return r?.level ?? null;
  }

  async listAccess(ws) {
    const { rows } = await this.db.execute(sql`select a.user_id, a.level, a.created_at, u.email, coalesce(nullif(trim(concat(u.first_name, ' ', u.last_name)), ''), u.email) as name from dp_access a join users u on u.id = a.user_id where a.workspace_id = ${ws} order by u.email`);
    return rows.map((r) => ({ userId: r.user_id, level: r.level, name: r.name, email: r.email, grantedAt: r.created_at }));
  }

  async setAccess(ctx, { userId, level }) {
    const { rows: [m] } = await this.db.execute(sql`select role from memberships where workspace_id = ${ctx.workspaceId} and user_id = ${userId}::uuid`);
    if (!m) throw new NotFoundError('That person is not in this workspace');
    if (m.role === 'owner' || m.role === 'admin') throw new ValidationError(undefined, 'Owners and admins already have full access.');
    await this.db.execute(sql`insert into dp_access (workspace_id, user_id, level, granted_by) values (${ctx.workspaceId}, ${userId}::uuid, ${level}, ${ctx.userId}) on conflict (workspace_id, user_id) do update set level = excluded.level`);
    await this.#audit(ctx, `Gave a member ${level} access to Deployments`);
    return this.listAccess(ctx.workspaceId);
  }

  async removeAccess(ctx, userId) {
    await this.db.execute(sql`delete from dp_access where workspace_id = ${ctx.workspaceId} and user_id = ${userId}::uuid`);
    await this.#audit(ctx, 'Removed a member’s Deployments access');
    return this.listAccess(ctx.workspaceId);
  }

  // ---------- saved credentials (registries, Git tokens) ----------
  async listCredentials(ws) {
    const { rows } = await this.db.execute(sql`select id, kind, name, url, username, created_at from dp_credentials where workspace_id = ${ws} order by kind, name`);
    return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name, url: r.url, username: r.username, createdAt: r.created_at }));
  }

  async createCredential(ctx, body) {
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_credentials (id, workspace_id, kind, name, url, username, secret_enc) values (${id}::uuid, ${ctx.workspaceId}, ${body.kind}, ${body.name}, ${body.url || null}, ${body.username || null}, ${this.#enc({ secret: body.secret })})`);
    await this.#audit(ctx, `Saved ${body.kind === 'git' ? 'Git' : 'registry'} credential “${body.name}”`);
    return (await this.listCredentials(ctx.workspaceId)).find((c) => c.id === id);
  }

  async deleteCredential(ctx, id) {
    const { rows: [used] } = await this.db.execute(sql`select count(*)::int as n from dp_services where workspace_id = ${ctx.workspaceId} and source->>'credentialId' = ${id}`);
    if (used.n > 0) throw new ConflictError(`${used.n} service${used.n === 1 ? ' uses' : 's use'} this credential. Switch them to another one first.`);
    const { rowCount } = await this.db.execute(sql`delete from dp_credentials where id = ${id}::uuid and workspace_id = ${ctx.workspaceId}`);
    if (!rowCount) throw new NotFoundError('Credential not found');
    await this.#audit(ctx, 'Deleted a saved credential');
    return this.listCredentials(ctx.workspaceId);
  }

  // ---------- domains ----------
  async addDomain(ctx, serviceId, body) {
    const s = await this.#service(ctx.workspaceId, serviceId);
    if (s.kind === 'compose') throw new ValidationError(undefined, 'Add domains to Compose stacks with Traefik labels in the Compose file.');
    if (DATABASE_KINDS.includes(s.kind)) throw new ValidationError(undefined, 'Databases are not published on a domain.');
    try {
      await this.db.execute(sql`insert into dp_domains (id, workspace_id, service_id, host, path, port, https) values (${uuidv7()}::uuid, ${ctx.workspaceId}, ${serviceId}::uuid, ${body.host}, ${body.path}, ${body.port}, ${body.https})`);
    } catch (e) { if (e.code === '23505') throw new ConflictError('That domain and path is already used by a service in this workspace.'); throw e; }
    await this.#audit(ctx, `Added domain ${body.host} to “${s.name}”`);
    return this.#reapply(ctx, s, `Domain ${body.host} added`);
  }

  async removeDomain(ctx, serviceId, domainId) {
    const s = await this.#service(ctx.workspaceId, serviceId);
    const { rowCount } = await this.db.execute(sql`delete from dp_domains where id = ${domainId}::uuid and service_id = ${serviceId}::uuid`);
    if (!rowCount) throw new NotFoundError('Domain not found');
    await this.#audit(ctx, `Removed a domain from “${s.name}”`);
    return this.#reapply(ctx, s, 'Domain removed');
  }

  /** A routing change on a service that is live is applied right away, without rebuilding. */
  async #reapply(ctx, s, title) {
    const live = s.status !== SERVICE_STATUS.IDLE && s.last_deployed_at;
    return { service: await this.getService(ctx.workspaceId, s.id), deployment: live ? await this.deploy(ctx, s.id, { mode: 'apply', title }) : null };
  }

  // ---------- deployments ----------
  async #createDeployment({ ctx, service, serverId, kind = 'deploy', title }) {
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_deployments (id, workspace_id, service_id, server_id, kind, title, created_by) values (${id}::uuid, ${ctx.workspaceId}, ${service?.id ?? null}, ${serverId ?? service?.server_id ?? null}, ${kind}, ${title}, ${ctx.userId ?? null})`);
    return { id, kind, title, status: DEPLOYMENT_STATUS.RUNNING };
  }

  /** mode: 'full' (pull or build, then apply), 'apply' (re-apply the last image: routing, env, resources), 'rollback' (older image). */
  async deploy(ctx, serviceId, { mode = 'full', title, image } = {}) {
    const s = await this.#service(ctx.workspaceId, serviceId);
    if (s.kind === 'application' && !s.source?.type) throw new ValidationError(undefined, 'Choose a source for this application first.');
    if (s.server_id) { const srv = await this.#server(ctx.workspaceId, s.server_id); if (srv.status !== 'ready') throw new ConflictError('Test the server successfully before deploying to it.'); }
    else if (!this.runnerFactory(null)) throw new ConflictError('Choose a server to deploy to.');
    const dep = await this.#createDeployment({ ctx, service: s, title: title ?? (mode === 'rollback' ? 'Rollback' : mode === 'apply' ? 'Apply changes' : 'Manual deployment') });
    await this.db.execute(sql`update dp_services set status = 'running', updated_at = now() where id = ${serviceId}::uuid`);
    await this.boss.send(this.queues.DEPLOY, { deploymentId: dep.id, mode, image });
    await this.#audit(ctx, `${dep.title}: “${s.name}”`);
    return dep;
  }

  async rollback(ctx, serviceId, deploymentId) {
    const { rows: [d] } = await this.db.execute(sql`select image, status from dp_deployments where id = ${deploymentId}::uuid and service_id = ${serviceId}::uuid and workspace_id = ${ctx.workspaceId}`);
    if (!d) throw new NotFoundError('Deployment not found');
    if (d.status !== DEPLOYMENT_STATUS.DONE || !d.image) throw new ConflictError('Only a deployment that finished successfully can be rolled back to.');
    return this.deploy(ctx, serviceId, { mode: 'rollback', image: d.image, title: `Rollback to ${d.image.split(':').pop().slice(0, 8)}` });
  }

  async stop(ctx, id) {
    const s = await this.#service(ctx.workspaceId, id);
    const server = s.server_id ? await this.#server(ctx.workspaceId, s.server_id) : null;
    const { code, output } = await this.#runnerFor(server).run(s.kind === 'compose' ? `docker compose -p ${cmd.q(s.app_name)} stop` : cmd.scaleCommand(s.app_name, 0), { timeoutMs: 60_000 });
    if (code !== 0) throw new ValidationError(undefined, `Could not stop it: ${output.trim().slice(0, 200)}`);
    await this.db.execute(sql`update dp_services set status = 'stopped', updated_at = now() where id = ${id}::uuid`);
    await this.#audit(ctx, `Stopped “${s.name}”`);
    return this.getService(ctx.workspaceId, id);
  }

  async start(ctx, id) {
    const s = await this.#service(ctx.workspaceId, id);
    const server = s.server_id ? await this.#server(ctx.workspaceId, s.server_id) : null;
    const { code, output } = await this.#runnerFor(server).run(s.kind === 'compose' ? `docker compose -p ${cmd.q(s.app_name)} start` : cmd.scaleCommand(s.app_name, s.config.replicas ?? 1), { timeoutMs: 60_000 });
    if (code !== 0) throw new ValidationError(undefined, `Could not start it: ${output.trim().slice(0, 200)}`);
    await this.db.execute(sql`update dp_services set status = 'done', updated_at = now() where id = ${id}::uuid`);
    await this.#audit(ctx, `Started “${s.name}”`);
    return this.getService(ctx.workspaceId, id);
  }

  async listDeployments(ws, serviceId, { limit = 30 } = {}) {
    const { rows } = await this.db.execute(sql`select id, kind, title, status, image, commit, started_at, finished_at, length(log) as log_bytes from dp_deployments where workspace_id = ${ws} and service_id = ${serviceId}::uuid order by id desc limit ${limit}`);
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, image: r.image, commit: r.commit, startedAt: r.started_at, finishedAt: r.finished_at, logBytes: r.log_bytes }));
  }

  async listRecentDeployments(ws, { limit = 20 } = {}) {
    const { rows } = await this.db.execute(sql`select d.id, d.kind, d.title, d.status, d.started_at, d.finished_at, d.service_id, v.name as service_name from dp_deployments d left join dp_services v on v.id = d.service_id where d.workspace_id = ${ws} order by d.id desc limit ${limit}`);
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, status: r.status, serviceId: r.service_id, serviceName: r.service_name, startedAt: r.started_at, finishedAt: r.finished_at }));
  }

  /** The log from byte `from` on, so a screen can poll cheaply while a deployment runs. */
  async getDeployment(ws, id, { from = 0 } = {}) {
    const { rows: [d] } = await this.db.execute(sql`select id, kind, title, status, image, commit, service_id, started_at, finished_at, substr(log, ${Number(from) + 1}) as log, length(log) as log_bytes from dp_deployments where id = ${id}::uuid and workspace_id = ${ws}`);
    if (!d) throw new NotFoundError('Deployment not found');
    return { id: d.id, kind: d.kind, title: d.title, status: d.status, image: d.image, commit: d.commit, serviceId: d.service_id, startedAt: d.started_at, finishedAt: d.finished_at, log: d.log, logBytes: d.log_bytes };
  }

  async serviceLogs(ws, id, tail = 300) {
    const s = await this.#service(ws, id);
    const server = s.server_id ? await this.#server(ws, s.server_id) : null;
    const { output } = await this.#runnerFor(server).run(cmd.logsCommand(s.app_name, tail), { timeoutMs: 30_000 });
    return { log: output };
  }

  async serviceStats(ws, id) {
    const s = await this.#service(ws, id);
    const server = s.server_id ? await this.#server(ws, s.server_id) : null;
    const { output } = await this.#runnerFor(server).run(cmd.statsCommand(s.app_name), { timeoutMs: 30_000 });
    return output.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
      .map((r) => ({ name: r.Name, cpu: r.CPUPerc, memory: r.MemUsage, memoryPercent: r.MemPerc, network: r.NetIO, disk: r.BlockIO }));
  }

  /** Reads what Swarm says and corrects the stored status (a crashed container turns an "ok" service to "error"). */
  async refreshStatus(ctx, id) {
    const s = await this.#service(ctx.workspaceId, id);
    if (s.status === SERVICE_STATUS.IDLE || s.status === SERVICE_STATUS.STOPPED) return this.getService(ctx.workspaceId, id);
    const server = s.server_id ? await this.#server(ctx.workspaceId, s.server_id) : null;
    const { output } = await this.#runnerFor(server).run(cmd.statusCommand(s.app_name), { timeoutMs: 20_000 });
    const first = output.split('\n')[0] ?? '';
    const next = first.startsWith('Running') ? SERVICE_STATUS.DONE : /Failed|Rejected|Shutdown/.test(first) ? SERVICE_STATUS.ERROR : s.status;
    if (next !== s.status) await this.db.execute(sql`update dp_services set status = ${next}, updated_at = now() where id = ${id}::uuid`);
    return this.getService(ctx.workspaceId, id);
  }

  // ---------- running a deployment (worker) ----------
  async #append(id, text) {
    if (!text) return;
    await this.db.execute(sql`update dp_deployments set log = left(log || ${text}, ${LOG_CAP}) where id = ${id}::uuid`);
  }

  async #finish(id, status, patch = {}) {
    await this.db.execute(sql`update dp_deployments set status = ${status}, finished_at = now(), image = coalesce(${patch.image ?? null}, image), commit = coalesce(${patch.commit ?? null}, commit) where id = ${id}::uuid`);
  }

  /** One queued job: a server setup, or a service deployment. Writes its log as it goes; never throws (the outcome is the deployment's status). */
  async run({ deploymentId, mode = 'full', image, acmeEmail }) {
    const { rows: [dep] } = await this.db.execute(sql`select * from dp_deployments where id = ${deploymentId}::uuid`);
    if (!dep || dep.status !== DEPLOYMENT_STATUS.RUNNING) return;
    const svc = dep.service_id ? (await this.db.execute(sql`select * from dp_services where id = ${dep.service_id}::uuid`)).rows[0] : null;
    const serverId = svc?.server_id ?? dep.server_id;
    const server = serverId ? (await this.db.execute(sql`select * from dp_servers where id = ${serverId}::uuid`)).rows[0] : null;
    const secrets = svc ? this.#dec(svc.secrets_enc) : {};
    if (svc?.source?.credentialId) {
      const { rows: [c] } = await this.db.execute(sql`select kind, url, username, secret_enc from dp_credentials where id = ${svc.source.credentialId}::uuid and workspace_id = ${svc.workspace_id}`);
      if (c) { const secret = this.#dec(c.secret_enc).secret; if (c.kind === 'git') secrets.gitToken = secret; else Object.assign(secrets, { registryPassword: secret, registryUser: c.username, registryUrl: c.url }); }
    }
    const hidden = [secrets.gitToken, secrets.gitToken && Buffer.from(`x-access-token:${secrets.gitToken}`).toString('base64'), secrets.registryPassword, secrets.dbPassword, ...Object.values(svc ? cmd.parseEnv(this.#dec(svc.env_enc).env) : {})];
    let buffer = ''; let chain = Promise.resolve();
    const flush = () => { const text = cmd.redact(buffer, hidden); buffer = ''; chain = chain.then(() => this.#append(deploymentId, text)).catch(() => {}); return chain; };
    const timer = setInterval(flush, 800);
    const emit = (text) => { buffer += text; if (buffer.length > 4000) flush(); };
    const step = async (label, command, opts = {}) => {
      emit(`\n▶ ${label}\n`);
      const r = await this.#runnerFor(server).run(command, { onData: emit, timeoutMs: opts.timeoutMs });
      if (r.code !== 0 && !opts.allowFail) throw new Error(`${label} failed (exit ${r.code})`);
      return r;
    };
    const result = {};
    try {
      if (!server && !this.runnerFactory(null)) throw new Error('This service has no server.');
      if (dep.kind === 'setup') {
        await step('Setting up the server', cmd.serverSetupScript({ acmeEmail }), { timeoutMs: 20 * 60_000 });
        await this.db.execute(sql`update dp_servers set status = 'ready', status_message = 'Docker, Swarm and Traefik are ready', ready_at = now() where id = ${serverId}::uuid`);
      } else {
        await this.#deployService({ dep, svc, server, secrets, mode, image, step, emit, result });
      }
      await flush(); clearInterval(timer);
      await this.#finish(deploymentId, DEPLOYMENT_STATUS.DONE, result);
      if (svc) await this.db.execute(sql`update dp_services set status = 'done', last_deployed_at = now(), updated_at = now() where id = ${svc.id}::uuid`);
      if (svc && dep.kind === 'deploy') await this.#notify(svc, true, dep.title);
    } catch (error) {
      clearInterval(timer); emit(`\n✖ ${error.message}\n`); await flush();
      await this.#finish(deploymentId, DEPLOYMENT_STATUS.ERROR, result);
      if (dep.kind === 'setup') await this.db.execute(sql`update dp_servers set status = 'error', status_message = ${error.message.slice(0, 240)} where id = ${serverId}::uuid`);
      if (svc) await this.db.execute(sql`update dp_services set status = 'error', updated_at = now() where id = ${svc.id}::uuid`);
      if (svc && dep.kind === 'deploy') await this.#notify(svc, false, dep.title, error.message);
    }
  }

  async #deployService({ dep, svc, server, secrets, mode, image, step, emit, result }) {
    // wait for an earlier deployment of the same service so two never touch the stack at once
    for (let i = 0; i < 400; i += 1) {
      const { rows } = await this.db.execute(sql`select 1 from dp_deployments where service_id = ${svc.id}::uuid and status = 'running' and id < ${dep.id}::uuid and kind = 'deploy' limit 1`);
      if (!rows.length) break;
      if (i === 0) emit('Waiting for the previous deployment to finish…\n');
      await new Promise((r) => setTimeout(r, 1500));
    }
    const source = svc.source ?? {}; const cfg = svc.config ?? {};
    const sharedEnv = this.#dec((await this.db.execute(sql`select env_enc from dp_environments where id = ${svc.environment_id}::uuid`)).rows[0]?.env_enc).env;
    const env = { ...cmd.parseEnv(sharedEnv), ...cmd.parseEnv(this.#dec(svc.env_enc).env) };
    const domains = (await this.db.execute(sql`select host, path, port, https from dp_domains where service_id = ${svc.id}::uuid order by created_at`)).rows;
    for (const d of domains) if (!d.port) d.port = cfg.port ?? 80;

    if (svc.kind === 'compose') {
      await step('Starting the Compose stack', cmd.composeUpCommand(svc.app_name, cfg.composeFile, env), { timeoutMs: 20 * 60_000 });
      return;
    }
    let img = image;
    if (DATABASE_KINDS.includes(svc.kind)) {
      const spec = cmd.databaseSpec(svc.kind, svc.app_name, { ...cfg.database, password: secrets.dbPassword });
      Object.assign(env, spec.env);
      img = source.image ?? spec.image;
      if (mode === 'full') await step(`Pulling ${img}`, cmd.pullCommand({ image: img }), { timeoutMs: 15 * 60_000 });
      await step('Applying the stack', cmd.applyStackCommand(svc.app_name, cmd.stackDocument({ appName: svc.app_name, image: img, env, replicas: 1, volumes: cfg.volumes, publishedPorts: cfg.publishedPorts, command: spec.command, memoryLimitMb: cfg.memoryLimitMb, cpuLimit: cfg.cpuLimit })));
      await step('Waiting for it to start', cmd.waitCommand(svc.app_name, 180), { timeoutMs: 200_000 });
      result.image = img;
      return;
    }
    if (mode === 'apply') {
      const { rows: [last] } = await this.db.execute(sql`select image from dp_deployments where service_id = ${svc.id}::uuid and status = 'done' and image is not null order by id desc limit 1`);
      img = last?.image ?? (source.type === 'docker' ? source.image : null);
      if (!img) throw new Error('Nothing has been deployed yet, so there is nothing to re-apply. Deploy first.');
    } else if (mode === 'rollback') {
      if (!img) throw new Error('No image to roll back to.');
    } else if (source.type === 'docker') {
      img = source.image;
      await step(`Pulling ${img}`, cmd.pullCommand({ image: img, registryUser: source.registryUser ?? secrets.registryUser, registryPassword: secrets.registryPassword, registryUrl: source.registryUrl ?? secrets.registryUrl }), { timeoutMs: 15 * 60_000 });
    } else if (source.type === 'git') {
      const cloned = await step(`Cloning ${source.repository} (${source.branch})`, cmd.cloneCommand({ ...source, token: secrets.gitToken }, svc.app_name), { timeoutMs: 10 * 60_000 });
      result.commit = cloned.output.trim().split('\n').pop()?.slice(0, 40);
      const tag = dep.id.replace(/-/g, '').slice(-12);
      await step(`Building (${source.buildType})`, cmd.buildCommand(source, svc.app_name, tag, env), { timeoutMs: 40 * 60_000 });
      img = `${svc.app_name}:${tag}`;
    }
    result.image = img;
    if (mode === 'rollback') await step(`Rolling back to ${img}`, cmd.rollbackCommand(svc.app_name, img), { timeoutMs: 120_000 });
    else await step('Applying the stack', cmd.applyStackCommand(svc.app_name, cmd.stackDocument({ appName: svc.app_name, image: img, env, replicas: cfg.replicas ?? 1, domains, volumes: cfg.volumes, publishedPorts: cfg.publishedPorts, command: cfg.command, healthCheck: cfg.healthCheck, memoryLimitMb: cfg.memoryLimitMb, cpuLimit: cfg.cpuLimit })));
    await step('Waiting for it to start', cmd.waitCommand(svc.app_name, 180), { timeoutMs: 200_000 });
  }

  async #notify(svc, ok, title, error) {
    try {
      await this.notifier?.post(svc.workspace_id, { kind: 'deploys', title: `${ok ? 'Deployed' : 'Deployment failed'}: ${svc.name}`, text: ok ? `${title} finished.` : `${title} failed: ${String(error).slice(0, 300)}`, link: `${this.appUrl}/app/deployments/s/${svc.id}` });
    } catch (e) { this.logger?.warn({ err: e.message }, 'deployment notification failed'); }
  }

  // ---------- scheduled jobs ----------
  async addJob(ctx, serviceId, body) {
    const s = await this.#service(ctx.workspaceId, serviceId);
    if (body.kind === 'backup' && !DATABASE_KINDS.includes(s.kind)) throw new ValidationError(undefined, 'Backups are for databases.');
    const id = uuidv7();
    await this.db.execute(sql`insert into dp_jobs (id, workspace_id, service_id, kind, name, cron, command, keep, enabled) values (${id}::uuid, ${ctx.workspaceId}, ${serviceId}::uuid, ${body.kind}, ${body.name}, ${body.cron}, ${body.command ?? null}, ${body.keep}, ${body.enabled})`);
    await this.#audit(ctx, `Scheduled “${body.name}” on “${s.name}”`);
    return (await this.getService(ctx.workspaceId, serviceId)).jobs;
  }

  async updateJob(ctx, serviceId, jobId, patch) {
    const { rows: [j] } = await this.db.execute(sql`select * from dp_jobs where id = ${jobId}::uuid and service_id = ${serviceId}::uuid and workspace_id = ${ctx.workspaceId}`);
    if (!j) throw new NotFoundError('Job not found');
    await this.db.execute(sql`update dp_jobs set name = ${patch.name ?? j.name}, cron = ${patch.cron ?? j.cron}, command = ${patch.command ?? j.command}, keep = ${patch.keep ?? j.keep}, enabled = ${patch.enabled ?? j.enabled} where id = ${jobId}::uuid`);
    return (await this.getService(ctx.workspaceId, serviceId)).jobs;
  }

  async deleteJob(ctx, serviceId, jobId) {
    const { rowCount } = await this.db.execute(sql`delete from dp_jobs where id = ${jobId}::uuid and service_id = ${serviceId}::uuid and workspace_id = ${ctx.workspaceId}`);
    if (!rowCount) throw new NotFoundError('Job not found');
    return (await this.getService(ctx.workspaceId, serviceId)).jobs;
  }

  /** Queues one run of a job now (manual "Run now", or a schedule that is due). */
  async runJob(ctx, serviceId, jobId) {
    const { rows: [j] } = await this.db.execute(sql`select * from dp_jobs where id = ${jobId}::uuid and service_id = ${serviceId}::uuid and workspace_id = ${ctx.workspaceId}`);
    if (!j) throw new NotFoundError('Job not found');
    return this.#queueJob(j, ctx);
  }

  async #queueJob(job, ctx = { workspaceId: job.workspace_id, userId: null }) {
    const dep = await this.#createDeployment({ ctx, service: { id: job.service_id }, kind: job.kind === 'backup' ? 'backup' : 'job', title: job.name });
    await this.db.execute(sql`update dp_jobs set last_run_at = now() where id = ${job.id}::uuid`);
    await this.boss.send(this.queues.DEPLOY, { deploymentId: dep.id, jobId: job.id });
    return dep;
  }

  /** Once a minute: queue every enabled job whose schedule matches this minute, and close deployments a crashed worker left "running". */
  async tick(now = new Date()) {
    const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const { rows } = await this.db.execute(sql`select * from dp_jobs where enabled and (last_run_at is null or last_run_at < ${minute})`);
    let queued = 0;
    if (minute.getUTCMinutes() % 5 === 0) await this.sampleServers(minute).catch(() => {});
    for (const job of rows) if (cronMatches(job.cron, minute)) { await this.#queueJob(job); queued += 1; }
    await this.db.execute(sql`update dp_deployments set status = 'error', finished_at = now(), log = log || E'\n✖ The worker stopped before this finished.\n' where status = 'running' and started_at < now() - interval '2 hours'`);
    return queued;
  }

  /** Worker entry for job runs: builds the command (a command in the service, or a backup to the connected storage) and runs it. */
  async runJobDeployment({ deploymentId, jobId }) {
    const { rows: [job] } = await this.db.execute(sql`select * from dp_jobs where id = ${jobId}::uuid`);
    const { rows: [dep] } = await this.db.execute(sql`select * from dp_deployments where id = ${deploymentId}::uuid`);
    if (!job || !dep) return;
    const { rows: [svc] } = await this.db.execute(sql`select * from dp_services where id = ${job.service_id}::uuid`);
    const server = svc?.server_id ? (await this.db.execute(sql`select * from dp_servers where id = ${svc.server_id}::uuid`)).rows[0] : null;
    let command; const hidden = [];
    try {
      if (job.kind === 'backup') {
        const live = await this.integrations.resolve(job.workspace_id, 'storage');
        if (!live || !['s3', 'minio'].includes(live.key)) throw new Error('Connect and turn on an S3 or MinIO storage integration first (Integrations › Storage).');
        hidden.push(live.secrets.secret_access_key, this.#dec(svc.secrets_enc).dbPassword);
        command = cmd.backupCommand({
          kind: svc.kind, appName: svc.app_name, database: svc.config.database, keep: job.keep, prefix: '', stamp: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
          storage: { bucket: live.config.bucket, region: live.config.region, prefix: live.config.prefix, endpoint: live.config.endpoint, accessKeyId: live.config.access_key_id, secretAccessKey: live.secrets.secret_access_key },
        });
      } else command = cmd.execInServiceCommand(svc.app_name, job.command);
    } catch (e) { await this.#append(deploymentId, `✖ ${e.message}\n`); await this.#finish(deploymentId, DEPLOYMENT_STATUS.ERROR); await this.#notify(svc, false, job.name, e.message); return; }
    let buffer = '';
    try {
      const r = await this.#runnerFor(server).run(command, { onData: (t) => { buffer += t; }, timeoutMs: 60 * 60_000 });
      await this.#append(deploymentId, cmd.redact(buffer, hidden));
      await this.#finish(deploymentId, r.code === 0 ? DEPLOYMENT_STATUS.DONE : DEPLOYMENT_STATUS.ERROR);
      if (r.code !== 0) await this.#notify(svc, false, job.name, `exit ${r.code}`);
    } catch (e) {
      await this.#append(deploymentId, `${cmd.redact(buffer, hidden)}\n✖ ${e.message}\n`);
      await this.#finish(deploymentId, DEPLOYMENT_STATUS.ERROR);
      await this.#notify(svc, false, job.name, e.message);
    }
  }

  // ---------- webhooks ----------
  /** Push-to-deploy. GitHub (HMAC header), GitLab / Gitea (token header) or `?secret=`. Returns what happened, never throws for a bad call. */
  async handleWebhook(serviceId, { headers, query, rawBody }) {
    const { rows: [s] } = await this.db.execute(sql`select * from dp_services where id = ${serviceId}::uuid`).catch(() => ({ rows: [] }));
    if (!s) return { status: 404, body: { error: 'Unknown service' } };
    const safe = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
    const sig = headers['x-hub-signature-256'];
    let valid = false;
    if (sig) valid = safe(sig, `sha256=${crypto.createHmac('sha256', s.webhook_secret).update(rawBody).digest('hex')}`);
    else if (headers['x-gitlab-token'] || headers['x-gitea-token']) valid = safe(headers['x-gitlab-token'] ?? headers['x-gitea-token'], s.webhook_secret);
    else if (query?.secret) valid = safe(query.secret, s.webhook_secret);
    if (!valid) return { status: 401, body: { error: 'Invalid signature' } };
    if (!s.auto_deploy) return { status: 200, body: { skipped: 'Auto deploy is off' } };
    let payload = {}; try { payload = JSON.parse(rawBody.toString('utf8') || '{}'); } catch { /* not JSON: treat as a plain trigger */ }
    if (payload.ref && s.source?.branch && payload.ref !== `refs/heads/${s.source.branch}`) {
      if (s.config?.previews?.enabled && s.source?.type === 'git' && payload.ref.startsWith('refs/heads/')) return this.#handlePreview(s, payload.ref.slice('refs/heads/'.length), payload);
      return { status: 200, body: { skipped: `Push to ${payload.ref} ignored (watching ${s.source.branch})` } };
    }
    if (s.source?.type !== 'git' && s.kind === 'application') return { status: 200, body: { skipped: 'Only Git applications deploy on push' } };
    const ctx = { workspaceId: s.workspace_id, userId: null };
    const dep = await this.deploy(ctx, s.id, { title: payload.head_commit?.message ? `Push: ${String(payload.head_commit.message).split('\n')[0].slice(0, 80)}` : 'Push to repository' }).catch((e) => ({ error: e.message }));
    return dep.error ? { status: 409, body: { error: dep.error } } : { status: 202, body: { deploymentId: dep.id } };
  }

  /** A push to another branch of a service with previews on: one throw-away copy per branch, removed when the branch is deleted. */
  async #handlePreview(parent, branch, payload) {
    const ctx = { workspaceId: parent.workspace_id, userId: null };
    const { rows: [existing] } = await this.db.execute(sql`select id from dp_services where preview_of = ${parent.id}::uuid and preview_branch = ${branch}`);
    if (payload.deleted) {
      if (existing) await this.deleteService(ctx, existing.id);
      return { status: 200, body: { removed: Boolean(existing) } };
    }
    let id = existing?.id;
    if (!id) {
      const slug = branchSlug(branch); id = uuidv7();
      const base = parent.config?.previews?.domain;
      const config = { ...parent.config }; delete config.previews;
      await this.db.execute(sql`insert into dp_services (id, workspace_id, environment_id, server_id, kind, name, app_name, source, config, secrets_enc, env_enc, auto_deploy, webhook_secret, created_by, preview_of, preview_branch)
        values (${id}::uuid, ${parent.workspace_id}, ${parent.environment_id}::uuid, ${parent.server_id}, ${parent.kind}, ${`${parent.name} · ${branch}`.slice(0, 60)}, ${appNameFor(`${parent.app_name}-${slug}`, rand(4))}, ${jsonOf({ ...parent.source, branch })}::jsonb, ${jsonOf(config)}::jsonb, ${parent.secrets_enc}, ${parent.env_enc}, false, ${crypto.randomBytes(24).toString('base64url')}, ${parent.created_by}, ${parent.id}::uuid, ${branch})`);
      if (base && parent.config?.port) await this.db.execute(sql`insert into dp_domains (id, workspace_id, service_id, host, path, port, https) values (${uuidv7()}::uuid, ${parent.workspace_id}, ${id}::uuid, ${`${slug}-${parent.app_name}.${base}`.slice(0, 253)}, '/', ${parent.config.port}, true) on conflict do nothing`);
    }
    const dep = await this.deploy(ctx, id, { title: `Preview: ${branch}` }).catch((e) => ({ error: e.message }));
    return dep.error ? { status: 409, body: { error: dep.error } } : { status: 202, body: { preview: id, deploymentId: dep.id } };
  }

  /** What a "deploy to" menu offers: ready servers only. */
  async readyServers(ws) { return (await this.listServers(ws)).filter((s) => s.status === 'ready'); }

  requireOwnerRole(ctx) { if (!['owner', 'admin'].includes(ctx.role)) throw new ForbiddenError('Only admins can do that'); }
}

