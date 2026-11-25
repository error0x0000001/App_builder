import { getToolMeta, toolInputSchema } from '@app/shared/setup-registry';
import { QUEUES } from '../../shared/queue.js';

/**
 * Runs the Setup "tool" pages. A tool without a real handler is recorded in the audit log and reported as not active — never faked.
 * Real today: sending a test email and expiring every password. Everything that worked on the generic record store (imports, exports, mass
 * changes, escalations) is gone with it and comes back when the real tables it needs exist.
 */
export class ToolsService {
  constructor({ repos, mail, boss }) {
    Object.assign(this, { repos, mail, boss });
    this.handlers = { testEmail: (c, d) => this.#testEmail(c, d), expirePasswords: (c) => this.#expirePasswords(c) };
  }

  async run(ctx, page, input) {
    const meta = getToolMeta(page.key);
    if (!meta) return this.#record(ctx, page);
    const data = toolInputSchema(page.key).parse(input);
    const result = await this.handlers[meta.handler]({ ...ctx, pageKey: page.key }, data);
    await this.repos.auditLog.record(ctx.tenantId, ctx.userId, page.key, 'tool', `Ran ${page.name}: ${result.message}`);
    return result;
  }

  async #record(ctx, page) {
    await this.repos.auditLog.record(ctx.tenantId, ctx.userId, page.key, 'tool', `Requested ${page.name} (engine not active)`);
    return { ok: true, active: false, message: `${page.name} was recorded. This tool's engine is not active yet, so nothing was changed.` };
  }

  async #testEmail(ctx, { email }) {
    await this.mail.send('test_email', email.toLowerCase(), { tenant: ctx.tenantName ?? 'your organisation' }, { tenantId: ctx.tenantId, kind: 'user' });
    return { ok: true, active: true, message: `A test email was queued for ${email}.` };
  }

  async #expirePasswords(ctx) {
    await this.boss.send(QUEUES.EXPIRE_PASSWORDS, { tenantId: ctx.tenantId, actorId: ctx.userId });
    return { ok: true, active: true, message: 'Started. Everyone else will be signed out and emailed a link to choose a new password.' };
  }
}
