import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OTP_LENGTH, mfaCodeSchema, mfaDisableSchema } from '@app/shared';
import { meApi } from '../../../api/endpoints.js';
import { useAuth } from '../../../auth/AuthProvider.jsx';
import { Form } from '../../../components/forms/Form.jsx';
import { OtpField, PasswordField, SubmitButton } from '../../../components/forms/fields.jsx';
import { useAppForm } from '../../../components/forms/useAppForm.js';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Section } from '../../../components/ui/Card.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(codes.join('\n'));
    setCopied(true);
  };
  return (
    <div className="space-y-3">
      <Alert tone="warning" title="Save your recovery codes">Each code can be used once if you lose access to your authenticator app. They won’t be shown again.</Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-4 font-mono text-sm text-ink sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex gap-2">
        <Button variant="neutral" size="sm" onClick={copy}><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy codes'}</Button>
        <Button size="sm" onClick={onDone}>I’ve saved them</Button>
      </div>
    </div>
  );
}

function EnrolForm({ setup, email, onEnabled, onCancel }) {
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 176 }).then(setQr); }, [setup.otpauthUrl]);
  const { form, submit, formError } = useAppForm({
    schema: mfaCodeSchema,
    defaultValues: { code: '' },
    onSubmit: async (values) => onEnabled(await meApi.mfaEnable(values)),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Scan this QR code with an authenticator app (1Password, Authy, Google Authenticator), then enter the 6-digit code for <b className="text-ink">{email}</b>.</p>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        {qr && <img src={qr} alt="Two-factor QR code" width="176" height="176" className="rounded-lg border border-line bg-white p-1" />}
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted">Can’t scan? Enter this key manually:</p>
          <code className="block break-all rounded bg-surface-2 px-2 py-1 text-sm text-ink">{setup.secret}</code>
        </div>
      </div>
      <Form form={form} onSubmit={submit} error={formError} className="max-w-sm space-y-4">
        <OtpField name="code" length={OTP_LENGTH} autoFocus />
        <div className="flex gap-2"><SubmitButton>Enable</SubmitButton><Button variant="neutral" onClick={onCancel}>Cancel</Button></div>
      </Form>
    </div>
  );
}

function DisableForm({ hasPassword, onDisabled, onCancel }) {
  const { form, submit, formError } = useAppForm({
    schema: mfaDisableSchema,
    defaultValues: { password: '', code: '' },
    onSubmit: async (values) => { await meApi.mfaDisable(values); onDisabled(); },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError} className="max-w-sm space-y-4">
      {hasPassword && <PasswordField name="password" label="Password" autoComplete="current-password" />}
      <OtpField name="code" length={OTP_LENGTH} label="Authentication code" />
      <div className="flex gap-2"><SubmitButton variant="danger">Turn off</SubmitButton><Button variant="neutral" onClick={onCancel}>Cancel</Button></div>
    </Form>
  );
}

export function TwoFactorSection() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['mfa-status'], queryFn: meApi.mfaStatus });
  const [mode, setMode] = useState('idle'); // idle | enrolling | disabling | codes
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState(null);
  const enabled = status.data?.enabled ?? user.mfaEnabled;

  const settle = async () => { await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['mfa-status'] })]); };
  const begin = async () => {
    setError(null);
    setMode('enrolling'); // flip the switch immediately; revert if setup fails
    try { setSetup(await meApi.mfaSetup()); } catch (e) { setMode('idle'); setError(e.message); }
  };

  const onToggle = (event) => {
    if (event.target.checked) begin(); else setMode('disabling');
  };

  return (
    <Section title="Two-factor authentication" description="Require a code from an authenticator app in addition to your password.">
      <div className="space-y-4">
        <Switch label="Authenticator app" description={mode === 'enrolling' ? 'Setting up…' : enabled ? `On · ${status.data?.recoveryCodesRemaining ?? 0} recovery codes left` : 'Off'} checked={mode === 'enrolling' || enabled} onChange={onToggle} disabled={mode === 'codes'} />
        {error && <Alert tone="error">{error}</Alert>}
        {mode === 'enrolling' && setup && (
          <EnrolForm setup={setup} email={user.email} onCancel={() => setMode('idle')} onEnabled={async (result) => { setCodes(result.recoveryCodes); setMode('codes'); await settle(); }} />
        )}
        {mode === 'disabling' && <DisableForm hasPassword={user.hasPassword} onCancel={() => setMode('idle')} onDisabled={async () => { setMode('idle'); await settle(); }} />}
        {mode === 'codes' && <RecoveryCodes codes={codes} onDone={() => setMode('idle')} />}
      </div>
    </Section>
  );
}
