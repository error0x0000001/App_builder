import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';
import { compareDecimal, evaluateCondition } from '../src/modules/objects/engine/conditions.js';
import { evaluateExpression, parseExpression } from '../src/modules/objects/engine/expression.js';
import { parseSettings } from '../src/modules/objects/engine/fieldTypes.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const O = '/objects';
async function boss() { return (await registerUser(server)).client; }
async function newObject(c, key = 'Shipment') { return (await c.post(O, { key, label: key, pluralLabel: `${key}s` })).body.object; }
const addField = (c, obj, body) => c.post(`${O}/${obj.id}/fields`, { settings: {}, ...body });
const evaluate = (c, obj, body) => c.post(`${O}/${obj.id}/evaluate`, { context: { mode: 'create' }, ...body }).then((r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; });

describe('field engine (pure)', () => {
  it('compares decimals exactly, without floating point', () => {
    assert.equal(compareDecimal('1000', '1000.00'), 0);
    assert.equal(compareDecimal('0.1', '0.10'), 0);
    assert.equal(compareDecimal('-5', '3'), -1);
    assert.equal(compareDecimal('12345678901234567890.5', '12345678901234567890.4'), 1);
  });
  it('evaluates condition trees with the person, lines and the parent', () => {
    const ctx = { this: { stage: 'Won', amount: '1500' }, parent: { type: 'Wholesale' }, lines: [{ total: 10 }, { total: 15 }], user: { role: 'admin', permissionSets: ['Sales'] }, context: { mode: 'edit' } };
    assert.equal(evaluateCondition({ op: 'and', conditions: [{ ref: 'this.stage', operator: 'eq', value: 'Won' }, { ref: 'this.amount', operator: 'gt', value: '999.99' }] }, ctx), true);
    assert.equal(evaluateCondition({ ref: 'parent.type', operator: 'in', value: ['Retail', 'Wholesale'] }, ctx), true);
    assert.equal(evaluateCondition({ ref: 'lines.sum.total', operator: 'gte', value: 25 }, ctx), true);
    assert.equal(evaluateCondition({ ref: 'lines.count', operator: 'eq', value: 2 }, ctx), true);
    assert.equal(evaluateCondition({ ref: 'user.permissionSets', operator: 'contains', value: 'Sales' }, ctx), true);
    assert.equal(evaluateCondition({ op: 'not', condition: { ref: 'context.mode', operator: 'eq', value: 'create' } }, ctx), true);
  });
  it('formulas are safe: no code, no property access, bounded', () => {
    assert.equal(evaluateExpression('2 + 3 * 4', {}).value, 14);
    assert.equal(evaluateExpression("IF(stage == 'Won', 1, 0)", { this: { stage: 'Won' } }).value, 1);
    assert.equal(evaluateExpression('SUM(lines.total)', { lines: [{ total: 2 }, { total: 3 }] }).value, 5);
    for (const bad of ['constructor.constructor("x")()', 'process.exit()', 'this.__proto__', '1 +', 'eval(1)', '((((((((((((((((((((((((((((((((((((((((((((((1))))))))))))))))))))))))))))))))))))))))))))))']) {
      assert.throws(() => parseExpression(bad), undefined, bad);
    }
    assert.equal(evaluateExpression('1 / 0', {}).value, null, 'division by zero is blank, not a crash');
  });
  it('validates settings against the type', () => {
    assert.ok(parseSettings('lookup', {}).issues, 'a lookup needs a target');
    assert.ok(parseSettings('text', { nope: 1 }).issues, 'unknown settings are rejected');
    assert.ok(parseSettings('number', { min: '10', max: '1' }).issues, 'min above max');
    assert.ok(parseSettings('picklist', { values: [{ value: 'a', label: 'A' }, { value: 'A', label: 'Again' }] }).issues, 'duplicate values');
    assert.deepEqual(parseSettings('decimal', { min: '0' }).settings, { min: '0' });
  });
});

describe('objects and fields (configuration API)', () => {
  it('serves the registry the UI is generated from, to admins only', async () => {
    const c = await boss();
    const meta = (await c.get(`${O}/meta`)).body;
    assert.ok(meta.fieldTypes.length >= 40 && meta.operators.length && meta.ruleEffects.length);
    assert.ok(meta.fieldTypes.find((t) => t.id === 'checkbox'));
    const tenantId = (await c.get('/me')).body.activeTenantId;
    await c.post(`/tenants/${tenantId}/invitations`, { invitations: [{ email: uniqueEmail(), role: 'member' }] });
    const email = uniqueEmail();
    await c.post(`/tenants/${tenantId}/invitations`, { invitations: [{ email, role: 'member' }] });
    const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
    const member = new Client(server.base);
    await member.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
    await member.post(`/tenants/${tenantId}/switch`);
    assert.equal((await member.get(`${O}/meta`)).status, 403);
  });

  it('creates objects with unique keys, and keeps standard names to itself', async () => {
    const c = await boss();
    const inv = await newObject(c, 'Shipment');
    assert.equal(inv.kind, 'custom');
    assert.equal((await c.post(O, { key: 'shipment', label: 'x', pluralLabel: 'xs' })).status, 409, 'keys are unique ignoring case');
    assert.equal((await c.post(O, { key: 'Lead', label: 'Lead', pluralLabel: 'Leads' })).status, 409, 'a standard object name');
    assert.equal((await c.post(O, { key: '1bad', label: 'x', pluralLabel: 'xs' })).status, 400);
  });

  it('validates fields by type: settings, encryption, uniqueness and immutability', async () => {
    const c = await boss(); const inv = await newObject(c);
    assert.equal((await addField(c, inv, { key: 'amount', label: 'Amount', type: 'decimal', settings: { min: '0' } })).status, 201);
    assert.equal((await addField(c, inv, { key: 'Amount', label: 'Again', type: 'text' })).status, 409, 'field keys are unique ignoring case');
    assert.equal((await addField(c, inv, { key: 'cust', label: 'Customer', type: 'lookup' })).status, 400, 'lookup needs a target');
    assert.equal((await addField(c, inv, { key: 'x1', label: 'X', type: 'text', settings: { bogus: true } })).status, 400);
    assert.equal((await addField(c, inv, { key: 'stage', label: 'Stage', type: 'picklist', encrypted: true })).status, 400, 'a picklist can’t be encrypted');
    assert.equal((await addField(c, inv, { key: 'ssn', label: 'SSN', type: 'text', encrypted: true, unique: true })).status, 400, 'encrypted can’t be unique');
    assert.equal((await addField(c, inv, { key: 'b', label: 'B', type: 'checkbox', unique: true })).status, 400);
    const secret = (await addField(c, inv, { key: 'token', label: 'Token', type: 'password' })).body.field;
    assert.equal(secret.encrypted, true, 'a secret is always encrypted');
    const f = (await addField(c, inv, { key: 'note', label: 'Note', type: 'text', encrypted: true })).body.field;
    assert.equal((await c.patch(`${O}/${inv.id}/fields/${f.id}`, { type: 'number' })).status, 400, 'the type is fixed');
    assert.equal((await c.patch(`${O}/${inv.id}/fields/${f.id}`, { key: 'other' })).status, 400, 'the key is fixed');
    assert.equal((await c.patch(`${O}/${inv.id}/fields/${f.id}`, { label: 'Notes', helpText: 'Shown under the label' })).body.field.label, 'Notes');
  });

  it('rejects rules that point at unknown fields or depend on each other', async () => {
    const c = await boss(); const inv = await newObject(c);
    const rule = (field) => ({ id: 'r1', effect: 'show', condition: { ref: `this.${field}`, operator: 'eq', value: 'x' } });
    assert.equal((await addField(c, inv, { key: 'a', label: 'A', type: 'text', rules: [rule('ghost')] })).status, 400, 'unknown field');
    assert.equal((await addField(c, inv, { key: 'a', label: 'A', type: 'text' })).status, 201);
    assert.equal((await addField(c, inv, { key: 'b', label: 'B', type: 'formula', settings: { expression: 'a + 1' } })).status, 201);
    const a = (await c.get(`${O}/${inv.id}`)).body.fields.find((f) => f.key === 'a');
    assert.equal((await c.patch(`${O}/${inv.id}/fields/${a.id}`, { autofill: [{ id: 'f', kind: 'formula', expression: 'b * 2' }] })).status, 400, 'a and b would depend on each other');
    assert.equal((await addField(c, inv, { key: 'c', label: 'C', type: 'formula', settings: { expression: '1 +' } })).status, 400, 'a broken formula');
  });

  it('lists, searches, filters and sorts on the server', async () => {
    const c = await boss(); const inv = await newObject(c, 'Shipment');
    await newObject(c, 'Reservation');
    const names = async (q) => (await c.get(`${O}?${q}`)).body.items.map((o) => o.key);
    assert.deepEqual(await names('sort=label'), ['Reservation', 'Shipment']);
    assert.deepEqual(await names('sort=label&order=desc'), ['Shipment', 'Reservation']);
    assert.deepEqual(await names('q=reserv'), ['Reservation']);
    await addField(c, inv, { key: 'amount', label: 'Amount', type: 'decimal', required: true });
    await addField(c, inv, { key: 'email', label: 'Email', type: 'email', unique: true });
    await addField(c, inv, { key: 'note', label: 'Note', type: 'text', encrypted: true });
    assert.deepEqual((await c.get(`${O}?sort=fields&order=desc`)).body.items.map((o) => [o.key, o.fieldCount]), [['Shipment', 3], ['Reservation', 0]]);
    const fields = async (q) => (await c.get(`${O}/${inv.id}/fields?${q}`)).body;
    assert.deepEqual((await fields('flag=required')).items.map((f) => f.key), ['amount']);
    assert.deepEqual((await fields('flag=encrypted')).items.map((f) => f.key), ['note']);
    assert.deepEqual((await fields('type=email')).items.map((f) => f.key), ['email']);
    assert.deepEqual((await fields('q=am')).items.map((f) => f.key), ['amount']);
    assert.deepEqual((await fields('sort=key&order=desc')).items.map((f) => f.key), ['note', 'email', 'amount']);
    assert.equal((await fields('limit=1&offset=1')).total, 3);
    const ids = (await fields('')).items.map((f) => f.id).reverse();
    assert.equal((await c.put(`${O}/${inv.id}/fields/order`, { ids })).status, 204);
    assert.deepEqual((await fields('')).items.map((f) => f.key), ['note', 'email', 'amount']);
    assert.equal((await c.put(`${O}/${inv.id}/fields/order`, { ids: ids.slice(1) })).status, 400, 'every field must be listed');
  });

  it('blocks deleting a field other fields depend on', async () => {
    const c = await boss(); const inv = await newObject(c);
    const qty = (await addField(c, inv, { key: 'qty', label: 'Qty', type: 'number' })).body.field;
    await addField(c, inv, { key: 'dbl', label: 'Double', type: 'formula', settings: { expression: 'qty * 2' } });
    const blocked = await c.delete(`${O}/${inv.id}/fields/${qty.id}`);
    assert.equal(blocked.status, 409); assert.match(blocked.body.error.message, /Double/);
    const dbl = (await c.get(`${O}/${inv.id}`)).body.fields.find((f) => f.key === 'dbl');
    assert.equal((await c.delete(`${O}/${inv.id}/fields/${dbl.id}`)).status, 204);
    assert.equal((await c.delete(`${O}/${inv.id}/fields/${qty.id}`)).status, 204);
  });

  it('evaluate resolves visibility, required, read-only, options, autofill, formulas and errors', async () => {
    const c = await boss(); const inv = await newObject(c);
    await addField(c, inv, { key: 'qty', label: 'Quantity', type: 'number', required: true, settings: { min: '1' } });
    await addField(c, inv, { key: 'price', label: 'Price', type: 'decimal' });
    await addField(c, inv, { key: 'total', label: 'Total', type: 'formula', settings: { expression: 'qty * price' } });
    await addField(c, inv, { key: 'stage', label: 'Stage', type: 'picklist', settings: { values: [{ value: 'Open', label: 'Open' }, { value: 'Won', label: 'Won' }] } });
    await addField(c, inv, { key: 'reason', label: 'Reason', type: 'text', rules: [
      { id: 'show', effect: 'show', condition: { ref: 'this.stage', operator: 'eq', value: 'Won' } },
      { id: 'req', effect: 'require', condition: { ref: 'this.qty', operator: 'gt', value: '10' } },
      { id: 'lock', effect: 'lock', condition: { ref: 'user.role', operator: 'eq', value: 'viewer' }, message: 'Only editors' },
    ], validations: [{ id: 'len', kind: 'length', min: 3, message: 'Use at least 3 characters' }, { id: 'pat', kind: 'pattern', pattern: '^[A-Z]', message: 'Start with a capital' }] });
    await addField(c, inv, { key: 'closed', label: 'Closed on', type: 'date', autofill: [{ id: 'a', kind: 'today', when: 'create' }], settings: { max: 'today' } });
    await addField(c, inv, { key: 'owner', label: 'Owner', type: 'user', autofill: [{ id: 'u', kind: 'current_user' }] });

    const open = await evaluate(c, inv, { values: { qty: '2', price: '2.5', stage: 'Open', reason: 'x' } });
    assert.equal(open.fields.reason.visible, false, 'hidden until Won');
    assert.equal(open.fields.reason.required, false, 'a hidden field never blocks saving');
    assert.equal(open.fields.total.value, 5); assert.equal(open.fields.total.computed, true); assert.equal(open.fields.total.readOnly, true);
    assert.match(open.fields.closed.value, /^\d{4}-\d{2}-\d{2}$/); assert.equal(open.fields.closed.autofilled, 'autofill');
    assert.ok(open.fields.owner.value, 'the current person is filled in');

    const won = await evaluate(c, inv, { values: { qty: '11', price: '1', stage: 'Won' } });
    assert.equal(won.fields.reason.visible, true); assert.equal(won.fields.reason.required, true);
    assert.equal(won.fields.reason.errors[0].code, 'required'); assert.equal(won.valid, false);
    const bad = await evaluate(c, inv, { values: { qty: '11', stage: 'Won', reason: 'ab' } });
    assert.deepEqual(bad.fields.reason.errors.map((e) => e.code).sort(), ['custom:len', 'custom:pat']);
    const fine = await evaluate(c, inv, { values: { qty: '11', stage: 'Won', reason: 'Fine reason' } });
    assert.equal(fine.valid, true);
    const num = await evaluate(c, inv, { values: { qty: '0.5' } });
    assert.equal(num.fields.qty.errors[0].code, 'type', 'a whole number is required');
    assert.equal((await evaluate(c, inv, { values: { qty: '0' } })).fields.qty.errors[0].code, 'min');

    assert.equal((await evaluate(c, inv, { values: { qty: '2' } })).fields.stage.value, null, 'no default value was set on stage');

    const asViewer = await evaluate(c, inv, { values: { qty: '2', stage: 'Won' }, as: { role: 'viewer' } });
    assert.equal(asViewer.fields.reason.readOnly, true); assert.deepEqual(asViewer.fields.reason.messages, ['Only editors']);
    const later = await evaluate(c, inv, { values: { qty: '5', stage: 'Won', reason: 'Ok then' }, original: { reason: 'Before' }, context: { mode: 'edit' }, as: { role: 'viewer' } });
    assert.equal(later.fields.reason.errors[0].code, 'read_only', 'a locked field can’t be changed');
  });

  it('serves picker options from the server: picklists and people filtered by profile and workspace', async () => {
    const c = await boss(); const inv = await newObject(c);
    const pick = (await addField(c, inv, { key: 'stage', label: 'Stage', type: 'picklist', settings: { values: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta', active: false }, { value: 'c', label: 'Gamma' }] } })).body.field;
    const opts = async (f, q = '') => (await c.get(`${O}/${inv.id}/fields/${f.id}/options?q=${q}`)).body;
    assert.deepEqual((await opts(pick)).items.map((i) => i.label), ['Alpha', 'Gamma'], 'inactive values are not offered');
    assert.deepEqual((await opts(pick, 'gam')).items.map((i) => i.label), ['Gamma']);
    const sales = (await addField(c, inv, { key: 'rep', label: 'Rep', type: 'user', settings: { profiles: ['Sales Nobody'] } })).body.field;
    assert.deepEqual((await opts(sales)).items, [], 'nobody has that profile');
    const anyone = (await addField(c, inv, { key: 'anyone', label: 'Anyone', type: 'user', settings: { activeOnly: true } })).body.field;
    assert.equal((await opts(anyone)).items.length, 1, 'the owner is in the current workspace');
    const lookup = (await addField(c, inv, { key: 'acct', label: 'Account', type: 'lookup', settings: { target: 'Account' } })).body.field;
    assert.equal((await opts(lookup)).available, false, 'records of other objects don’t exist yet');
  });

  it('never crosses organisations', async () => {
    const a = await boss(); const b = await boss();
    const inv = await newObject(a);
    assert.equal((await b.get(`${O}/${inv.id}`)).status, 404);
    assert.equal((await b.post(`${O}/${inv.id}/fields`, { key: 'x', label: 'X', type: 'text', settings: {} })).status, 404);
    assert.equal((await b.get(O)).body.items.length, 0);
    assert.equal((await newObject(b, 'Shipment')).key, 'Shipment', 'the same key is free in another organisation');
  });
});

describe('picklist defaults', () => {
  it('uses the value marked as default when a record is created, not when it is edited', async () => {
    const c = await boss(); const inv = await newObject(c);
    await addField(c, inv, { key: 'priority', label: 'Priority', type: 'picklist', settings: { values: [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal', isDefault: true }] } });
    assert.equal((await evaluate(c, inv, { values: {} })).fields.priority.value, 'normal');
    assert.equal((await evaluate(c, inv, { values: {}, context: { mode: 'edit' } })).fields.priority.value, null);
    assert.equal((await evaluate(c, inv, { values: { priority: 'low' } })).fields.priority.value, 'low');
  });
});

describe('auto-number counters', () => {
  it('formats numbers with padding, date tokens and a step', async () => {
    const { formatSequence, periodOf } = await import('../src/modules/objects/sequence.service.js');
    const at = new Date(Date.UTC(2026, 10, 26));
    assert.equal(formatSequence('SHP-{0000}', 42, at), 'SHP-0042');
    assert.equal(formatSequence('{YYYY}/{MM}-{000}', 7, at), '2026/11-007');
    assert.equal(formatSequence('N{0}', 12345, at), 'N12345', 'padding is a minimum, never a cut-off');
    assert.equal(periodOf('yearly', at), '2026'); assert.equal(periodOf('monthly', at), '2026-11'); assert.equal(periodOf('daily', at), '2026-11-26'); assert.equal(periodOf('never', at), '');
  });

  it('hands out unique, consecutive numbers even when many are taken at once, per workspace and per period', async () => {
    const c = await boss(); const inv = await newObject(c);
    const field = (await addField(c, inv, { key: 'ref', label: 'Reference', type: 'auto_number', settings: { format: 'SHP-{0000}', start: 100, increment: 5 } })).body.field;
    const { sequences } = server.container;
    const tenantId = (await c.get('/me')).body.activeTenantId; const workspaceId = (await c.get('/me')).body.activeWorkspaceId;
    const f = { ...field, objectId: inv.id };
    assert.equal((await sequences.peek({ tenantId, workspaceId, field: f })).value, 'SHP-0100', 'peeking takes nothing');
    const taken = await Promise.all(Array.from({ length: 25 }, () => sequences.next({ tenantId, workspaceId, field: f })));
    const numbers = taken.map((t) => t.number).sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: 25 }, (_, i) => 100 + i * 5), 'no duplicates and no gaps');
    assert.equal((await sequences.peek({ tenantId, workspaceId, field: f })).value, 'SHP-0225');
    assert.equal((await sequences.next({ tenantId, workspaceId: '0198f000-0000-7000-8000-000000000001', field: f })).value, 'SHP-0100', 'another workspace counts on its own');
    const tenantWide = { ...f, settings: { ...f.settings, scope: 'tenant' } };
    assert.equal((await sequences.next({ tenantId, workspaceId, field: tenantWide })).value, 'SHP-0100', 'a tenant-wide counter is separate from the workspace ones');
  });

  it('starts again each period and rolls back with the record that asked for it', async () => {
    const c = await boss(); const inv = await newObject(c);
    const field = (await addField(c, inv, { key: 'ref', label: 'Reference', type: 'auto_number', settings: { format: '{YY}{MM}-{000}', cycle: 'monthly' } })).body.field;
    const { sequences } = server.container;
    const { db } = await import('../src/shared/db/index.js');
    const tenantId = (await c.get('/me')).body.activeTenantId; const workspaceId = (await c.get('/me')).body.activeWorkspaceId;
    const f = { ...field, objectId: inv.id };
    assert.equal((await sequences.next({ tenantId, workspaceId, field: f, at: new Date(Date.UTC(2026, 0, 5)) })).value, '2601-001');
    assert.equal((await sequences.next({ tenantId, workspaceId, field: f, at: new Date(Date.UTC(2026, 0, 6)) })).value, '2601-002');
    assert.equal((await sequences.next({ tenantId, workspaceId, field: f, at: new Date(Date.UTC(2026, 1, 1)) })).value, '2602-001', 'a new month starts again');
    await assert.rejects(db.transaction(async (tx) => { await sequences.next({ tenantId, workspaceId, field: f, at: new Date(Date.UTC(2026, 0, 7)), executor: tx }); throw new Error('record failed'); }));
    assert.equal((await sequences.next({ tenantId, workspaceId, field: f, at: new Date(Date.UTC(2026, 0, 8)) })).value, '2601-003', 'the rolled-back number was given back');
  });

  it('shows the next number on the form and where the counter stands', async () => {
    const c = await boss(); const inv = await newObject(c);
    const field = (await addField(c, inv, { key: 'ref', label: 'Reference', type: 'auto_number', settings: { format: 'INV-{000}', start: 7 } })).body.field;
    assert.equal((await evaluate(c, inv, { values: {} })).fields.ref.value, 'INV-007');
    const status = (await c.get(`${O}/${inv.id}/fields/${field.id}/sequence`)).body;
    assert.equal(status.next, 'INV-007'); assert.equal(status.lastIssued, null); assert.deepEqual(status.examples, ['INV-007', 'INV-008', 'INV-009']);
  });
});
