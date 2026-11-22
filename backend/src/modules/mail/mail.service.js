import { QUEUES } from '../../shared/queue.js';

/** Enqueues email so request latency and SMTP outages never affect auth flows. */
export class MailService {
  constructor({ boss }) { this.boss = boss; }

  send(template, to, data = {}) {
    return this.boss.send(QUEUES.SEND_EMAIL, { template, to, data });
  }
}
