import { renderEmail } from '../../../shared/mail/render.js';
import { TEMPLATES } from '../../../shared/mail/templates.js';

/**
 * Builds the send-email job handler around an injected mailer (any transport). Mail tied to a workspace goes through its
 * Email settings (deliverability, BCC, footer) and is recorded in the workspace's email log either way.
 * `workspaceMailer(workspaceId)` returns that workspace's own sender (Integrations › SMTP / Amazon SES) or null.
 */
export const createSendEmailJob = (mailer, { emailPolicy, repos, workspaceMailer } = {}) => async (job) => {
  const { template, to, data, workspaceId, kind = 'system' } = job.data;
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  let content = build(data ?? {});
  let bcc;
  let blocked = null;
  if (workspaceId && emailPolicy) {
    const policy = await emailPolicy.forWorkspace(workspaceId);
    blocked = emailPolicy.blockedReason(policy, kind);
    ({ content, bcc } = emailPolicy.shape(policy, kind, content));
  }
  // A workspace with its own live email integration (SMTP / Amazon SES) sends through it; everyone else uses the platform transport.
  const sender = (workspaceId && workspaceMailer && (await workspaceMailer(workspaceId))) || mailer;
  if (!blocked) await sender.send({ to, bcc, ...renderEmail(content) });
  if (workspaceId && repos) {
    await repos.setupRecords.insert(workspaceId, 'email-log', { label: content.subject, status: blocked ? 'Blocked' : 'Sent', data: { to, subject: content.subject, template, kind, result: blocked ?? 'Sent', bcc: bcc ?? '' } });
  }
};
