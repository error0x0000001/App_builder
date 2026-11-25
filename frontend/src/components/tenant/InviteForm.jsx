import { useState } from 'react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, inviteSchema } from '@app/shared';
import { useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '../../api/endpoints.js';
import { Alert } from '../ui/Alert.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Form } from '../forms/Form.jsx';
import { SelectField, SubmitButton, TextField } from '../forms/fields.jsx';
import { useAppForm } from '../forms/useAppForm.js';

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

/**
 * Queue several invitees, then send them in one request.
 * Used by onboarding and by the members page — one implementation.
 */
export function InviteForm({ tenantId, onSent, submitLabel = 'Send invitations' }) {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState([]);
  const [results, setResults] = useState([]);
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);

  const { form, submit, formError } = useAppForm({
    schema: inviteSchema,
    defaultValues: { email: '', role: 'member' },
    onSubmit: (invite, f) => {
      if (queued.some((q) => q.email === invite.email)) return f.setError('email', { message: 'Already added' });
      setQueued((list) => [...list, invite]);
      f.reset({ email: '', role: invite.role });
    },
  });

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      const { results: outcome } = await tenantsApi.invite(tenantId, queued);
      setResults(outcome);
      setQueued([]);
      await queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] });
      onSent?.(outcome);
    } catch (error) {
      setSendError(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <Form form={form} onSubmit={submit} error={formError} className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
        <TextField name="email" label="Email" type="email" placeholder="name@company.com" inputMode="email" autoComplete="off" />
        <SelectField name="role" label="Role" options={ROLE_OPTIONS} />
        <SubmitButton variant="neutral" className="sm:mt-[1.65rem]"><Icon name="plus" />Add</SubmitButton>
      </Form>

      {queued.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Invitations to send">
          {queued.map((invite) => (
            <li key={invite.email} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1.5 text-xs text-ink">
              {invite.email} <Badge tone="accent">{ROLE_LABELS[invite.role]}</Badge>
              <button type="button" aria-label={`Remove ${invite.email}`} onClick={() => setQueued((l) => l.filter((q) => q.email !== invite.email))} className="grid size-5 place-items-center rounded-full text-muted hover:bg-line"><Icon name="x" className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}
      {sendError && <Alert tone="error">{sendError}</Alert>}
      {results.map((r) => (
        <Alert key={r.email} tone={r.status === 'sent' ? 'success' : 'warning'}>{r.status === 'sent' ? `Invitation sent to ${r.email}.` : `${r.email}: ${r.reason}`}</Alert>
      ))}
      {queued.length > 0 && <Button onClick={send} loading={sending}>{submitLabel} ({queued.length})</Button>}
    </div>
  );
}
