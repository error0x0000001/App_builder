import { QUEUES } from '../../shared/queue.js';

/** Enqueues email so request latency and SMTP outages never affect auth flows. */
export class MailService {
  constructor({ boss }) { this.boss = boss; }

  /** `options.workspaceId` applies that workspace's Email settings; `options.kind`: 'system' (default) or 'user' (automation). */
  send(template, to, data = {}, { workspaceId, kind = 'system' } = {}) {
    return this.boss.send(QUEUES.SEND_EMAIL, { template, to, data, workspaceId, kind });
  }
}
