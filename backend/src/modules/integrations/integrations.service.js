import { INTEGRATIONS, getIntegration, publicFieldKeys, requiredSecretKeys } from '@app/shared';
import { sql } from 'drizzle-orm';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { createSmtpTransport, smtpSettings, testProvider } from './testers.js';

/** Categories where only one provider can be live at a time (you cannot send email through two services, or store files in two places). */
const EXCLUSIVE = new Set(['email', 'storage', 'maps']);
const TTL_MS = 5_000;

/**
 * An organisation's connections to outside services. The flow is deliberate: save credentials → test them for real → enable. Anything that
 * changes the credentials resets the test and turns the provider off, so a provider is only ever used when it has been proven to work as configured.
 * `resolve()` is what other modules call: it returns the live provider for a category, or null (so features fall back or stay off).
 */
export class IntegrationsService {
  #live = new Map();

  constructor({ db, secretBox, repos, allowPrivate = false }) { Object.assign(this, { db, secretBox, repos, allowPrivate }); }

  async #rows(ws) {
    const { rows } = await this.db.execute(sql`select provider, enabled, config, secrets_enc, status, status_message, tested_at, version, updated_at from tenant_integrations where tenant_id = ${ws}`);
    return rows;
  }

  #state(def, row) {
    const secrets = row?.secrets_enc ? JSON.parse(this.secretBox.decrypt(row.secrets_enc)) : {};
    return {
      key: def.key, saved: Boolean(row), enabled: Boolean(row?.enabled), status: row?.status ?? 'unconfigured', statusMessage: row?.status_message ?? null,
      testedAt: row?.tested_at ?? null, updatedAt: row?.updated_at ?? null, config: row?.config ?? {}, secretsSet: Object.keys(secrets).filter((k) => secrets[k]),
    };
  }

  async list(ws) {
    const by = new Map((await this.#rows(ws)).map((r) => [r.provider, r]));
    return INTEGRATIONS.map((def) => this.#state(def, by.get(def.key)));
  }

  async #row(ws, key) {
    const { rows } = await this.db.execute(sql`select * from tenant_integrations where tenant_id = ${ws} and provider = ${key}`);
    return rows[0] ?? null;
  }

  #forget(ws) { for (const k of [...this.#live.keys()]) if (k.startsWith(`${ws}:`)) this.#live.delete(k); }
  #audit(ctx, text) { return this.repos?.auditLog?.record(ctx.tenantId, ctx.userId, 'integrations', 'update', text); }
  #need(key) { const def = getIntegration(key); if (!def) throw new NotFoundError('Unknown integration'); return def; }

  /** Saves credentials. Secrets left out keep their stored value. Always lands as "untested" and off. */
  async save(ctx, key, { config, secrets = {} }) {
    const def = this.#need(key);
    const existing = await this.#row(ctx.tenantId, key);
    const stored = existing?.secrets_enc ? JSON.parse(this.secretBox.decrypt(existing.secrets_enc)) : {};
    const merged = { ...stored };
    for (const [k, v] of Object.entries(secrets)) if (typeof v === 'string' && v.trim()) merged[k] = v.trim();
    const missing = requiredSecretKeys(key).filter((k) => !merged[k]);
    if (missing.length) throw new ValidationError(missing.map((k) => ({ field: `secrets.${k}`, message: `${def.fields.find((f) => f.key === k).label} is required` })));
    const plain = Object.fromEntries(publicFieldKeys(key).filter((k) => config[k] !== undefined && config[k] !== '').map((k) => [k, config[k]]));
    const enc = this.secretBox.encrypt(JSON.stringify(merged));
    await this.db.execute(sql`
      insert into tenant_integrations (tenant_id, provider, enabled, config, secrets_enc, status, status_message, updated_by)
      values (${ctx.tenantId}, ${key}, false, ${JSON.stringify(plain)}::jsonb, ${enc}, 'untested', null, ${ctx.userId})
      on conflict (tenant_id, provider) do update set enabled = false, config = excluded.config, secrets_enc = excluded.secrets_enc, status = 'untested', status_message = null,
        tested_at = null, version = tenant_integrations.version + 1, updated_by = excluded.updated_by, updated_at = now()`);
    this.#forget(ctx.tenantId);
    await this.#audit(ctx, `Saved ${def.name} credentials`);
    return this.#one(ctx.tenantId, key);
  }

  async #one(ws, key) { return this.#state(this.#need(key), await this.#row(ws, key)); }

  /** Really checks the credentials against the service and records the outcome. */
  async test(ctx, key) {
    const def = this.#need(key);
    const row = await this.#row(ctx.tenantId, key);
    if (!row) throw new ConflictError('Save the credentials first');
    const secrets = JSON.parse(this.secretBox.decrypt(row.secrets_enc));
    const result = await testProvider(key, row.config, secrets, { allowPrivate: this.allowPrivate });
    // Only record it if nobody changed the credentials while the test ran.
    await this.db.execute(sql`update tenant_integrations set status = ${result.ok ? 'connected' : 'error'}, status_message = ${result.message}, tested_at = now(),
      enabled = case when ${result.ok} then enabled else false end where tenant_id = ${ctx.tenantId} and provider = ${key} and version = ${row.version}`);
    this.#forget(ctx.tenantId);
    await this.#audit(ctx, `Tested ${def.name}: ${result.ok ? 'connected' : 'failed'}`);
    return this.#one(ctx.tenantId, key);
  }

  /** Turns a provider on (only once it has been tested OK) or off. Turning one on turns the others in its category off. */
  async setEnabled(ctx, key, enabled) {
    const def = this.#need(key);
    const row = await this.#row(ctx.tenantId, key);
    if (!row) throw new ConflictError('Save the credentials first');
    if (enabled && row.status !== 'connected') throw new ConflictError('Test the connection successfully before turning this on');
    if (enabled && EXCLUSIVE.has(def.category)) {
      const others = INTEGRATIONS.filter((i) => i.category === def.category && i.key !== key).map((i) => i.key);
      for (const other of others) await this.db.execute(sql`update tenant_integrations set enabled = false where tenant_id = ${ctx.tenantId} and provider = ${other}`);
    }
    await this.db.execute(sql`update tenant_integrations set enabled = ${enabled}, updated_by = ${ctx.userId}, updated_at = now() where tenant_id = ${ctx.tenantId} and provider = ${key}`);
    this.#forget(ctx.tenantId);
    await this.#audit(ctx, `${enabled ? 'Turned on' : 'Turned off'} ${def.name}`);
    return this.list(ctx.tenantId);
  }

  async disconnect(ctx, key) {
    const def = this.#need(key);
    await this.db.execute(sql`delete from tenant_integrations where tenant_id = ${ctx.tenantId} and provider = ${key}`);
    this.#forget(ctx.tenantId);
    await this.#audit(ctx, `Disconnected ${def.name}`);
    return this.list(ctx.tenantId);
  }

  /**
   * The live provider of a category for an organisation — enabled AND tested OK — or null. Cached for a few seconds in this process;
   * changes made here apply immediately, changes made on another worker within TTL_MS.
   */
  async resolve(ws, category) {
    const k = `${ws}:${category}`;
    const hit = this.#live.get(k);
    if (hit && hit.until > Date.now()) return hit.value;
    const keys = INTEGRATIONS.filter((i) => i.category === category).map((i) => i.key);
    const { rows } = await this.db.execute(sql`select provider, config, secrets_enc, version from tenant_integrations where tenant_id = ${ws} and enabled and status = 'connected' and provider = any(${sql.raw(`array[${keys.map((x) => `'${x}'`).join(',')}]::text[]`)}) limit 1`);
    const row = rows[0];
    const value = row ? { key: row.provider, version: row.version, config: row.config, secrets: JSON.parse(this.secretBox.decrypt(row.secrets_enc)) } : null;
    this.#live.set(k, { value, until: Date.now() + TTL_MS });
    return value;
  }

  /** Every live provider of a category (for categories where several can be on, like messaging). Cached a few seconds. */
  async resolveAll(ws, category) {
    const k = `${ws}:${category}:all`;
    const hit = this.#live.get(k);
    if (hit && hit.until > Date.now()) return hit.value;
    const keys = INTEGRATIONS.filter((i) => i.category === category).map((i) => i.key);
    const { rows } = await this.db.execute(sql`select provider, config, secrets_enc, version from tenant_integrations where tenant_id = ${ws} and enabled and status = 'connected' and provider = any(${sql.raw(`array[${keys.map((x) => `'${x}'`).join(',')}]::text[]`)})`);
    const value = rows.map((row) => ({ key: row.provider, version: row.version, config: row.config, secrets: JSON.parse(this.secretBox.decrypt(row.secrets_enc)) }));
    this.#live.set(k, { value, until: Date.now() + TTL_MS });
    return value;
  }

  /** A mail sender for an organisation that has its own live email integration, else null (the platform's default transport is used). */
  mailerFor() {
    const transports = new Map();
    return async (ws) => {
      const live = await this.resolve(ws, 'email');
      if (!live) return null;
      const id = `${ws}:${live.key}:${live.version}`;
      let entry = transports.get(id);
      if (!entry) {
        const settings = smtpSettings(live.key, live.config, live.secrets);
        entry = { transport: await createSmtpTransport(settings, { allowPrivate: this.allowPrivate }), from: live.config.from_name ? `"${live.config.from_name.replace(/"/g, '')}" <${live.config.from_email}>` : live.config.from_email };
        for (const stale of [...transports.keys()]) if (stale.startsWith(`${ws}:`)) transports.get(stale).transport.close();
        for (const stale of [...transports.keys()]) if (stale.startsWith(`${ws}:`)) transports.delete(stale);
        transports.set(id, entry);
      }
      return { send: (message) => entry.transport.sendMail({ from: entry.from, ...message }) };
    };
  }
}
