import { appLink } from '../../shared/links.js';

const BATCH = 200;
const TTL_MS = 24 * 3_600_000;

/** Background job body: signs members out and mails them a reset link, in keyset batches (safe for very large workspaces). */
export class PasswordExpiryService {
  constructor({ repos, oneTime, mail, logger }) { Object.assign(this, { repos, oneTime, mail, logger }); }

  async run({ workspaceId, actorId }) {
    let after; let done = 0;
    for (;;) {
      const rows = await this.repos.memberships.listMembers(workspaceId, { limit: BATCH, after });
      for (const m of rows) {
        if (m.userId === actorId) continue;
        await this.repos.sessions.revokeAllForUser(m.userId, 'admin_expired');
        const token = await this.oneTime.issueLink(m.userId, 'password_reset', { ttlMs: TTL_MS });
        await this.mail.send('password_expired', m.email, { url: appLink('/reset-password', { token }), ttlMinutes: TTL_MS / 60_000 });
        done++;
      }
      if (rows.length < BATCH) break;
      const last = rows.at(-1); after = { createdAt: last.cursorTs, userId: last.userId };
    }
    this.logger.info({ workspaceId, done }, 'expired passwords');
    return done;
  }
}
