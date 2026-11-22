import { APPROVAL_STATUS, RULE_COLLECTIONS, fieldKey } from '@app/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { matchesCriteria } from './criteria.js';

const objectColl = (key) => `obj:${key}`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ownerKey = (def) => def.fields.find((f) => /owner/.test(f.key))?.key;

/**
 * Runs the Setup rules on object records. Rules are ordinary Setup records (cached 30 s per workspace); a rule only
 * acts when it is Active, matches the object, passes its criteria AND has its action configured — otherwise it is inert.
 */
export class AutomationService {
  constructor({ repos, cache, mail, logger }) { Object.assign(this, { repos, cache, mail, logger }); }

  rules(ws, collection) {
    return this.cache.rememberValue(`r:${ws}:${collection}`, 'rules', { ttlMs: 30_000 }, async () =>
      (await this.repos.setupRecords.listAll(ws, collection)).map((r) => ({ id: r.id, name: r.label, data: r.data })));
  }

  /** Active rules of the given kinds that apply to this object. */
  async applicable(ws, kind, objectKey) {
    const collections = Object.entries(RULE_COLLECTIONS).filter(([, m]) => m.kind === kind);
    const lists = await Promise.all(collections.map(async ([collection, meta]) => (await this.rules(ws, collection))
      .filter((r) => r.data[meta.active.key] === meta.active.value && (meta.object ?? r.data[meta.objectColumn]) === objectKey)
      .map((r) => ({ ...r, collection, meta }))));
    return lists.flat();
  }

  /** Before the record is written: owner assignment (create) and duplicate detection. Returns { data, warnings }. */
  async beforeSave(ctx, def, data, { mode, id }) {
    const out = { ...data }; const warnings = [];
    if (mode === 'create') {
      const owner = ownerKey(def);
      const rule = owner && (await this.applicable(ctx.workspaceId, 'assignment', def.key)).find((r) => r.data.assign_to && matchesCriteria(r, out));
      if (rule) out[owner] = rule.data.assign_to;
    }
    for (const rule of await this.applicable(ctx.workspaceId, 'duplicate', def.key)) {
      const field = await this.#matchField(ctx.workspaceId, rule);
      const value = field && out[field];
      if (value === undefined || value === '') continue;
      const existing = await this.repos.setupRecords.findByData(ctx.workspaceId, objectColl(def.key), { [field]: value }, id);
      if (!existing) continue;
      const block = (rule.data.duplicate_action || 'Block') === 'Block';
      await this.repos.setupRecords.insert(ctx.workspaceId, 'duplicate-error-logs', {
        label: existing.label, data: { record: existing.label, object: def.key, rule: rule.name, action: block ? 'Blocked' : 'Allowed (alert)', date: new Date().toISOString() }, createdBy: ctx.userId,
      });
      await this.cache.bump(`r:${ctx.workspaceId}:duplicate-error-logs`);
      if (block) throw new ConflictError(`Duplicate: “${existing.label}” already has the same ${field.replace(/_/g, ' ')} (rule: ${rule.name})`);
      warnings.push(`Possible duplicate of “${existing.label}” (rule: ${rule.name})`);
    }
    return { data: out, warnings };
  }

  async #matchField(ws, rule) {
    if (rule.data.match_field) return fieldKey(rule.data.match_field);
    const matching = (await this.rules(ws, 'matching-rules')).find((m) => m.name === rule.data.matching_rule && m.data.status === 'Active');
    return matching?.data.match_field ? fieldKey(matching.data.match_field) : null;
  }

  /** After the record is saved: workflow/process/flow actions, auto-response, approval entry. Returns the (possibly updated) row. */
  async afterSave(ctx, def, row, { mode }) {
    let current = row;
    const patch = {};
    const ws = ctx.workspaceId;

    for (const rule of await this.applicable(ws, 'workflow', def.key)) {
      const everyEdit = !rule.meta.triggerColumn || /every time/i.test(rule.data[rule.meta.triggerColumn] ?? '');
      if ((mode === 'update' && !everyEdit) || !matchesCriteria(rule, { ...current.data, ...patch })) continue;
      const { action_type: type, action_field: field, action_value: value } = rule.data;
      if (type === 'Field update' && field) patch[fieldKey(field)] = value ?? '';
      else if (type === 'Email alert') await this.#email(field?.includes('@') ? field : current.data[fieldKey(field ?? '')], rule.name, value);
      else if (type === 'Create task' && value) {
        await this.repos.setupRecords.insert(ws, objectColl('Task'), { label: value, status: 'Open', data: { subject: value, status: 'Open', related_to: current.label, created_by_rule: rule.name }, createdBy: ctx.userId });
        await this.cache.bump(`r:${ws}:${objectColl('Task')}`);
      }
    }

    if (mode === 'create') {
      const response = (await this.applicable(ws, 'autoResponse', def.key)).find((r) => r.data.email_subject && matchesCriteria(r, current.data));
      if (response) await this.#email(current.data.email ?? current.data.web_email, response.data.email_subject, response.data.email_body);
    }

    if (!current.data.approval_status) {
      const process = (await this.applicable(ws, 'approval', def.key)).find((r) => r.data.approver && matchesCriteria(r, { ...current.data, ...patch }));
      if (process) {
        Object.assign(patch, { approval_status: APPROVAL_STATUS.PENDING, approval_process: process.name, approver: process.data.approver });
        await this.#email(process.data.approver, `Approval needed: ${current.label}`, `${process.name} requires your decision on ${def.key} “${current.label}”.`);
      }
    }

    if (Object.keys(patch).length) current = (await this.repos.setupRecords.update(ws, objectColl(def.key), row.id, { data: patch })) ?? current;
    return current;
  }

  async #email(to, subject, body) {
    if (to && EMAIL.test(String(to))) await this.mail.send('notification', String(to).toLowerCase(), { subject, body });
  }

  /** Approve / reject a record waiting for the approver (or any admin). */
  async decide(ctx, def, id, { decision, comment }) {
    const row = await this.repos.setupRecords.get(ctx.workspaceId, objectColl(def.key), id);
    if (!row) throw new NotFoundError('Record not found');
    if (row.data.approval_status !== APPROVAL_STATUS.PENDING) throw new ValidationError(undefined, 'This record is not waiting for approval');
    const isApprover = ctx.email && row.data.approver?.toLowerCase() === ctx.email.toLowerCase();
    if (!isApprover && !['owner', 'admin'].includes(ctx.actor.role)) throw new ForbiddenError('Only the approver or an admin can decide');
    const status = decision === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    const updated = await this.repos.setupRecords.update(ctx.workspaceId, objectColl(def.key), id, { data: { approval_status: status, approval_decided_by: ctx.email ?? '', approval_comment: comment ?? '' } });
    await this.repos.setupAudit.record(ctx.workspaceId, ctx.userId, 'approval-processes', 'approval', `${status} ${def.key} “${row.label}”`);
    await this.cache.bump(`r:${ctx.workspaceId}:${objectColl(def.key)}`);
    return updated;
  }
}
