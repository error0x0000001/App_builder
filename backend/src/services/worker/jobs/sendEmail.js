import { renderEmail } from '../../../shared/mail/render.js';
import { TEMPLATES } from '../../../shared/mail/templates.js';

/**
 * Builds the send-email job handler around an injected mailer (any transport).
 * `tenantMailer(tenantId)` returns the organisation's own sender (Integrations › SMTP / Amazon SES) or null, in which case the platform transport is used.
 */
export const createSendEmailJob = (mailer, { tenantMailer } = {}) => async (job) => {
  const { template, to, data, tenantId } = job.data;
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  const sender = (tenantId && tenantMailer && (await tenantMailer(tenantId))) || mailer;
  await sender.send({ to, ...renderEmail(build(data ?? {})) });
};
