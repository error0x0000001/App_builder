import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/shared/db/index.js';
import { EscalationService } from '../src/modules/automation/escalation.service.js';
import { Client, PASSWORD, registerUser, startServer, uniqueEmail } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const O = '/objects'; const S = '/setup';
const rule = (c, collection, body) => c.post(`${S}/pages/${collection}/records`, body).then((r) => { assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.record; });
const lead = (c, body) => c.post(`${O}/Lead/records`, { name: 'Ada Lovelace', company: 'Analytical', ...body });
const mails = (to) => server.outbox.filter((m) => m.to === to && m.template === 'notification');

describe('objects', () => {
  it('serves Object Manager definitions and CRUD with validation, defaults and tenant isolation', async () => {
    const { client, email } = await registerUser(server);
    const def = await client.get(`${O}/Lead`);
    assert.equal(def.status, 200);
    assert.ok(def.body.definition.fields.some((f) => f.key === 'lead_source'));
    assert.equal((await client.get(`${O}/Nope`)).status, 404);

    assert.equal((await client.post(`${O}/Lead/records`, { company: 'No name' })).status, 400, 'Name is required');
    assert.equal((await client.post(`${O}/Lead/records`, { name: 'A', email: 'not-an-email' })).status, 400);
    const created = await lead(client, { email: 'ada@analytical.co' });
    assert.equal(created.status, 201);
    assert.equal(created.body.record.lead_owner, email, 'owner defaults to the creator');
    assert.match(created.body.record.created_date, /^\d{4}-\d{2}-\d{2}$/);

    const id = created.body.record.id;
    const listed = await client.get(`${O}/Lead/records`);
    assert.equal(listed.body.items.length, 1);
    const updated = await client.patch(`${O}/Lead/records/${id}`, { status: 'Qualified' });
    assert.equal(updated.body.record.status, 'Qualified');
    assert.equal((await client.get(`${O}/Lead/records?q=Ada`)).body.items.length, 1);

    const other = (await registerUser(server)).client;
    assert.equal((await other.get(`${O}/Lead/records`)).body.items.length, 0, 'another workspace sees nothing');
    assert.equal((await other.patch(`${O}/Lead/records/${id}`, { status: 'x' })).status, 404);

    assert.equal((await client.post(`${O}/Lead/records/delete`, { ids: [id] })).body.removed, 1);
  });

  it('adding a field in Object Manager changes validation immediately', async () => {
    const { client } = await registerUser(server);
    const objects = await client.get(`${S}/pages/object-manager-objects/records?q=Lead`);
    const leadObject = objects.body.items.find((o) => o.label === 'Lead');
    const field = await client.post(`${S}/pages/object-manager-fields/records`, { field_label: 'Budget', object: 'Lead', data_type: 'Currency', required: true, parentId: leadObject.id });
    assert.equal(field.status, 201);
    assert.equal((await lead(client, {})).status, 400, 'new required field is enforced');
    assert.equal((await lead(client, { budget: '1500.50' })).status, 201);
    assert.equal((await lead(client, { budget: 'lots' })).status, 400, 'numbers are validated');
  });
});

describe('automation rules run on records', () => {
  it('assignment rules set the owner', async () => {
    const { client } = await registerUser(server);
    await rule(client, 'lead-assignment-rules', { rule_name: 'Software to Sam', active: 'Active', criteria_field: 'Industry', criteria_operator: 'equals', criteria_value: 'Software', assign_to: 'sam@example.com' });
    const hit = await lead(client, { industry: 'Software' });
    assert.equal(hit.body.record.lead_owner, 'sam@example.com');
    const miss = await lead(client, { industry: 'Banking' });
    assert.notEqual(miss.body.record.lead_owner, 'sam@example.com');
  });

  it('duplicate rules block or warn, and log to Duplicate Error Logs', async () => {
    const { client } = await registerUser(server);
    const dup = await rule(client, 'duplicate-rules', { rule_name: 'Same email', object: 'Lead', status: 'Active', match_field: 'Email', duplicate_action: 'Block' });
    assert.equal((await lead(client, { email: 'dup@example.com' })).status, 201);
    const blocked = await lead(client, { name: 'Other', email: 'dup@example.com' });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error.message, /Duplicate/);
    const logs = await client.get(`${S}/pages/duplicate-error-logs/records?q=Ada`);
    assert.ok(logs.body.items.some((l) => l.action === 'Blocked' && l.rule === 'Same email'));

    await client.patch(`${S}/pages/duplicate-rules/records/${dup.id}`, { duplicate_action: 'Alert' });
    const allowed = await lead(client, { name: 'Third', email: 'dup@example.com' });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.warnings.length, 1);
  });

  it('workflow rules update fields, send email alerts and create tasks; auto-response emails the lead', async () => {
    const { client } = await registerUser(server);
    await rule(client, 'workflow-rules', { rule_name: 'Hot web leads', object: 'Lead', active: 'Active', evaluation_criteria: 'Created', criteria_field: 'Lead Source', criteria_operator: 'equals', criteria_value: 'Web', action_type: 'Field update', action_field: 'Rating', action_value: 'Hot' });
    await rule(client, 'workflow-rules', { rule_name: 'Tell the team', object: 'Lead', active: 'Active', evaluation_criteria: 'Created', action_type: 'Email alert', action_field: 'team@example.com', action_value: 'A new lead arrived' });
    await rule(client, 'process-builder', { process_name: 'Follow up', object: 'Lead', status: 'Active', action_type: 'Create task', action_value: 'Call the lead' });
    await rule(client, 'lead-auto-response-rules', { rule_name: 'Thanks', active: 'Active', email_subject: 'Thanks for contacting us', email_body: 'We will be in touch.' });

    const hit = await lead(client, { lead_source: 'Web', email: 'prospect@example.com' });
    assert.equal(hit.body.record.rating, 'Hot');
    assert.equal(mails('team@example.com').length, 1);
    assert.equal(mails('prospect@example.com')[0].data.subject, 'Thanks for contacting us');
    const tasks = await client.get(`${O}/Task/records`);
    assert.ok(tasks.body.items.some((t) => t.subject === 'Call the lead'));

    const miss = await lead(client, { lead_source: 'Phone' });
    assert.notEqual(miss.body.record.rating, 'Hot', 'criteria are respected');
  });

  it('inactive and half-configured rules do nothing', async () => {
    const { client } = await registerUser(server);
    await rule(client, 'workflow-rules', { rule_name: 'Off', object: 'Lead', active: 'Inactive', action_type: 'Field update', action_field: 'Rating', action_value: 'Hot' });
    await rule(client, 'workflow-rules', { rule_name: 'No action', object: 'Lead', active: 'Active' });
    assert.equal((await lead(client, {})).body.record.rating, undefined);
  });

  it('approval processes hold records until the approver decides', async () => {
    const { client } = await registerUser(server);
    await rule(client, 'approval-processes', { process_name: 'Big deals', object: 'Lead', status: 'Active', criteria_field: 'Rating', criteria_operator: 'equals', criteria_value: 'Hot', approver: 'boss@example.com' });
    const created = await lead(client, { rating: 'Hot' });
    assert.equal(created.body.record.approval_status, 'Pending');
    assert.equal(mails('boss@example.com').length, 1);
    const decided = await client.post(`${O}/Lead/records/${created.body.record.id}/approval`, { decision: 'approve', comment: 'ok' });
    assert.equal(decided.body.record.approval_status, 'Approved');
    assert.equal((await client.post(`${O}/Lead/records/${created.body.record.id}/approval`, { decision: 'reject' })).status, 400, 'already decided');
  });

  it('escalation rules reassign stale cases and log them', async () => {
    const { client } = await registerUser(server);
    const ws = (await client.get('/me')).body.activeWorkspaceId;
    await rule(client, 'escalation-rules', { rule_name: 'Tier 2', active: 'Active', escalate_after_hours: '1', assign_to: 'tier2@example.com' });
    const made = await client.post(`${O}/Case/records`, { subject: 'Printer on fire', status: 'New' });
    assert.equal(made.status, 201);
    await pool.query("update setup_records set created_at = now() - interval '3 hours' where workspace_id = $1 and id = $2", [ws, made.body.record.id]);
    const job = new EscalationService({ repos: server.container.repos, automation: server.container.automation, cache: server.container.cache, logger: { info() {} } });
    assert.ok((await job.run()) >= 1);
    const after = await client.get(`${O}/Case/records`);
    assert.equal(after.body.items[0].case_owner, 'tier2@example.com');
    assert.ok((await client.get(`${S}/pages/case-escalations/records`)).body.items.some((e) => e.owner === 'tier2@example.com'));
    assert.equal(await job.run(), 0, 'a case is escalated once per rule');
  });
});

describe('public intake', () => {
  it('web-to-lead and web-to-case create records only when enabled; email-to-case needs its secret address', async () => {
    const { client } = await registerUser(server);
    const ws = (await client.get('/me')).body.activeWorkspaceId;
    const anon = new Client(server.base);

    const form = await anon.post(`/public/web-to-lead/${ws}`, { name: 'Web Visitor', email: 'visitor@example.com', message: 'Hello' });
    assert.equal(form.status, 201);
    assert.ok((await client.get(`${O}/Lead/records`)).body.items.some((l) => l.name === 'Web Visitor' && l.lead_source === 'Web'));

    const caseRes = await anon.post(`/public/web-to-case/${ws}`, { subject: 'Broken link', description: 'Page 404', name: 'Pat' });
    assert.equal(caseRes.status, 201);
    const cases = (await client.get(`${O}/Case/records`)).body.items;
    assert.equal(cases[0].origin, 'Web');
    assert.match(cases[0].description, /Pat/);

    const info = await client.get(`${S}/pages/email-to-case/settings`);
    const url = new URL(info.body.values.routing_address);
    assert.equal((await anon.post(`${url.pathname.replace('/api/v1', '')}`, { from: 'cust@example.com', subject: 'Help', text: 'It broke' })).status, 201);
    assert.equal((await anon.post(`/public/email-to-case/${ws}/wrong-token`, { subject: 'x' })).status, 403);

    const settings = await client.get(`${S}/pages/web-to-lead/settings`);
    await client.patch(`${S}/pages/web-to-lead/settings`, { version: settings.body.version, values: { web_to_lead_enabled: false } });
    assert.equal((await anon.post(`/public/web-to-lead/${ws}`, { name: 'Late', email: 'l@example.com' })).status, 403, 'switch is respected');
    assert.equal((await anon.post(`/public/web-to-lead/${ws}`, {})).status, 400, 'empty submissions are rejected');
  });

  it('the generated Web-to-Case HTML points at the real endpoint', async () => {
    const { client } = await registerUser(server);
    const ws = (await client.get('/me')).body.activeWorkspaceId;
    const res = await client.post(`${S}/pages/web-to-case-html-generator/run`, {});
    assert.match(res.body.output, new RegExp(`/api/v1/public/web-to-case/${ws}`));
  });
});

describe('platform pages', () => {
  it('Scheduled Jobs lists real queue schedules; Setup responses carry clickjack protection', async () => {
    const { client } = await registerUser(server);
    const jobs = await client.get(`${S}/pages/scheduled-jobs/records`);
    assert.equal(jobs.status, 200);
    const res = await client.get(`${S}/pages/profiles/records`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    void uniqueEmail; void PASSWORD;
  });
});
