import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { createApp } from '../src/services/api/app.js';
import { createContainer } from '../src/services/api/container.js';
import { pool } from '../src/shared/db/index.js';

/** Boots the real API on an ephemeral port with an in-memory outbox instead of a queue. */
export async function startServer() {
  const outbox = [];
  const boss = { send: async (queue, payload) => outbox.push(payload) };
  const container = createContainer({ boss });
  const server = createApp(container).listen(0);
  container.realtime.attach(server);
  container.terminals?.attach(server);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  return {
    base, outbox, container, wsUrl: `ws://127.0.0.1:${server.address().port}/api/v1/realtime`,
    mailTo: (to, template) => [...outbox].reverse().find((m) => m.to === to && (!template || m.template === template)),
    stop: async () => { server.close(); await container.close(); await pool.end(); },
  };
}

/** Minimal cookie-aware HTTP client; each instance is a distinct "browser" with its own IP. */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    this.token = null;
  }

  async request(method, path, body, headers = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json', 'X-Forwarded-For': this.ip,
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...value] = pair.split('=');
      if (value.join('=') === '') this.cookies.delete(name);
      else this.cookies.set(name, value.join('='));
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (json?.accessToken) this.token = json.accessToken;
    return { status: res.status, body: json, headers: res.headers };
  }

  /** multipart/form-data upload: fields first, then one file part (as the real client sends it). */
  async upload(path, { fields = {}, filename = 'note.txt', content = 'hello', type = 'text/plain' } = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('file', new Blob([content], { type }), filename);
    const res = await fetch(`${this.base}${path}`, { method: 'POST', body: form, headers: { 'X-Forwarded-For': this.ip, ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) } });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** Raw download (no JSON parsing); pass extra headers such as Range. */
  async download(path, headers = {}, { auth = true } = {}) {
    const res = await fetch(`${this.base}${path}`, { headers: { 'X-Forwarded-For': this.ip, ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...headers } });
    return { status: res.status, text: await res.text(), headers: res.headers };
  }

  get = (p) => this.request('GET', p);
  post = (p, b = {}) => this.request('POST', p, b);
  patch = (p, b = {}) => this.request('PATCH', p, b);
  put = (p, b = {}) => this.request('PUT', p, b);
  delete = (p) => this.request('DELETE', p);
}

export const PASSWORD = 'Sup3rSecret-pass';
export const uniqueEmail = () => `user-${randomUUID().slice(0, 8)}@example.com`;
export const totpNow = (secret) => new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();

export const signupBody = (email, overrides = {}) => ({
  firstName: 'Priya', lastName: 'Sharma', email, password: PASSWORD, company: 'Acme Corp', acceptTerms: true, ...overrides,
});

/** Signs a brand-new user up and verifies the email; returns the authenticated client. */
export async function registerUser(server, overrides = {}) {
  const client = new Client(server.base);
  const email = overrides.email ?? uniqueEmail();
  await client.post('/auth/signup', signupBody(email, overrides));
  const { code } = server.mailTo(email, 'verify_email').data;
  const res = await client.post('/auth/verify-email', { email, code });
  if (res.status !== 200) throw new Error(`verify failed: ${JSON.stringify(res.body)}`);
  return { client, email };
}
