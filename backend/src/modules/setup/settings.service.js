import { settingsDefaults } from '@app/shared';
import { ConflictError, ValidationError } from '../../shared/errors.js';

const NS = (ws, key) => `s:${ws}:${key}`;
const SETTINGS_TTL_MS = 5 * 60_000;

/** Reads/writes the settings pages. Reads are served from the tiered cache; writes bump the page's version namespace. */
export class SettingsService {
  constructor({ repos, cache, bindings }) { Object.assign(this, { repos, cache, bindings }); }

  /** @returns cache entry { body, etag, value } where value = { version, values } */
  get(ws, page) {
    return this.cache.remember(NS(ws, page.key), 'v', { ttlMs: SETTINGS_TTL_MS }, async () => {
      const row = await this.repos.setupSettings.get(ws, page.key);
      const values = { ...settingsDefaults(page), ...(row?.values ?? {}), ...(await this.bindings.read(ws, page.key)) };
      const tables = {};
      for (const section of page.sections) if (section.table) tables[section.title] = await this.bindings.table(ws, page.key, section.title);
      return { version: row?.version ?? 0, values, tables, readOnly: this.bindings.readOnly(page.key) };
    });
  }

  async update(ws, page, patch, { userId, expectedVersion }) {
    const locked = Object.keys(patch).filter((k) => this.bindings.readOnly(page.key).includes(k));
    if (locked.length) throw new ValidationError(locked.map((field) => ({ field, message: 'This value is managed by the platform' })));
    const writable = await this.bindings.write(ws, page.key, patch); // bound keys are applied to their real owner (e.g. workspace name)
    const row = await this.repos.setupSettings.patch(ws, page.key, writable, userId, expectedVersion);
    if (!row) throw new ConflictError('This page was changed by someone else. Reload to see the latest values.');
    await this.cache.bump(NS(ws, page.key));
    await this.repos.setupAudit.record(ws, userId, page.key, 'update', this.#summary(page, patch));
    return this.get(ws, page);
  }

  #summary(page, patch) {
    const labels = Object.fromEntries(page.sections.flatMap((s) => s.fields ?? []).map((f) => [f.key, f.label]));
    const parts = Object.entries(patch).map(([k, v]) => `${labels[k] ?? k} → ${v}`);
    return `Changed ${page.name}: ${parts.slice(0, 3).join('; ')}${parts.length > 3 ? ` (+${parts.length - 3} more)` : ''}`;
  }
}
