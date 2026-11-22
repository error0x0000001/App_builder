import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

/** Transport strategies share one interface: send({ to, subject, html, text }). */
class SmtpMailer {
  constructor() {
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }

  send(message) {
    return this.transport.sendMail({ from: config.MAIL_FROM, ...message });
  }
}

class LogMailer {
  async send({ to, subject, text }) {
    logger.info({ to, subject, text }, 'email (log transport)');
  }
}

export const createMailer = () => (config.MAIL_TRANSPORT === 'smtp' ? new SmtpMailer() : new LogMailer());
