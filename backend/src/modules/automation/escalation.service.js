import { businessHoursBetween, parseHoursConfig, parseHoliday } from './businessHours.js';
import { matchesCriteria } from './criteria.js';

const BATCH = 500;

/**
 * Scheduled job: reassigns cases that stayed open past an Escalation Rule's threshold and logs them in Case Escalations.
 * The threshold counts **business hours** (default active Business Hours row, minus its Holidays) when one is defined;
 * otherwise plain elapsed hours.
 */
export class EscalationService {
  constructor({ repos, automation, cache, logger }) { Object.assign(this, { repos, automation, cache, logger }); }

  /** Elapsed-time function for a workspace: business hours if configured, wall clock otherwise. */
  async #clock(ws) {
    const hours = (await this.automation.rules(ws, 'business-hours')).findLast( // if several rows claim to be the default, the newest (most recently configured) wins
      (h) => h.data.active === 'Active' && String(h.data.default).toLowerCase() === 'yes');
    if (!hours) return (from, to) => (to - from) / 3_600_000;
    const cfg = parseHoursConfig(hours.data);
    const holidays = (await this.automation.rules(ws, 'holidays')).filter((h) => !h.data.business_hours || h.data.business_hours === hours.name).map((h) => parseHoliday(h.data)).filter(Boolean);
    return (from, to) => businessHoursBetween(from, to, cfg, holidays);
  }

  /** Cases past each active rule's threshold right now. `apply` = actually reassign (the job); false = preview. */
  async #scan(ws, apply) {
    const clock = await this.#clock(ws);
    const found = [];
    for (const rule of await this.automation.applicable(ws, 'escalation', 'Case')) {
      const hours = Number(rule.data.escalate_after_hours); const to = rule.data.assign_to;
      if (!Number.isFinite(hours) || hours <= 0 || !to) continue;
      const now = new Date();
      for (const c of await this.repos.setupRecords.listOlderThan(ws, 'obj:Case', hours, BATCH)) { // wall-clock >= business time, so this is a safe superset
        if (c.data.escalated_by_rule === rule.id || !matchesCriteria(rule, c.data) || clock(new Date(c.created_at), now) < hours) continue;
        found.push({ rule, record: c });
        if (!apply) continue;
        const owner = Object.keys(c.data).find((k) => /owner/.test(k)) ?? 'case_owner';
        await this.repos.setupRecords.update(ws, 'obj:Case', c.id, { data: { [owner]: to, escalated_by_rule: rule.id } });
        await this.repos.setupRecords.insert(ws, 'case-escalations', { label: c.label, data: { case: c.label, rule: rule.name, escalated: now.toISOString(), owner: to } });
      }
    }
    if (apply && found.length) await Promise.all(['obj:Case', 'case-escalations'].map((n) => this.cache.bump(`r:${ws}:${n}`)));
    return found;
  }

  async run() {
    let escalated = 0;
    for (const ws of await this.repos.setupRecords.workspacesWithActive('escalation-rules')) escalated += (await this.#scan(ws, true)).length;
    this.logger.info({ escalated }, 'case escalation run');
    return escalated;
  }

  /** What the next run would escalate, per rule (Time-Based Workflow page). */
  async preview(ws) {
    const byRule = new Map();
    for (const { rule, record } of await this.#scan(ws, false)) byRule.set(rule.name, [...(byRule.get(rule.name) ?? []), record.label]);
    return [...byRule].map(([rule, cases]) => ({ rule, count: cases.length, cases: cases.slice(0, 5) }));
  }
}
