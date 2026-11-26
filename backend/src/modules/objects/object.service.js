import { STANDARD_OBJECTS, isKnownObject } from '@app/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { AUTOFILL_KINDS } from './engine/autofill.js';
import { LINES_FUNCTIONS, OPERATORS, REF_SOURCES, USER_REFS, CONTEXT_REFS, conditionRefs } from './engine/conditions.js';
import { evaluateObject } from './engine/evaluate.js';
import { FIELD_TYPES, fieldTypeCatalog, parseSettings, settingReferences } from './engine/fieldTypes.js';
import { RULE_EFFECTS } from './engine/rules.js';
import { VALIDATION_KINDS, validateFieldValue } from './engine/validation.js';
import { expressionRefs, parseExpression } from './engine/expression.js';
import { fieldBodySchema, fieldPatchSchema, objectBodySchema, objectPatchSchema } from './schemas.js';

const NS = (tenantId) => `objdef:${tenantId}`;
const TTL = { ttlMs: 60_000 };
// Names from the frontend's icon set (components/ui/Icon.jsx) — an object picks one of these.
const ICONS = ['layers', 'building', 'users', 'user', 'target', 'briefcase', 'life-buoy', 'megaphone', 'check-square', 'trend-up', 'package', 'folder', 'calendar', 'mail', 'phone', 'tag', 'star', 'flag', 'globe', 'server', 'shield', 'database', 'cube', 'rocket', 'key', 'home', 'chat', 'grid'];
const COLOURS = ['gray', 'brand', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'indigo'];

const objectDto = (o) => ({
  id: o.id, key: o.key, label: o.label, pluralLabel: o.pluralLabel, description: o.description, icon: o.icon, color: o.color, kind: o.kind, workspaceScope: o.workspaceScope,
  hasOwner: o.hasOwner, allowReports: o.allowReports, allowActivities: o.allowActivities, allowAttachments: o.allowAttachments, trackHistory: o.trackHistory, allowSearch: o.allowSearch,
  recordName: o.recordName, recordRules: o.recordRules, deploymentStatus: o.deploymentStatus, archivedAt: o.archivedAt, createdAt: o.createdAt, updatedAt: o.updatedAt, ...(o.fieldCount === undefined ? {} : { fieldCount: o.fieldCount }),
});
const fieldDto = (f) => ({
  id: f.id, objectId: f.objectId, key: f.key, label: f.label, type: f.type, helpText: f.helpText, description: f.description, required: f.required, unique: f.isUnique, indexed: f.indexed,
  encrypted: f.encrypted, readOnly: f.readOnly, defaultValue: f.defaultValue ?? null, settings: f.settings, rules: f.rules, validations: f.validations, autofill: f.autofill, section: f.section,
  sortOrder: f.sortOrder, system: f.system, active: f.active, createdAt: f.createdAt, updatedAt: f.updatedAt,
});

/** Object and field definitions: configuration only. Everything about how a field behaves is validated and evaluated here. */
export class ObjectService {
  constructor({ repos, cache, sequences }) { Object.assign(this, { repos, cache, sequences }); }

  meta() {
    return {
      fieldTypes: fieldTypeCatalog(), operators: OPERATORS, refSources: REF_SOURCES, userRefs: USER_REFS, contextRefs: CONTEXT_REFS, linesFunctions: LINES_FUNCTIONS,
      standardObjects: STANDARD_OBJECTS.map((o) => ({ key: o.key, label: o.key })), orgRoles: ['owner', 'admin', 'member', 'viewer'],
      ruleEffects: RULE_EFFECTS, validationKinds: VALIDATION_KINDS, autofillKinds: AUTOFILL_KINDS, icons: ICONS, colours: COLOURS,
      formulaFunctions: ['IF', 'AND', 'OR', 'NOT', 'ROUND', 'ABS', 'MIN', 'MAX', 'SUM', 'COUNT', 'CONCAT', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'ISBLANK', 'TEXT', 'TODAY', 'NOW', 'FLOOR', 'CEIL'],
    };
  }

  // ------------------------------------------------------------------------------------------------------------- objects

  async listObjects(tenantId, query) { const { items, total } = await this.repos.objects.listObjects(tenantId, query); return { items: items.map(objectDto), total }; }

  /** One object with all its fields (cached per tenant, dropped on any change). */
  async get(tenantId, id) {
    const hit = await this.cache.rememberValue(NS(tenantId), `o:${id}`, TTL, async () => {
      const object = await this.repos.objects.findObject(tenantId, id);
      return object ? { object: objectDto(object), fields: (await this.repos.objects.allFields(tenantId, id)).map(fieldDto) } : null;
    });
    if (!hit) throw new NotFoundError('Object not found');
    return hit;
  }

  async createObject({ tenantId, userId, body }) {
    if (isKnownObject(body.key)) throw new ConflictError('That name is used by a standard object');
    const object = await this.repos.objects.createObject({ ...body, tenantId, kind: 'custom', createdBy: userId }).catch(this.#conflict('An object with that name already exists'));
    await this.#changed(tenantId, userId, 'create', `Created object ${object.label}`);
    return objectDto(object);
  }

  async updateObject({ tenantId, userId, id, body }) {
    const { fields } = await this.get(tenantId, id);
    if (body.recordName?.kind === 'field' && body.recordName.fieldKey && !fields.some((f) => f.key === body.recordName.fieldKey)) throw new ValidationError({ recordName: 'Choose one of this object’s fields' });
    const updated = await this.repos.objects.updateObject(tenantId, id, body);
    await this.#changed(tenantId, userId, 'update', `Updated object ${updated.label}`);
    return objectDto(updated);
  }

  async setArchived({ tenantId, userId, id, archived }) {
    const object = await this.repos.objects.findObject(tenantId, id);
    if (!object) throw new NotFoundError('Object not found');
    if (object.kind === 'standard') throw new ConflictError('Standard objects can’t be archived');
    await this.repos.objects.updateObject(tenantId, id, { archivedAt: archived ? new Date() : null });
    await this.#changed(tenantId, userId, archived ? 'archive' : 'restore', `${archived ? 'Archived' : 'Restored'} object ${object.label}`);
  }

  // ------------------------------------------------------------------------------------------------------------- fields

  async listFields(tenantId, objectId, query) {
    await this.get(tenantId, objectId);
    const types = query.group ? Object.values(FIELD_TYPES).filter((t) => t.group === query.group).map((t) => t.id) : undefined;
    const flagged = query.flag === 'computed' ? Object.values(FIELD_TYPES).filter((t) => t.computed).map((t) => t.id) : undefined;
    const { items, total } = await this.repos.objects.listFields(tenantId, objectId, { ...query, flag: query.flag === 'computed' ? undefined : query.flag, types: flagged ?? types });
    return { items: items.map(fieldDto), total };
  }

  async createField({ tenantId, userId, objectId, body }) {
    const { object, fields } = await this.get(tenantId, objectId);
    if (object.archivedAt) throw new ConflictError('This object is archived');
    const draft = await this.#normalise(tenantId, object, fields, body, null);
    const row = await this.repos.objects.createField({ tenantId, objectId, ...draft, sortOrder: await this.repos.objects.nextSortOrder(objectId) }).catch(this.#conflict('A field with that name already exists'));
    await this.#changed(tenantId, userId, 'field-create', `Added field ${row.label} to ${object.label}`);
    return fieldDto(row);
  }

  async updateField({ tenantId, userId, objectId, fieldId, body }) {
    const { object, fields } = await this.get(tenantId, objectId);
    const current = fields.find((f) => f.id === fieldId);
    if (!current) throw new NotFoundError('Field not found');
    if (current.system && (body.required !== undefined || body.settings !== undefined || body.encrypted !== undefined)) throw new ConflictError('A system field’s behaviour can’t be changed');
    const merged = { ...current, ...body, key: current.key, type: current.type };
    const draft = await this.#normalise(tenantId, object, fields, merged, current);
    const row = await this.repos.objects.updateField(tenantId, objectId, fieldId, draft);
    await this.#changed(tenantId, userId, 'field-update', `Updated field ${row.label} on ${object.label}`);
    return fieldDto(row);
  }

  async deleteField({ tenantId, userId, objectId, fieldId }) {
    const { object, fields } = await this.get(tenantId, objectId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundError('Field not found');
    if (field.system) throw new ConflictError('System fields can’t be deleted');
    const users = fields.filter((f) => f.id !== fieldId && this.#dependencies(f).has(field.key)).map((f) => f.label);
    const elsewhere = await this.repos.objects.fieldsMentioning(tenantId, object.key, field.key, objectId);
    if (users.length || elsewhere.length) throw new ConflictError(`Still used by: ${[...users, ...elsewhere].slice(0, 6).join(', ')}`);
    await this.repos.objects.deleteField(tenantId, objectId, fieldId);
    await this.#changed(tenantId, userId, 'field-delete', `Deleted field ${field.label} from ${object.label}`);
  }

  async reorder({ tenantId, userId, objectId, ids }) {
    const { object, fields } = await this.get(tenantId, objectId);
    if (new Set(ids).size !== ids.length || ids.length !== fields.length || !ids.every((id) => fields.some((f) => f.id === id))) throw new ValidationError({ ids: 'Send every field of the object once' });
    await this.repos.objects.setOrder(tenantId, objectId, ids);
    await this.#changed(tenantId, userId, 'field-order', `Reordered fields of ${object.label}`);
  }

  // ------------------------------------------------------------------------------------------------------------- evaluate + options

  async personFor(tenantId, auth, membership, workspaceId) {
    const access = await this.repos.objects.personAccess(tenantId, auth.userId);
    return { userId: auth.userId, role: membership.role, profile: access.profile, permissionSets: access.permissionSets, workspaceId };
  }

  /** Resolves every field (visible, required, read-only, options, autofill, formula values, errors) for the values given. */
  async evaluate({ tenantId, objectId, body, person }) {
    const { object, fields } = await this.get(tenantId, objectId);
    const as = body.as ?? {};
    const ctx = {
      this: body.values, original: body.original, lines: body.lines, parent: body.parent, related: body.related, now: new Date(),
      user: { id: person.userId, role: as.role ?? person.role, profile: as.profile ?? person.profile, permissionSets: as.permissionSets ?? person.permissionSets ?? [], workspaceId: person.workspaceId },
      context: { ...body.context, isOwner: body.context.isOwner ?? true },
    };
    if (body.context.mode === 'create') {
      const previews = {};
      for (const f of fields.filter((x) => x.type === 'auto_number' && x.active)) previews[f.key] = (await this.sequences.peek({ tenantId, workspaceId: person.workspaceId, field: { ...f, objectId } })).value;
      ctx.sequencePreviews = previews;
    }
    return evaluateObject({ fields, recordRules: object.recordRules, values: body.values, ctx });
  }

  /** Where an auto-number counter stands, and what its format looks like. */
  async sequenceStatus({ tenantId, objectId, fieldId, person }) {
    const { fields } = await this.get(tenantId, objectId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field || field.type !== 'auto_number') throw new NotFoundError('Auto-number field not found');
    const f = { ...field, objectId };
    const next = await this.sequences.peek({ tenantId, workspaceId: person.workspaceId, field: f });
    return { next: next.value, lastIssued: next.taken, examples: this.sequences.example({ format: field.settings.format, start: field.settings.start, increment: field.settings.increment }) };
  }

  /** Choices for a picker, searched and limited on the server. */
  async options({ tenantId, objectId, fieldId, query, person }) {
    const { fields } = await this.get(tenantId, objectId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundError('Field not found');
    const s = field.settings ?? {}; const q = query.q.toLowerCase();
    const match = (label) => !q || String(label).toLowerCase().includes(q);
    if (field.type === 'picklist' || field.type === 'multi_picklist') return { items: (s.values ?? []).filter((v) => v.active !== false && match(v.label)).slice(0, query.limit).map((v) => ({ value: v.value, label: v.label, color: v.color })), available: true };
    if (field.type === 'status_path') return { items: (s.stages ?? []).filter((v) => match(v.label)).slice(0, query.limit).map((v) => ({ value: v.value, label: v.label })), available: true };
    if (field.type === 'tags') return { items: (s.allowed ?? []).filter(match).slice(0, query.limit).map((v) => ({ value: v, label: v })), available: true };
    if (field.type === 'user') return { items: await this.repos.objects.searchPeople(tenantId, person.workspaceId, s, query.q, query.limit), available: true };
    if (['lookup', 'master_detail', 'many_to_many', 'polymorphic'].includes(field.type)) return { items: [], available: false, reason: 'Records of other objects are not available yet.' };
    throw new ValidationError({ field: 'This field has no choices' });
  }

  // ------------------------------------------------------------------------------------------------------------- internals

  async #normalise(tenantId, object, fields, input, current) {
    const type = FIELD_TYPES[input.type];
    const issues = [];
    const parsed = parseSettings(input.type, input.settings);
    if (parsed.issues) issues.push(...parsed.issues);
    if (input.encrypted && !type.encryptable && !type.alwaysEncrypted) issues.push({ path: 'encrypted', message: `${type.label} fields can’t be encrypted` });
    if (input.unique && !type.unique) issues.push({ path: 'unique', message: `${type.label} fields can’t be unique` });
    if (type.computed && (input.required || input.unique || input.indexed)) issues.push({ path: 'required', message: `${type.label} fields are calculated and can’t be required, unique or indexed` });
    const encrypted = Boolean(input.encrypted) || Boolean(type.alwaysEncrypted);
    if (encrypted && input.unique) issues.push({ path: 'unique', message: 'An encrypted field can’t be unique (its value can’t be compared)' });
    if (encrypted && input.indexed) issues.push({ path: 'indexed', message: 'An encrypted field can’t be indexed' });
    if (issues.length) throw new ValidationError(Object.fromEntries(issues.map((i) => [i.path, i.message])));

    const settings = parsed.settings;
    await this.#checkReferences(tenantId, object, fields, input.type, settings, current);
    const draft = {
      key: input.key, label: input.label, type: input.type, helpText: input.helpText ?? '', description: input.description ?? '', required: Boolean(input.required) || Boolean(type.forceRequired),
      isUnique: Boolean(input.unique), indexed: Boolean(input.indexed) && !encrypted, encrypted, readOnly: Boolean(input.readOnly), defaultValue: input.defaultValue ?? null,
      settings, rules: input.rules ?? [], validations: input.validations ?? [], autofill: input.autofill ?? [], section: input.section ?? '', active: input.active !== false,
    };
    this.#checkFieldKeys(draft, fields, current);
    this.#checkCycles(draft, fields, current);
    if (draft.defaultValue !== null && draft.defaultValue !== undefined && !type.computed) {
      const errors = validateFieldValue({ ...draft }, draft.defaultValue, { context: { mode: 'create' }, this: {}, user: {} }, { visible: true, required: false, readOnly: false, options: null });
      if (errors.length) throw new ValidationError({ defaultValue: errors[0].message });
    }
    return draft;
  }

  async #checkReferences(tenantId, object, fields, typeId, settings, current) {
    const refs = settingReferences(typeId, settings);
    const own = new Set(fields.filter((f) => f.id !== current?.id).map((f) => f.key.toLowerCase()));
    const known = new Set((await this.repos.objects.keysOf(tenantId)).map((k) => k.toLowerCase()));
    for (const key of refs.objects) if (!known.has(key.toLowerCase()) && !isKnownObject(key)) throw new ValidationError({ settings: `Unknown object ${key}` });
    for (const key of ['currencyField', 'controllingField']) if (settings[key] && !own.has(settings[key].toLowerCase())) throw new ValidationError({ [`settings.${key}`]: `Unknown field ${settings[key]}` });
    if (typeId === 'line_items') { const line = await this.repos.objects.findObjectByKey(tenantId, settings.lineObject); if (!line) throw new ValidationError({ 'settings.lineObject': 'Choose an object you created' }); }
    if (typeId === 'rollup' && settings.fn !== 'count' && !settings.childField) throw new ValidationError({ 'settings.childField': 'Choose the field to summarise' });
    if (typeId === 'formula') { try { parseExpression(settings.expression); } catch (e) { throw new ValidationError({ 'settings.expression': e.message }); } }
  }

  /** `this.X` references in rules, validations, autofill and formulas must name real fields of this object. */
  #checkFieldKeys(draft, fields, current) {
    const keys = new Set([...fields.filter((f) => f.id !== current?.id).map((f) => f.key), draft.key].map((k) => k.toLowerCase()));
    for (const ref of this.#dependencies(draft, true)) if (!keys.has(ref.toLowerCase())) throw new ValidationError({ conditions: `Unknown field ${ref}` });
  }

  /** Fields a field's behaviour depends on (same object): conditions, formulas, autofill. `withSelf` keeps a reference to the field itself. */
  #dependencies(field, withSelf = false) {
    const out = new Set();
    const add = (ref) => { const m = /^(?:this|line)\.([A-Za-z]\w*)/.exec(ref); if (m && ref.startsWith('this.')) out.add(m[1]); };
    const walk = (cond) => conditionRefs(cond).forEach(add);
    for (const r of field.rules ?? []) if (r.effect !== 'show' || true) walk(r.condition);
    for (const v of field.validations ?? []) { walk(v.when); if (v.condition) walk(v.condition); if (v.expression) { try { expressionRefs(parseExpression(v.expression)).forEach(add); } catch { /* reported on save */ } } }
    for (const a of field.autofill ?? []) { walk(a.condition); if (a.source) add(a.source); if (a.whenField) out.add(a.whenField); if (a.expression) { try { expressionRefs(parseExpression(a.expression)).forEach(add); } catch { /* reported on save */ } } }
    if (field.type === 'formula' && field.settings?.expression) { try { expressionRefs(parseExpression(field.settings.expression)).forEach(add); } catch { /* reported on save */ } }
    for (const key of ['currencyField', 'controllingField']) if (field.settings?.[key]) out.add(field.settings[key]);
    if (!withSelf) out.delete(field.key);
    return out;
  }

  /** A field may not (indirectly) depend on itself through formulas, autofill or default rules. */
  #checkCycles(draft, fields, current) {
    const all = [...fields.filter((f) => f.id !== current?.id), draft];
    const edges = new Map(all.map((f) => [f.key.toLowerCase(), [...this.#dependencies(f, true)].map((k) => k.toLowerCase())]));
    const state = new Map();
    const visit = (k, path) => {
      if (state.get(k) === 'done') return;
      if (state.get(k) === 'busy') throw new ValidationError({ conditions: `These fields depend on each other: ${[...path, k].join(' → ')}` });
      state.set(k, 'busy');
      for (const next of edges.get(k) ?? []) if (edges.has(next) && next !== k) visit(next, [...path, k]); else if (next === k && this.#selfDepends(draft, k)) throw new ValidationError({ conditions: `${draft.label} can’t depend on itself` });
      state.set(k, 'done');
    };
    for (const k of edges.keys()) visit(k, []);
  }

  /** Rules and validations may read the field they belong to; only formulas, autofill and defaults may not. */
  #selfDepends(draft, key) {
    if (draft.key.toLowerCase() !== key) return false;
    const refs = new Set();
    const add = (ref) => { const m = /^this\.([A-Za-z]\w*)/.exec(ref); if (m) refs.add(m[1].toLowerCase()); };
    for (const a of draft.autofill ?? []) { if (a.source) add(a.source); if (a.expression) { try { expressionRefs(parseExpression(a.expression)).forEach(add); } catch { /* */ } } }
    for (const r of draft.rules ?? []) if (r.effect === 'set_default') conditionRefs(r.condition).forEach(add);
    if (draft.type === 'formula' && draft.settings?.expression) { try { expressionRefs(parseExpression(draft.settings.expression)).forEach(add); } catch { /* */ } }
    return refs.has(key);
  }

  #conflict(message) { return (error) => { if (error?.code === '23505' || error?.cause?.code === '23505') throw new ConflictError(message); throw error; }; }

  async #changed(tenantId, userId, action, summary) {
    await Promise.all([this.cache.bump(NS(tenantId)), this.repos.auditLog.record(tenantId, userId, 'objects', action, summary)]);
  }
}

export { objectBodySchema, objectPatchSchema, fieldBodySchema, fieldPatchSchema };
