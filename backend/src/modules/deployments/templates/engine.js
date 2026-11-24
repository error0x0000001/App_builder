import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const WORDS = ['amber', 'birch', 'cedar', 'dune', 'ember', 'fjord', 'glade', 'harbor', 'iris', 'juniper', 'koi', 'lumen', 'maple', 'nova', 'onyx', 'pine'];
const randomString = (n, alphabet = ALNUM) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

let cache;
/** The packed Dokploy-compatible catalog (MIT, see LICENSE-dokploy-templates), loaded once. */
export function catalog() {
  cache ??= JSON.parse(readFileSync(fileURLToPath(new URL('./data.json', import.meta.url)), 'utf8'));
  return cache;
}
export const findTemplate = (id) => catalog().find((t) => t.id === id) ?? null;
export const listTemplates = () => catalog().map(({ compose, toml, ...meta }) => meta);

/** Signs `{...payload}` as HS256 — what `${jwt:secret:payload}` produces (the payload is JSON in another variable). */
function jwt(secret, payloadText) {
  let payload; try { payload = JSON.parse(payloadText); } catch { payload = {}; }
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest())}`;
}

/**
 * Template placeholders, as Dokploy documents them: ${domain} ${email} ${username} ${password:N} ${base64:N} ${hash:N} ${uuid}
 * ${randomPort} ${timestamp} ${timestampms} ${timestamps:<ISO date>} ${jwt:<secret var>:<payload var>}, and ${name} for another variable.
 * `ctx.domain(key)` supplies hosts; everything else is random per call.
 */
function makeResolver(ctx) {
  const vars = {};
  const fn = (name, arg) => {
    switch (name) {
      case 'domain': return ctx.domain(ctx.currentKey);
      case 'password': return randomString(Number(arg) || 16);
      case 'base64': return crypto.randomBytes(Number(arg) || 32).toString('base64');
      case 'hash': { let out = ''; while (out.length < (Number(arg) || 32)) out += crypto.randomBytes(32).toString('hex'); return out.slice(0, Number(arg) || 32); }
      case 'uuid': return crypto.randomUUID();
      case 'randomPort': return String(30000 + crypto.randomInt(0, 30000));
      case 'email': return `${randomString(8, 'abcdefghijklmnopqrstuvwxyz')}@${ctx.mailDomain}`;
      case 'username': return `${WORDS[crypto.randomInt(0, WORDS.length)]}-${randomString(4, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
      case 'timestamp': return String(Math.floor(Date.now() / 1000));
      case 'timestampms': return String(Date.now());
      case 'timestamps': return String(Math.floor(new Date(arg).getTime() / 1000));
      case 'jwt': { const [secretVar, payloadVar] = String(arg ?? '').split(':'); return payloadVar ? jwt(vars[secretVar] ?? secretVar, vars[payloadVar] ?? '{}') : randomString(Number(secretVar) || 32); }
      default: return undefined;
    }
  };
  const resolve = (text) => String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::([^}]*))?\}/g, (whole, name, arg) => {
    if (name in vars && arg === undefined) return vars[name];
    const out = fn(name, arg);
    return out === undefined ? whole : out;
  });
  return { vars, resolve };
}

const norm = (value) => (value === undefined || value === null ? '' : String(value));
const SAFE_FILE = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\0]+$/;

/**
 * Turns a template into what a Compose service needs: the compose text, environment text, domains and files to write.
 * Throws a plain Error for a template that is not valid.
 */
export function renderTemplate(template, { domain, mailDomain = 'example.com' } = {}) {
  const parsed = parseToml(template.toml);
  const hosts = new Map(); let first = true;
  const hostFor = (key) => {
    if (!hosts.has(key)) { hosts.set(key, first ? domain : `${String(key).replace(/_/g, '-')}.${domain}`); first = false; }
    return hosts.get(key);
  };
  const ctx = { domain: hostFor, mailDomain, currentKey: 'main_domain' };
  const { vars, resolve } = makeResolver(ctx);
  for (const [key, value] of Object.entries(parsed.variables ?? {})) { ctx.currentKey = key; vars[key] = resolve(norm(value)); }
  ctx.currentKey = 'main_domain';
  const config = parsed.config ?? {};
  const env = Array.isArray(config.env) ? config.env.map(resolve) : Object.entries(config.env ?? {}).map(([k, v]) => `${k}=${resolve(norm(v))}`);
  const hostOf = (d) => {
    const raw = norm(d.host).trim();
    if (!raw) return hostFor(`${d.serviceName}_domain`); // no host given: one is generated, like Dokploy does
    if (raw in vars) return vars[raw]; // a bare variable name
    return resolve(raw);
  };
  const domains = (config.domains ?? []).map((d) => ({ serviceName: d.serviceName, port: Number(d.port), host: hostOf(d), path: d.path ? resolve(norm(d.path)) : '/' }));
  const mounts = (config.mounts ?? []).map((m) => ({ path: String(m.filePath).replace(/^\/+/, ''), content: resolve(norm(m.content)) }));
  for (const m of mounts) if (!SAFE_FILE.test(m.path)) throw new Error(`Unsafe file path in template: ${m.path}`);
  const doc = parseYaml(template.compose);
  if (!doc || typeof doc !== 'object' || !doc.services) throw new Error('The template has no services');
  for (const d of domains) if (!(d.serviceName in doc.services)) throw new Error(`Domain points at unknown service “${d.serviceName}”`);
  return { compose: template.compose, env: env.join('\n'), domains, mounts, variables: vars };
}

/** The variables a person could want to see before deploying (names + whether generated) — never values. */
export function describeTemplate(template) {
  const parsed = parseToml(template.toml);
  const config = parsed.config ?? {};
  return {
    variables: Object.keys(parsed.variables ?? {}),
    domains: (config.domains ?? []).map((d) => ({ serviceName: d.serviceName, port: Number(d.port) })),
    mounts: (config.mounts ?? []).map((m) => String(m.filePath)),
    envNames: (Array.isArray(config.env) ? config.env.map((l) => String(l).split('=')[0]) : Object.keys(config.env ?? {})),
    services: Object.keys(parseYaml(template.compose)?.services ?? {}),
  };
}
