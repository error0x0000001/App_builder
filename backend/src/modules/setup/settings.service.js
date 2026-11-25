import { settingsDefaults } from '@app/shared';
import { ConflictError, ValidationError } from '../../shared/errors.js';
import { SECURITY_FORMS } from './securityForms.js';

const NS = (tenantId, key) => `s:${tenantId}:${key}`;
const SETTINGS_TTL_MS = 5 * 60_000;

/**
 * The Setup settings pages. The three security pages are real (typed columns, optimistic `version`, audited); the organisation details page
 * writes the organisation itself; every other settings page is a read-only preview of its defaults until it has a real table.
 */
export class SettingsService {
  constructor({ repos, cache, bindings, onSecurityChange = async () => {} }) { Object.assign(this, { repos, cache, bindings, onSecurityChange }); }

  /** @returns cache entry { body, etag, value } where value = { version, values, tables, readOnly } */
  get(tenantId, page) {
    return this.cache.remember(NS(tenantId, page.key), 'v', { ttlMs: SETTINGS_TTL_MS }, async () => {
      const form = SECURITY_FORMS[page.key];
      const row = form ? await this.repos.security[form.kind](tenantId) : null;
      const values = { ...settingsDefaults(page), ...(row ? form.read(row) : {}), ...(await this.bindings.read(tenantId, page.key)) };
      const tables = {};
      for (const section of page.sections) if (section.table) tables[section.title] = await this.bindings.table(tenantId, page.key, section.title);
      return { version: row?.version ?? 0, values, tables, readOnly: this.#readOnly(page, form) };
    });
  }

  /** Every field of the page except the ones that are real: the security columns, and what the organisation details page can write. */
  #readOnly(page, form) {
    const writable = new Set([...Object.keys(form?.columns ?? {}), ...this.bindings.writable(page.key)]);
    return page.sections.flatMap((s) => s.fields ?? []).map((f) => f.key).filter((k) => !writable.has(k));
  }

  async update(tenantId, page, patch, { userId, expectedVersion }) {
    const form = SECURITY_FORMS[page.key];
    const locked = Object.keys(patch).filter((k) => this.#readOnly(page, form).includes(k));
    if (locked.length) throw new ValidationError(locked.map((field) => ({ field, message: form || this.bindings.writable(page.key).length ? 'This value is managed by the platform' : 'This page is a preview and cannot be changed yet' })));
    const rest = await this.bindings.write(tenantId, page.key, patch); // bound keys are applied to their real owner (the organisation's name)
    if (form) {
      const columns = Object.assign({}, ...Object.entries(rest).map(([k, v]) => form.columns[k](v)));
      const row = await this.repos.security.patch(form.kind, tenantId, columns, userId, expectedVersion);
      if (!row) throw new ConflictError('This page was changed by someone else. Reload to see the latest values.');
      await this.onSecurityChange(tenantId);
    }
    await this.cache.bump(NS(tenantId, page.key));
    await this.repos.auditLog.record(tenantId, userId, page.key, 'update', this.#summary(page, patch));
    return this.get(tenantId, page);
  }

  #summary(page, patch) {
    const labels = Object.fromEntries(page.sections.flatMap((s) => s.fields ?? []).map((f) => [f.key, f.label]));
    const parts = Object.entries(patch).map(([k, v]) => `${labels[k] ?? k} → ${v}`);
    return `Changed ${page.name}: ${parts.slice(0, 3).join('; ')}${parts.length > 3 ? ` (+${parts.length - 3} more)` : ''}`;
  }
}
