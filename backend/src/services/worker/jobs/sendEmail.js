import { renderEmail } from '../../../shared/mail/render.js';
import { TEMPLATES } from '../../../shared/mail/templates.js';

/**
 * Builds the send-email job handler around an injected mailer (any transport). Mail tied to a tenant goes through its
 * Email settings (deliverability, BCC, footer) and is recorded in the tenant's email log either way.
 * `tenantMailer(tenantId)` returns that tenant's own sender (Integrations › SMTP / Amazon SES) or null.
 */
export const createSendEmailJob = (mailer, { emailPolicy, repos, tenantMailer } = {}) => async (job) => {
  const { template, to, data, tenantId, kind = 'system' } = job.data;
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  let content = build(data ?? {});
  let bcc;
  let blocked = null;
  if (tenantId && emailPolicy) {
    const policy = await emailPolicy.forTenant(tenantId);
    blocked = emailPolicy.blockedReason(policy, kind);
    ({ content, bcc } = emailPolicy.shape(policy, kind, content));
  }
  // A tenant with its own live email integration (SMTP / Amazon SES) sends through it; everyone else uses the platform transport.
  const sender = (tenantId && tenantMailer && (await tenantMailer(tenantId))) || mailer;
  if (!blocked) await sender.send({ to, bcc, ...renderEmail(content) });
  if (tenantId && repos) {
    await repos.setupRecords.insert(tenantId, 'email-log', { label: content.subject, status: blocked ? 'Blocked' : 'Sent', data: { to, subject: content.subject, template, kind, result: blocked ?? 'Sent', bcc: bcc ?? '' } });
  }
};
