import { logger } from '../../../shared/logger.js';

// Replace the log with a real email provider (SES, Resend, ...).
export async function welcomeEmail(job) {
  const { userId, email } = job.data;
  logger.info({ userId }, `Sending welcome email to ${email}`);
}
