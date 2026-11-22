import { renderEmail } from '../../../shared/mail/render.js';
import { TEMPLATES } from '../../../shared/mail/templates.js';

/** Builds the send-email job handler around an injected mailer (any transport). */
export const createSendEmailJob = (mailer) => async (job) => {
  const { template, to, data } = job.data;
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  await mailer.send({ to, ...renderEmail(build(data ?? {})) });
};
