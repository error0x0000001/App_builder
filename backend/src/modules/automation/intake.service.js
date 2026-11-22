import { createHmac, timingSafeEqual } from 'node:crypto';
import { fieldKey } from '@app/shared';
import { getSetupPage } from '@app/shared/setup-registry';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

const KINDS = {
  'web-to-lead': { object: 'Lead', page: 'web-to-lead', flag: 'web_to_lead_enabled', defaults: { lead_source: 'Web' } },
  'web-to-case': { object: 'Case', page: 'web-to-case', flag: 'enable_web_to_case', defaults: { origin: 'Web' } },
  'email-to-case': { object: 'Case', page: 'email-to-case', flag: 'enable_email_to_case', defaults: { origin: 'Email' } },
};

/** Public intake endpoints: anonymous submissions create Leads / Cases when the matching Setup switch is on. */
export class IntakeService {
  constructor({ objects, settings, secret }) { Object.assign(this, { objects, settings, secret }); }

  /** Secret path token for the email-to-case webhook (the "routing address"). */
  emailToken(ws) { return createHmac('sha256', this.secret).update(`${ws}:email-to-case`).digest('base64url').slice(0, 32); }

  async submit(kind, ws, payload, { token } = {}) {
    const meta = KINDS[kind];
    if (!meta) throw new NotFoundError('Unknown form');
    if (kind === 'email-to-case') {
      const a = Buffer.from(this.emailToken(ws)); const b = Buffer.from(String(token ?? ''));
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenError('Invalid address');
    }
    const enabled = (await this.settings.get(ws, getSetupPage(meta.page))).value.values[meta.flag] === true;
    if (!enabled) throw new ForbiddenError('This form is not enabled');

    const def = await this.objects.definition(ws, meta.object);
    if (!def) throw new NotFoundError('Unknown object');
    const known = new Set(def.fields.filter((f) => !f.readOnly).map((f) => f.key));
    const data = { ...meta.defaults }; const extra = [];
    for (const [k, v] of Object.entries(kind === 'email-to-case' ? this.#fromEmail(payload) : payload)) {
      const key = fieldKey(k);
      if (key === 'return_url') continue;
      if (known.has(key)) data[key] = typeof v === 'string' ? v.slice(0, 2000) : v;
      else if (typeof v === 'string' && v) extra.push(`${k}: ${v.slice(0, 500)}`);
    }
    if (extra.length && known.has('description')) data.description = [data.description, ...extra].filter(Boolean).join('\n');
    try {
      const { record } = await this.objects.create({ workspaceId: ws, userId: null, email: null, actor: null }, meta.object, data);
      return { id: record.id };
    } catch (error) {
      if (error.name === 'ZodError') throw new ValidationError(error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      throw error;
    }
  }

  /** Normalises an inbound-email webhook payload ({ from, subject, text }) into Case fields. */
  #fromEmail({ from, subject, text, body }) {
    return { subject: subject ?? '(no subject)', description: `From: ${from ?? 'unknown'}\n\n${text ?? body ?? ''}`.slice(0, 30_000), web_email: from };
  }
}
