/**
 * Setup → Email pages applied to outgoing mail of a workspace:
 *   Deliverability     access level: All email / System email only / No access
 *   Compliance BCC     copy every (user) email to an address; optionally system email too
 *   Email Footers      footer appended to user-facing automation email
 * `kind`: 'system' = account/security mail (verification, reset, invitations); 'user' = automation mail (alerts, auto-responses).
 */
export class EmailPolicyService {
  constructor({ settings }) { this.settings = settings; }

  async forWorkspace(ws) {
    const [d, b, f] = await Promise.all(['deliverability', 'compliance-bcc-email', 'email-footers'].map((k) => this.settings.values(ws, k)));
    return {
      accessLevel: d.access_level,
      bcc: b.enable_compliance_bcc_email === true && String(b.bcc_email_address ?? '').includes('@') ? b.bcc_email_address.trim() : null,
      bccSystem: b.include_salesforce_emails_sent_as_system === true,
      footer: f.append_footer_to_outbound_mass_email === true && f.footer_text ? f.footer_text : null,
    };
  }

  /** Why this kind of email may not be sent, or null when it may. */
  blockedReason(policy, kind) {
    if (policy.accessLevel === 'No access') return 'Deliverability access level is “No access”';
    if (policy.accessLevel === 'System email only' && kind !== 'system') return 'Deliverability access level is “System email only”';
    return null;
  }

  /** Applies the footer and BCC to a rendered-content object / message. */
  shape(policy, kind, content) {
    const footnote = kind === 'user' && policy.footer ? [content.footnote, policy.footer].filter(Boolean).join('\n\n') : content.footnote;
    const bcc = policy.bcc && (kind === 'user' || policy.bccSystem) ? policy.bcc : undefined;
    return { content: { ...content, footnote }, bcc };
  }
}
