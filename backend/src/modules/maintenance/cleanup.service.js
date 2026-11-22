const BATCH = 5000;
const AUDIT_RETENTION_DAYS = 180;

/** Purges expired rows in bounded batches so cleanup never holds long locks on large tables. */
export class CleanupService {
  constructor({ repos, logger }) { this.repos = repos; this.logger = logger; }

  async run() {
    const tasks = {
      sessions: () => this.repos.sessions.deleteExpired(BATCH),
      authTokens: () => this.repos.authTokens.deleteExpired(BATCH),
      invitations: () => this.repos.invitations.deleteExpired(BATCH),
      rateLimits: () => this.repos.rateLimits.deleteExpired(BATCH),
      emailLog: () => this.repos.setupRecords.deleteOlderThan('email-log', 30, BATCH),
      auditEvents: () => this.repos.audit.deleteOlderThan(AUDIT_RETENTION_DAYS, BATCH),
    };
    const totals = {};
    for (const [name, purge] of Object.entries(tasks)) {
      totals[name] = 0;
      for (let deleted = BATCH; deleted === BATCH;) {
        deleted = await purge();
        totals[name] += deleted;
      }
    }
    this.logger.info(totals, 'cleanup finished');
    return totals;
  }
}
