import { labelKey, recordSchemas, statusKey } from '@app/shared';
import { getCollection, getToolMeta, importableObjects, toolInputSchema } from '@app/shared/setup-registry';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { QUEUES } from '../../shared/queue.js';
import { parseCsv, toCsv } from './csv.js';

const IMPORT_MAX_ROWS = 5000;
const BATCH = 500;
const EXPORT_MAX_ROWS = 100_000;

/** Runs the Setup "tool" pages. A tool without a real handler is recorded and reported as not active — never faked. */
export class ToolsService {
  constructor({ repos, records, mail, boss }) {
    Object.assign(this, { repos, records, mail, boss });
    this.handlers = {
      import: (c, d) => this.#import(c, d), export: (c, d) => this.#export(c, d), massDelete: (c, d) => this.#massDelete(c, d), massTransfer: (c, d) => this.#massTransfer(c, d),
      testEmail: (c, d) => this.#testEmail(c, d), expirePasswords: (c) => this.#expirePasswords(c), webToCase: (c, d) => this.#webToCase(c, d),
    };
  }

  async run(ctx, page, input) {
    const meta = getToolMeta(page.key);
    if (!meta) return this.#record(ctx, page, input);
    const data = toolInputSchema(page.key).parse(input);
    const result = await this.handlers[meta.handler]({ ...ctx, pageKey: page.key }, data);
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, page.key, 'tool', `Ran ${page.name}: ${result.message}`);
    return result;
  }

  async #record(ctx, page, input) {
    await this.repos.setupRecords.insert(ctx.workspaceId, 'tool-runs', { label: page.name, status: 'Recorded', data: { page: page.key, input }, createdBy: ctx.userId });
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, page.key, 'tool', `Requested ${page.name} (engine not active)`);
    return { ok: true, active: false, message: `${page.name} was recorded. This tool's engine is not active yet, so nothing was changed.` };
  }

  #collectionFor(object) {
    const key = importableObjects()[object];
    const collection = key && getCollection(key);
    if (!collection) throw new NotFoundError('Unknown object');
    return collection;
  }

  async #import(ctx, { object, csv }) {
    const collection = this.#collectionFor(object);
    let parsed;
    try { parsed = parseCsv(csv, IMPORT_MAX_ROWS); } catch (e) { throw new ValidationError(undefined, e.message); }
    const { header, rows } = parsed;
    if (!rows.length) throw new ValidationError(undefined, 'The CSV has no data rows');
    const schema = recordSchemas(collection).create;
    const columnOf = Object.fromEntries(collection.columns.flatMap((c) => [[c.key.toLowerCase(), c.key], [c.label.toLowerCase(), c.key]]));
    const mapped = header.map((h) => columnOf[h.trim().toLowerCase()] ?? null);
    const label = labelKey(collection); const status = statusKey(collection);
    const valid = []; const errors = [];
    rows.forEach((row, i) => {
      const record = {};
      mapped.forEach((key, c) => {
        if (!key || row[c] === undefined || row[c] === '') return;
        const column = collection.columns.find((x) => x.key === key);
        record[key] = column.type === 'check' ? /^(true|yes|1|y)$/i.test(row[c]) : row[c];
      });
      const result = schema.safeParse(record);
      if (result.success) valid.push({ label: result.data[label], status: status ? result.data[status] ?? null : null, data: result.data });
      else if (errors.length < 5) errors.push(`Row ${i + 2}: ${result.error.issues[0].message} (${result.error.issues[0].path.join('.') || 'row'})`);
    });
    for (let i = 0; i < valid.length; i += BATCH) await this.repos.setupRecords.insertMany(ctx.workspaceId, collection.key, valid.slice(i, i + BATCH), ctx.userId);
    await this.records.changed(ctx, collection, 'import', `Imported ${valid.length} ${collection.name} record(s)`);
    return { ok: true, active: true, imported: valid.length, skipped: rows.length - valid.length, errors, unmappedColumns: header.filter((_, i) => !mapped[i]), message: `Imported ${valid.length} of ${rows.length} rows${valid.length < rows.length ? ` (${rows.length - valid.length} skipped)` : ''}.` };
  }

  /** Streams CSV in keyset batches: memory stays flat for any table size. */
  async *exportRows(ctx, objectLabel) {
    const collection = this.#collectionFor(objectLabel);
    yield toCsv([collection.columns.map((c) => c.label)]);
    let after; let sent = 0;
    while (sent < EXPORT_MAX_ROWS) {
      const rows = await this.repos.setupRecords.list(ctx.workspaceId, collection.key, { after }, 1000);
      if (!rows.length) break;
      yield toCsv(rows.map((r) => collection.columns.map((c) => r.data[c.key] ?? '')));
      sent += rows.length; after = rows.at(-1).id;
      if (rows.length < 1000) break;
    }
  }

  async #export(ctx, { object }) {
    return { ok: true, active: true, download: { url: `/api/v1/setup/pages/${ctx.pageKey}/export?object=${encodeURIComponent(object)}`, filename: `${object}.csv` }, message: `Preparing ${object}.csv` };
  }

  async #massDelete(ctx, { object }) {
    const collection = this.#collectionFor(object);
    const removed = await this.repos.setupRecords.removeWhere(ctx.workspaceId, collection.key);
    await this.records.changed(ctx, collection, 'mass-delete', `Mass deleted ${removed} ${collection.name} record(s)`);
    return { ok: true, active: true, removed, message: `Deleted ${removed} ${collection.name} record(s).` };
  }

  async #massTransfer(ctx, { object, from, to }) {
    const collection = this.#collectionFor(object);
    const [a, b] = await Promise.all([from, to].map((e) => this.#member(ctx.workspaceId, e)));
    const moved = await this.repos.setupRecords.reassignCreator(ctx.workspaceId, collection.key, a, b);
    await this.records.changed(ctx, collection, 'mass-transfer', `Transferred ${moved} ${collection.name} record(s)`);
    return { ok: true, active: true, moved, message: `Transferred ${moved} record(s).` };
  }

  async #member(ws, email) {
    const user = await this.repos.users.findByEmail(email.toLowerCase());
    if (!user || !(await this.repos.memberships.find(ws, user.id))) throw new ValidationError(undefined, `${email} is not a member of this workspace`);
    return user.id;
  }

  async #testEmail(ctx, { email }) {
    await this.mail.send('test_email', email.toLowerCase(), { workspace: ctx.workspaceName ?? 'your workspace' });
    return { ok: true, active: true, message: `A test email was queued for ${email}.` };
  }

  async #expirePasswords(ctx) {
    await this.boss.send(QUEUES.EXPIRE_PASSWORDS, { workspaceId: ctx.workspaceId, actorId: ctx.userId });
    return { ok: true, active: true, message: 'Started. Everyone else will be signed out and emailed a link to choose a new password.' };
  }

  async #webToCase(ctx, { return_url: returnUrl = '', fields = 'Name, Email, Subject, Description' }) {
    const rows = { Name: 'name', Email: 'email', Subject: 'subject', Description: 'description' };
    const inputs = fields.split(', ').map((f) => `  <label>${f} <${f === 'Description' ? 'textarea' : 'input'} name="${rows[f]}"${f === 'Description' ? '></textarea>' : ' />'}</label>`).join('\n');
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = `<form action="${esc(`/api/v1/public/cases/${ctx.workspaceId}`)}" method="POST">\n  <input type="hidden" name="return_url" value="${esc(returnUrl)}" />\n${inputs}\n  <button type="submit">Submit</button>\n</form>`;
    return { ok: true, active: true, output: html, message: 'HTML generated. The receiving endpoint is not active yet, so submissions will not create cases.' };
  }
}
