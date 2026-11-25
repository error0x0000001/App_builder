import { QUEUES } from '../../shared/queue.js';
import { deliverNotification } from './testers.js';

/**
 * Posts tenant notifications to the chat channels it has connected (Slack, Teams, Discord, webhook).
 * `post()` only enqueues — one job per channel, so a slow or failing channel never delays a save and never repeats a delivery that worked.
 * With nothing connected it costs one cached lookup.
 */
export class ChannelNotifier {
  constructor({ boss, integrations, logger }) { Object.assign(this, { boss, integrations, logger }); }

  /** `kind` is one of NOTIFICATION_EVENTS; `link` is an absolute URL. Never throws: a notification must not break the action that caused it. */
  async post(tenantId, { kind, title, text, link }) {
    try {
      const live = (await this.integrations.resolveAll(tenantId, 'messaging')).filter((p) => (p.config.events ?? []).includes(kind));
      for (const p of live) await this.boss.send(QUEUES.NOTIFY_CHANNELS, { tenantId, provider: p.key, kind, title, text, link });
    } catch (error) { this.logger?.warn({ err: error.message, kind }, 'channel notification not queued'); }
  }
}

/** Worker side: deliver one queued notification through its provider (re-checking it is still live and still wants this event). */
export const createNotifyJob = (integrations, { allowPrivate = false } = {}) => async (job) => {
  const { tenantId, provider, kind, title, text, link } = job.data;
  const live = (await integrations.resolveAll(tenantId, 'messaging')).find((p) => p.key === provider);
  if (!live || !(live.config.events ?? []).includes(kind)) return;
  const result = await deliverNotification(provider, live.config, live.secrets, { kind, title, text, link }, { allowPrivate });
  if (!result.ok) throw new Error(`${provider}: ${result.message}`); // pg-boss retries with backoff
};
