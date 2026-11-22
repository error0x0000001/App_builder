import { decodeCursor, paginate } from '../../shared/pagination.js';

export class AuditService {
  constructor({ repos, logger }) { this.repos = repos; this.logger = logger; }

  /** Never throws: auditing must not break the request it describes. */
  async record(type, { userId, workspaceId, ctx, metadata } = {}) {
    try {
      await this.repos.audit.record({ type, userId, workspaceId, ip: ctx?.ip, userAgent: ctx?.userAgent, metadata });
    } catch (error) {
      this.logger.error({ err: error, type }, 'failed to record audit event');
    }
  }

  list(userId, { limit, after }) {
    return paginate((n) => this.repos.audit.listForUser(userId, { limit: n, after: decodeCursor(after) }), limit, (last) => last.id);
  }
}
