import { matchesCriteria } from './criteria.js';

const BATCH = 500;

/** Scheduled job: reassigns cases that stayed open past an Escalation Rule's threshold and logs them in Case Escalations. */
export class EscalationService {
  constructor({ repos, automation, cache, logger }) { Object.assign(this, { repos, automation, cache, logger }); }

  async run() {
    let escalated = 0;
    for (const ws of await this.repos.setupRecords.workspacesWithActive('escalation-rules')) {
      for (const rule of await this.automation.applicable(ws, 'escalation', 'Case')) {
        const hours = Number(rule.data.escalate_after_hours); const to = rule.data.assign_to;
        if (!Number.isFinite(hours) || hours <= 0 || !to) continue;
        const candidates = await this.repos.setupRecords.listOlderThan(ws, 'obj:Case', hours, BATCH);
        for (const c of candidates) {
          if (c.data.escalated_by_rule === rule.id || !matchesCriteria(rule, c.data)) continue;
          const owner = Object.keys(c.data).find((k) => /owner/.test(k)) ?? 'case_owner';
          await this.repos.setupRecords.update(ws, 'obj:Case', c.id, { data: { [owner]: to, escalated_by_rule: rule.id } });
          await this.repos.setupRecords.insert(ws, 'case-escalations', { label: c.label, data: { case: c.label, rule: rule.name, escalated: new Date().toISOString(), owner: to } });
          escalated++;
        }
        if (candidates.length) await Promise.all(['obj:Case', 'case-escalations'].map((n) => this.cache.bump(`r:${ws}:${n}`)));
      }
    }
    this.logger.info({ escalated }, 'case escalation run');
    return escalated;
  }
}
