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
    assert.equal((await other.get(`${O}/Lead/records`)).body.items.length, 0, 'another tenant sees nothing');
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
    const ws = (await client.get('/me')).body.activeTenantId;
    await rule(client, 'escalation-rules', { rule_name: 'Tier 2', active: 'Active', escalate_after_hours: '1', assign_to: 'tier2@example.com' });
    const made = await client.post(`${O}/Case/records`, { subject: 'Printer on fire', status: 'New' });
    assert.equal(made.status, 201);
    await pool.query("update setup_records set created_at = now() - interval '3 hours' where tenant_id = $1 and id = $2", [ws, made.body.record.id]);
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
    const ws = (await client.get('/me')).body.activeTenantId;
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
    const ws = (await client.get('/me')).body.activeTenantId;
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

/** Adds a new person to the boss's tenant with the given role; returns their signed-in client and email. */
async function joinTenant(boss, role) {
  const ws = (await boss.get('/me')).body.activeTenantId;
  const email = uniqueEmail();
  await boss.post(`/tenants/${ws}/invitations`, { invitations: [{ email, role }] });
  const token = new URL(server.mailTo(email, 'invitation').data.url).searchParams.get('token');
  const person = new Client(server.base);
  const accepted = await person.post('/invitations/accept', { token, firstName: 'Meera', lastName: 'Iyer', password: PASSWORD, acceptTerms: true });
  assert.equal(accepted.status, 201);
  await person.post(`/tenants/${ws}/switch`);
  return { person, email, ws };
}

describe('profiles, permission sets and sharing decide access', () => {
  it('role defaults apply until a profile or permission set says otherwise', async () => {
    const { client: boss } = await registerUser(server);
    const { person: viewer } = await joinTenant(boss, 'viewer');
    assert.equal((await viewer.get(`${O}/Lead/records`)).status, 200);
    assert.equal((await lead(viewer, {})).status, 403, 'viewers cannot create');
    const def = await viewer.get(`${O}/Lead`);
    assert.deepEqual([def.body.permissions.read, def.body.permissions.create], [true, false]);
  });

  it('a profile restricts a member; a permission set grants more to a viewer', async () => {
    const { client: boss } = await registerUser(server);
    const { person: member, email: memberEmail } = await joinTenant(boss, 'member');
    const { person: viewer, email: viewerEmail } = await joinTenant(boss, 'viewer');
    assert.equal((await lead(member, {})).status, 201, 'member default: can create');

    // Assign the seeded "Read Only" profile (All objects: read only) to the member.
    const profileRes = await boss.patch(`${S}/pages/users/records/${(await boss.get(`${S}/pages/users/records`)).body.items.find((u) => u.email === memberEmail).id}`, { profile: 'Read Only' });
    assert.equal(profileRes.status, 200, JSON.stringify(profileRes.body));
    assert.equal((await lead(member, {})).status, 403, 'profile removes create');
    assert.equal((await member.get(`${O}/Lead/records`)).status, 200, 'but read still works');
    assert.equal((await boss.patch(`${S}/pages/users/records/${(await boss.get(`${S}/pages/users/records`)).body.items.find((u) => u.email === memberEmail).id}`, { profile: 'No Such Profile' })).status, 400);

    // A permission set gives the viewer create/edit on Leads only.
    await rule(boss, 'object-settings', { object: 'Lead', permission_set: 'Lead Editors', read: 'Yes', create: 'Yes', edit: 'Yes', delete: 'No' });
    await rule(boss, 'manage-assignments', { user: viewerEmail, permission_set: 'Lead Editors', assigned: '2026-01-01' });
    assert.equal((await lead(viewer, {})).status, 201, 'permission set grants create on Lead');
    assert.equal((await viewer.post(`${O}/Account/records`, { account_name: 'X' })).status, 403, 'but not on other objects');
    const leads = (await viewer.get(`${O}/Lead/records`)).body.items;
    assert.equal((await viewer.post(`${O}/Lead/records/delete`, { ids: [leads[0].id] })).status, 403, 'delete was not granted');
  });

  it('organization-wide defaults: Private shows people only their own records', async () => {
    const { client: boss } = await registerUser(server);
    const { person: a } = await joinTenant(boss, 'member');
    const { person: b } = await joinTenant(boss, 'member');
    const mine = await lead(a, { name: 'A-owned' });
    await lead(b, { name: 'B-owned' });
    assert.equal((await a.get(`${O}/Lead/records`)).body.items.length, 2, 'open by default');

    const owd = await boss.get(`${S}/pages/sharing-defaults/records?q=Lead`);
    const row = owd.body.items.find((r) => r.object === 'Lead');
    await boss.patch(`${S}/pages/sharing-defaults/records/${row.id}`, { default_internal_access: 'Private' });
    const seen = (await a.get(`${O}/Lead/records`)).body.items;
    assert.deepEqual(seen.map((l) => l.name), ['A-owned'], 'only own records');
    assert.equal((await boss.get(`${O}/Lead/records`)).body.items.length, 2, 'admins see everything');
    assert.equal((await b.patch(`${O}/Lead/records/${mine.body.record.id}`, { status: 'x' })).status, 403, 'cannot edit someone else\'s record');

    await boss.patch(`${S}/pages/sharing-defaults/records/${row.id}`, { default_internal_access: 'Public Read Only' });
    assert.equal((await a.get(`${O}/Lead/records`)).body.items.length, 2, 'read-only sharing: everyone reads');
    assert.equal((await b.patch(`${O}/Lead/records/${mine.body.record.id}`, { status: 'x' })).status, 403, '…but only owners edit');
    assert.equal((await a.patch(`${O}/Lead/records/${mine.body.record.id}`, { status: 'Qualified' })).status, 200);
  });
});

describe('settings that now change behaviour', () => {
  const save = async (c, page, values) => { const cur = await c.get(`${S}/pages/${page}/settings`); const r = await c.patch(`${S}/pages/${page}/settings`, { version: cur.body.version, values }); assert.equal(r.status, 200, JSON.stringify(r.body)); };

  it('email settings: deliverability blocks, BCC and footer apply, every send is logged and downloadable', async () => {
    const { client } = await registerUser(server);
    const ws = (await client.get('/me')).body.activeTenantId;
    const sent = []; const mailer = { send: async (m) => sent.push(m) };
    const { createSendEmailJob } = await import('../src/services/worker/jobs/sendEmail.js');
    const job = createSendEmailJob(mailer, { repos: server.container.repos, emailPolicy: server.container.emailPolicy });
    const user = (to) => job({ data: { template: 'notification', to, tenantId: ws, kind: 'user', data: { subject: 'Hi', body: 'Body' } } });
    const system = (to) => job({ data: { template: 'password_changed', to, tenantId: ws, kind: 'system', data: {} } });

    await save(client, 'compliance-bcc-email', { enable_compliance_bcc_email: true, bcc_email_address: 'audit@example.com' });
    await save(client, 'email-footers', { footer_text: 'Confidential — Acme' });
    await user('a@example.com');
    assert.equal(sent[0].bcc, 'audit@example.com');
    assert.match(sent[0].text, /Confidential — Acme/);
    await system('b@example.com');
    assert.equal(sent[1].bcc, undefined, 'system mail is not BCC\'d unless enabled');

    await save(client, 'deliverability', { access_level: 'System email only' });
    await user('c@example.com');
    await system('d@example.com');
    assert.deepEqual(sent.map((m) => m.to), ['a@example.com', 'b@example.com', 'd@example.com'], 'user mail blocked, system mail still sent');

    await save(client, 'deliverability', { access_level: 'No access' });
    await system('e@example.com');
    assert.equal(sent.length, 3, 'nothing is sent at "No access"');

    const test = await client.post(`${S}/pages/test-deliverability/run`, { email: 'me@example.com' });
    assert.equal(test.body.ok, false);
    assert.match(test.body.message, /No access/);

    const exp = await fetch(`${server.base}${S}/pages/email-log-files/export?object=${encodeURIComponent('Last 30 days')}`, { headers: { Authorization: `Bearer ${client.token}` } });
    const csv = await exp.text();
    assert.match(csv, /^Time,To,Subject,Kind,Result,BCC/);
    assert.match(csv, /c@example.com,Hi,user,Deliverability access level is “System email only”/);
    assert.match(csv, /a@example.com,Hi,user,Sent,audit@example.com/);
  });

  it('opportunity, case and task settings', async () => {
    const { client, email } = await registerUser(server);
    await save(client, 'opportunity-settings', { require_close_date_in_the_future: true, enable_big_deal_alerts: true, big_deal_amount: 'USD 1,000' });
    const past = await client.post(`${O}/Opportunity/records`, { name: 'Old', close_date: '2020-01-01' });
    assert.equal(past.status, 400);
    assert.match(JSON.stringify(past.body), /in the future/);
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const big = await client.post(`${O}/Opportunity/records`, { name: 'Whale', close_date: future, amount: '5000' });
    assert.equal(big.status, 201);
    assert.ok(mails(email).some((m) => m.data.subject === 'Big deal: Whale'));
    const small = await client.post(`${O}/Opportunity/records`, { name: 'Minnow', close_date: future, amount: '10' });
    assert.ok(!mails(email).some((m) => m.data.subject === 'Big deal: Minnow'));
    void small;

    assert.equal((await client.post(`${O}/Case/records`, { subject: 'Help' })).status, 201);
    assert.ok(mails(email).some((m) => /New case/.test(m.data.subject)), 'case owner is notified (Support Settings)');
    await save(client, 'activity-settings', { enable_task_notifications: false });
    const before = mails(email).length;
    await client.post(`${O}/Task/records`, { subject: 'Call back' });
    assert.equal(mails(email).length, before, 'task notifications can be switched off');
  });

  it('business hours decide when a case counts as stale', async () => {
    const { client } = await registerUser(server);
    const ws = (await client.get('/me')).body.activeTenantId;
    await rule(client, 'escalation-rules', { rule_name: 'BH', active: 'Active', escalate_after_hours: '1', assign_to: 'tier2@example.com' });
    // Open for one minute a day => ~0 business hours elapsed, however old the case is.
    await rule(client, 'business-hours', { business_hours_name: 'Tiny', active: 'Active', default: 'Yes', time_zone: 'UTC', start_time: '00:00', end_time: '00:01', working_days: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun' });
    const made = await client.post(`${O}/Case/records`, { subject: 'Stale?', status: 'New' });
    await pool.query("update setup_records set created_at = now() - interval '30 hours' where tenant_id = $1 and id = $2", [ws, made.body.record.id]);
    const job = new EscalationService({ repos: server.container.repos, automation: server.container.automation, cache: server.container.cache, logger: { info() {} } });
    assert.equal(await job.run(), 0, 'outside business hours the case is not stale');
    const preview = await client.post(`${S}/pages/time-based-workflow/run`, {});
    assert.match(preview.body.message, /Nothing is waiting/);

    const bh = (await client.get(`${S}/pages/business-hours/records?q=Tiny`)).body.items[0];
    const upd = await client.patch(`${S}/pages/business-hours/records/${bh.id}`, { end_time: '24:00' });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const pending = await client.post(`${S}/pages/time-based-workflow/run`, {});
    assert.match(pending.body.message, /1 case\(s\) will escalate/);
    assert.equal(await job.run(), 1, 'with working hours all day it escalates');
  });

  it('mass tools: transfer approvals and replace a field value', async () => {
    const { client: boss } = await registerUser(server);
    const { email: first } = await joinTenant(boss, 'admin');
    const { email: second } = await joinTenant(boss, 'admin');
    await rule(boss, 'approval-processes', { process_name: 'All leads', object: 'Lead', status: 'Active', approver: first });
    const made = await lead(boss, { industry: 'Tech' });
    await lead(boss, { name: 'B', industry: 'Tech' });
    const moved = await boss.post(`${S}/pages/mass-transfer-approval-requests/run`, { from: first, to: second });
    assert.equal(moved.body.moved, 2);
    assert.equal((await boss.get(`${O}/Lead/records`)).body.items.find((l) => l.id === made.body.record.id).approver, second);

    const replaced = await boss.post(`${S}/pages/mass-update-addresses/run`, { object: 'Lead', field: 'Industry', from: 'Tech', to: 'Software' });
    assert.equal(replaced.body.updated, 2);
    assert.ok((await boss.get(`${O}/Lead/records`)).body.items.every((l) => l.industry === 'Software'));
    const blocked = await boss.post(`${S}/pages/mass-update-addresses/run`, { object: 'Lead', field: 'Name', from: 'a', to: 'b' });
    assert.equal(blocked.status, 400, 'name/status fields are protected');
  });
});

describe('log in as another user', () => {
  it('is allowed for admins by default, limited to 30 minutes, audited, and blocks account changes', async () => {
    const { client: boss } = await registerUser(server);
    const bossId = (await boss.get('/me')).body.user.id;
    const { person, ws } = await joinTenant(boss, 'member');
    const memberId = (await person.get('/me')).body.user.id;

    const res = await boss.post(`/tenants/${ws}/members/${memberId}/login-as`);
    assert.equal(res.status, 200);
    assert.equal(res.body.expiresIn, 1800);
    const acting = new Client(server.base);
    acting.token = res.body.accessToken;
    const me = await acting.get('/me');
    assert.equal(me.body.user.id, memberId);
    assert.equal(me.body.impersonatedBy, bossId);
    assert.equal((await acting.post('/me/password', { currentPassword: PASSWORD, password: 'Another-Passw0rd!', confirmPassword: 'Another-Passw0rd!' })).status, 403, 'no password change while impersonating');
    assert.equal((await acting.post('/auth/logout-all')).status, 403);
    assert.ok((await person.get('/me/activity')).body.items.some((e) => e.type === 'impersonation'), 'the member can see it');

    assert.equal((await person.post(`/tenants/${ws}/members/${bossId}/login-as`)).status, 403, 'members cannot');
    const cur = await boss.get(`${S}/pages/login-access-policies/settings`);
    await boss.patch(`${S}/pages/login-access-policies/settings`, { version: cur.body.version, values: { administrators_can_log_in_as_any_user: false } });
    assert.equal((await boss.post(`/tenants/${ws}/members/${memberId}/login-as`)).status, 403, 'the setting is respected');
  });
});

describe('page status', () => {
  it('the API tells the UI what each page really does', async () => {
    const { client } = await registerUser(server);
    assert.equal((await client.get(`${S}/pages/chatter-settings`)).body.status.level, 'stored');
    assert.equal((await client.get(`${S}/pages/snap-ins`)).body.status.level, 'external');
    assert.equal((await client.get(`${S}/pages/deliverability`)).body.status.level, 'partial');
    assert.equal((await client.get(`${S}/pages/profiles`)).body.status.level, 'real');
  });
});
