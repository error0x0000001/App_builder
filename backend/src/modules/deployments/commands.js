import { DATABASE_DEFAULTS } from '@app/shared';

/**
 * Everything the deployment engine runs on a server, as pure functions that return shell text. Nothing here executes anything,
 * which is what makes it testable without Docker: tests read the commands, the runner (runner.js) is what runs them.
 * Every value that came from a person goes through `q()`; no command is built by joining raw input.
 */
export const q = (value) => `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;

export const NETWORK = 'quelli-network';
export const BASE_DIR = '/var/lib/quelli';
export const stackFile = (appName) => `${BASE_DIR}/stacks/${appName}.json`;
export const buildDir = (appName) => `${BASE_DIR}/builds/${appName}`;
export const serviceName = (appName) => `${appName}_app`;

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
/** Writes a file on the server without any shell-quoting risk (content travels base64-encoded), owner-only. */
export const writeFileCmd = (path, content) => `umask 077; mkdir -p "$(dirname ${q(path)})"; printf %s ${q(b64(content))} | base64 -d > ${q(path)}`;

/** Replaces known secret strings in log text so a token never lands in a stored log. */
export const redact = (text, secrets = []) => secrets.filter((s) => s && String(s).length >= 4).reduce((t, s) => t.split(String(s)).join('•••'), String(text));

export const parseEnv = (text) => {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[t.slice(0, i).trim()] = value;
  }
  return out;
};

/** Installs Docker if missing, turns on Swarm, creates the shared network and starts Traefik (HTTPS through Let's Encrypt). Safe to run again. */
export const serverSetupScript = ({ acmeEmail }) => [
  'set -e',
  'echo "== Checking Docker =="',
  'if ! command -v docker >/dev/null 2>&1; then echo "Installing Docker…"; curl -fsSL https://get.docker.com | sh; fi',
  'docker version --format "Docker {{.Server.Version}}"',
  'echo "== Swarm =="',
  'if [ "$(docker info --format \'{{.Swarm.LocalNodeState}}\')" != "active" ]; then docker swarm init --advertise-addr "$(hostname -I | awk \'{print $1}\')" || docker swarm init; fi',
  `echo "== Network ${NETWORK} =="`,
  `docker network inspect ${NETWORK} >/dev/null 2>&1 || docker network create --driver overlay --attachable ${NETWORK}`,
  'echo "== Traefik =="',
  `mkdir -p ${BASE_DIR}/stacks ${BASE_DIR}/builds`,
  'docker service inspect quelli-traefik >/dev/null 2>&1 && echo "Traefik is already running" || docker service create --detach --name quelli-traefik'
    + ' --constraint node.role==manager --publish mode=host,target=80,published=80 --publish mode=host,target=443,published=443'
    + ` --network ${NETWORK} --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly --mount type=volume,source=quelli-traefik-certs,target=/letsencrypt`
    + ` traefik:v3.1 --providers.swarm.endpoint=unix:///var/run/docker.sock --providers.swarm.exposedByDefault=false --providers.swarm.network=${NETWORK}`
    + ' --entrypoints.web.address=:80 --entrypoints.websecure.address=:443'
    + ` --certificatesresolvers.letsencrypt.acme.tlschallenge=true --certificatesresolvers.letsencrypt.acme.email=${q(acmeEmail)} --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json`,
  'echo "== Done =="',
].join('\n');

export const probeCommand = 'docker version --format "{{.Server.Version}}" 2>&1';

/** Traefik routing as service labels (the swarm provider reads them): one router per domain, HTTPS when asked. */
export function traefikLabels(appName, domains) {
  const labels = {};
  if (!domains.length) return labels;
  labels['traefik.enable'] = 'true';
  labels['traefik.swarm.network'] = NETWORK;
  domains.forEach((d, i) => {
    const key = `${appName}-${i}`;
    const rule = `Host(\`${d.host}\`)${d.path && d.path !== '/' ? ` && PathPrefix(\`${d.path}\`)` : ''}`;
    labels[`traefik.http.routers.${key}.rule`] = rule;
    labels[`traefik.http.routers.${key}.service`] = key;
    labels[`traefik.http.services.${key}.loadbalancer.server.port`] = String(d.port);
    if (d.https) {
      labels[`traefik.http.routers.${key}.entrypoints`] = 'websecure';
      labels[`traefik.http.routers.${key}.tls.certresolver`] = 'letsencrypt';
      labels[`traefik.http.routers.${key}-http.rule`] = rule;
      labels[`traefik.http.routers.${key}-http.entrypoints`] = 'web';
      labels[`traefik.http.routers.${key}-http.middlewares`] = `${key}-https`;
      labels[`traefik.http.middlewares.${key}-https.redirectscheme.scheme`] = 'https';
    } else {
      labels[`traefik.http.routers.${key}.entrypoints`] = 'web';
    }
  });
  return labels;
}

/** What a database kind needs to start: environment, command and the connection string shown to the person. */
export function databaseSpec(kind, appName, db) {
  const d = DATABASE_DEFAULTS[kind];
  const user = db?.user ?? 'app'; const name = db?.name ?? 'app'; const password = db?.password;
  const env = {}; let command;
  if (kind === 'postgres') Object.assign(env, { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: name });
  else if (kind === 'mysql' || kind === 'mariadb') Object.assign(env, kind === 'mysql' ? { MYSQL_ROOT_PASSWORD: password, MYSQL_DATABASE: name, MYSQL_USER: user, MYSQL_PASSWORD: password } : { MARIADB_ROOT_PASSWORD: password, MARIADB_DATABASE: name, MARIADB_USER: user, MARIADB_PASSWORD: password });
  else if (kind === 'mongo') Object.assign(env, { MONGO_INITDB_ROOT_USERNAME: user, MONGO_INITDB_ROOT_PASSWORD: password });
  else if (kind === 'redis') command = ['redis-server', '--requirepass', password, '--appendonly', 'yes'];
  const scheme = { postgres: 'postgresql', mysql: 'mysql', mariadb: 'mysql', mongo: 'mongodb', redis: 'redis' }[kind];
  const auth = kind === 'redis' ? `:${encodeURIComponent(password)}@` : `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
  return { image: d.image, port: d.port, dataDir: d.dataDir, env, command, internalUrl: `${scheme}://${auth}${appName}_app:${d.port}${kind === 'redis' || kind === 'mongo' ? '' : `/${name}`}` };
}

/** The Swarm stack (a Compose document, written as JSON which Compose reads) for one application or database. */
export function stackDocument({ appName, image, env = {}, replicas = 1, domains = [], volumes = [], publishedPorts = [], command, healthCheck, memoryLimitMb, cpuLimit }) {
  const deploy = {
    replicas,
    labels: traefikLabels(appName, domains),
    update_config: { order: 'start-first', failure_action: 'rollback', parallelism: 1 },
    rollback_config: { order: 'start-first' },
    restart_policy: { condition: 'on-failure', delay: '5s', max_attempts: 5 },
  };
  if (memoryLimitMb || cpuLimit) deploy.resources = { limits: { ...(memoryLimitMb ? { memory: `${memoryLimitMb}M` } : {}), ...(cpuLimit ? { cpus: String(cpuLimit) } : {}) } };
  const service = { image, networks: [NETWORK], environment: env, deploy };
  if (command) service.command = Array.isArray(command) ? command : ['sh', '-c', command];
  if (healthCheck) service.healthcheck = { test: ['CMD-SHELL', healthCheck], interval: '30s', timeout: '10s', retries: 3, start_period: '30s' };
  if (publishedPorts.length) service.ports = publishedPorts.map((p) => ({ target: p.target, published: p.published, protocol: p.protocol ?? 'tcp', mode: 'host' }));
  const named = volumes.map((v) => ({ key: `vol-${v.name}`, name: `${appName}-${v.name}`, path: v.path }));
  if (named.length) service.volumes = named.map((v) => ({ type: 'volume', source: v.key, target: v.path }));
  const doc = { version: '3.8', services: { app: service }, networks: { [NETWORK]: { external: true } } };
  if (named.length) doc.volumes = Object.fromEntries(named.map((v) => [v.key, { name: v.name }]));
  return doc;
}

export const pullCommand = ({ image, registryUser, registryPassword, registryUrl }) => [
  registryUser && registryPassword ? `printf %s ${q(registryPassword)} | docker login ${registryUrl ? q(registryUrl) : ''} -u ${q(registryUser)} --password-stdin` : null,
  `docker pull ${q(image)}`,
].filter(Boolean).join(' && ');

/** Clone (shallow) with the token sent as an HTTP header, not written into the URL or the remote config. */
export function cloneCommand(source, appName) {
  const auth = source.token ? `-c http.extraHeader=${q(`Authorization: Basic ${Buffer.from(`x-access-token:${source.token}`).toString('base64')}`)} ` : '';
  const dir = buildDir(appName);
  return [`rm -rf ${q(dir)}`, `mkdir -p ${q(dir)}`, `git ${auth}clone --depth 1 --branch ${q(source.branch)} ${q(source.repository)} ${q(dir)}`, `git -C ${q(dir)} rev-parse HEAD`].join(' && ');
}

/** Builds the image from the cloned repository and tags it `<app>:<tag>`. */
export function buildCommand(source, appName, tag, env = {}) {
  const dir = buildDir(appName);
  const path = source.buildPath && source.buildPath !== '.' ? `${dir}/${source.buildPath.replace(/^\/+/, '')}` : dir;
  const image = `${appName}:${tag}`;
  const envArgs = Object.entries(env).map(([k, v]) => `--build-arg ${q(`${k}=${v}`)}`).join(' ');
  if (source.buildType === 'nixpacks') return `nixpacks build ${q(path)} --name ${q(image)} ${Object.entries(env).map(([k, v]) => `--env ${q(`${k}=${v}`)}`).join(' ')}`.trim();
  if (source.buildType === 'railpack') return `railpack build ${q(path)} --name ${q(image)}`;
  if (source.buildType === 'static') {
    const publish = (source.publishDirectory ?? 'dist').replace(/^\/+/, '');
    return `printf %s ${q(b64('FROM nginx:alpine\nCOPY . /usr/share/nginx/html\n'))} | base64 -d > ${q(`${path}/${publish}/.Dockerfile.quelli`)} && docker build -t ${q(image)} -f ${q(`${path}/${publish}/.Dockerfile.quelli`)} ${q(`${path}/${publish}`)}`;
  }
  return `docker build ${envArgs} -t ${q(image)} -f ${q(`${path}/${source.dockerfile || 'Dockerfile'}`)} ${q(path)}`.replace(/\s+/g, ' ');
}

export const applyStackCommand = (appName, doc) => `${writeFileCmd(stackFile(appName), JSON.stringify(doc, null, 2))} && docker stack deploy --detach=true --with-registry-auth --prune --compose-file ${q(stackFile(appName))} ${q(appName)}`;
export const composeUpCommand = (appName, composeFile, env) => {
  const dir = `${BASE_DIR}/compose/${appName}`;
  return `${writeFileCmd(`${dir}/docker-compose.yml`, composeFile)} && ${writeFileCmd(`${dir}/.env`, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'))} && docker compose -p ${q(appName)} --project-directory ${q(dir)} -f ${q(`${dir}/docker-compose.yml`)} up -d --remove-orphans --pull always`;
};
export const composeDownCommand = (appName) => `docker compose -p ${q(appName)} down --remove-orphans; rm -rf ${q(`${BASE_DIR}/compose/${appName}`)}`;

/** Waits until the new task is running, or stops with the reason the scheduler gave (exit 3), or times out (exit 124). */
export const waitCommand = (appName, seconds = 180) => {
  const script = [
    'while true; do',
    `  line=$(docker service ps --no-trunc --filter desired-state=running --format '{{.CurrentState}}|{{.Error}}' ${serviceName(appName)} 2>/dev/null | head -1)`,
    '  case "$line" in Running*) echo "Running"; exit 0;; esac',
    '  err="${line#*|}"',
    '  if [ -n "$err" ] && [ "$err" != "$line" ]; then echo "$err"; exit 3; fi',
    '  sleep 3',
    'done',
  ].join('\n');
  return `timeout ${Number(seconds)} sh -c ${q(script)}`;
};
export const statusCommand = (appName) => `docker service ps --no-trunc --format '{{.CurrentState}}|{{.Error}}' ${q(serviceName(appName))} 2>/dev/null | head -5`;
export const logsCommand = (appName, tail = 300) => `docker service logs --no-trunc --timestamps --tail ${Number(tail)} ${q(serviceName(appName))} 2>&1`;
export const statsCommand = (appName) => `docker stats --no-stream --format '{{json .}}' $(docker ps -q --filter ${q(`name=${appName}_app`)}) 2>/dev/null`;
export const scaleCommand = (appName, replicas) => `docker service scale ${q(serviceName(appName))}=${Number(replicas)}`;
export const removeCommand = (appName) => `docker stack rm ${q(appName)}; rm -f ${q(stackFile(appName))}`;
export const rollbackCommand = (appName, image) => `docker image inspect ${q(image)} >/dev/null 2>&1 && docker service update --detach=true --image ${q(image)} ${q(serviceName(appName))}`;
export const execInServiceCommand = (appName, command) => `docker exec $(docker ps -q --filter ${q(`name=${appName}_app`)} | head -1) sh -c ${q(command)}`;
export const serverStatsCommand = "echo \"cpu $(top -bn1 | awk '/Cpu\\(s\\)/ {print 100-$8}')\"; free -m | awk '/Mem:/ {print \"mem\", $3, $2}'; df -P / | awk 'NR==2 {print \"disk\", $3, $2}'; uptime -p";

/** A database dump uploaded with rclone to the S3-compatible storage the workspace connected. Credentials go in as environment, not arguments. */
export function backupCommand({ kind, appName, database, storage, keep, prefix, stamp }) {
  const d = DATABASE_DEFAULTS[kind];
  const file = `${appName}-${stamp}.${kind === 'mongo' ? 'archive.gz' : kind === 'redis' ? 'rdb' : 'sql.gz'}`;
  const dump = {
    postgres: `PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U ${q(database.user)} ${q(database.name)} | gzip`,
    mysql: `mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" ${q(database.name)} | gzip`,
    mariadb: `mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" ${q(database.name)} | gzip`,
    mongo: 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip',
    redis: 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --rdb /dev/stdout',
  }[kind];
  const remote = `${storage.bucket}/${storage.prefix ? `${storage.prefix.replace(/\/?$/, '/')}` : ''}${prefix ? `${prefix.replace(/\/?$/, '/')}` : ''}${appName}`;
  const envs = {
    RCLONE_CONFIG_S3_TYPE: 's3', RCLONE_CONFIG_S3_PROVIDER: storage.endpoint ? 'Other' : 'AWS', RCLONE_CONFIG_S3_ACCESS_KEY_ID: storage.accessKeyId,
    RCLONE_CONFIG_S3_SECRET_ACCESS_KEY: storage.secretAccessKey, RCLONE_CONFIG_S3_REGION: storage.region, ...(storage.endpoint ? { RCLONE_CONFIG_S3_ENDPOINT: storage.endpoint } : {}),
  };
  const dockerEnv = Object.entries(envs).map(([k, v]) => `-e ${q(`${k}=${v}`)}`).join(' ');
  return [
    'set -e',
    `cid=$(docker ps -q --filter ${q(`name=${appName}_app`)} | head -1); [ -n "$cid" ] || { echo "The service is not running"; exit 1; }`,
    `docker exec "$cid" sh -c ${q(dump)} > ${q(`/tmp/${file}`)}`,
    `docker run --rm -v /tmp:/data ${dockerEnv} rclone/rclone copyto ${q(`/data/${file}`)} ${q(`:s3:${remote}/${file}`)}`,
    `rm -f ${q(`/tmp/${file}`)}`,
    `docker run --rm ${dockerEnv} rclone/rclone lsf ${q(`:s3:${remote}`)} | sort -r | tail -n +${Number(keep) + 1} | while read f; do docker run --rm ${dockerEnv} rclone/rclone deletefile ${q(`:s3:${remote}/`)}"$f"; done || true`,
    `echo "Backup ${file} uploaded (${d.label})"`,
  ].join('\n');
}

// ---------- Swarm cluster ----------
export const nodesCommand = "docker node ls --format '{{json .}}'";
export const joinTokenCommand = (role) => `docker swarm join-token -q ${role === 'manager' ? 'manager' : 'worker'}`;
/** Leaves any swarm this machine is in, then joins the manager's. */
export const joinCommand = ({ token, managerHost }) => `docker swarm leave --force >/dev/null 2>&1 || true\ndocker swarm join --token ${q(token)} ${q(`${managerHost}:2377`)}`;
export const NODE_ID = /^[a-z0-9]{10,40}$/;
export const nodeActionCommand = (nodeId, action) => {
  if (!NODE_ID.test(nodeId)) throw new Error('Invalid node');
  if (action === 'drain' || action === 'active') return `docker node update --availability ${action} ${q(nodeId)}`;
  if (action === 'remove') return `docker node update --availability drain ${q(nodeId)} >/dev/null 2>&1; docker node rm --force ${q(nodeId)}`;
  throw new Error('Unknown action');
};
