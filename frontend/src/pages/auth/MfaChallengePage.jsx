import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { OTP_LENGTH, mfaCodeSchema, recoveryCodeSchema } from '@app/shared';
import { authApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { OtpField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';

/** Remounted (via key) when switching mode so each mode validates with its own schema. */
function ChallengeForm({ mfaToken, mode }) {
  const { signedIn } = useAuth();
  const isCode = mode === 'code';
  const { form, submit, formError } = useAppForm({
    schema: isCode ? mfaCodeSchema : recoveryCodeSchema,
    defaultValues: isCode ? { code: '' } : { recoveryCode: '' },
    onSubmit: async (values) => {
      await authApi.mfaChallenge({ mfaToken, ...values });
      await signedIn();
    },
  });
  const code = form.watch('code');

  return (
    <Form form={form} onSubmit={submit} error={formError}>
      {isCode ? (
        <OtpField name="code" length={OTP_LENGTH} label="Authentication code" autoFocus />
      ) : (
        <TextField name="recoveryCode" label="Recovery code" placeholder="XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" autoFocus />
      )}
      <SubmitButton fullWidth disabled={isCode && (code?.length ?? 0) < OTP_LENGTH}>Verify</SubmitButton>
    </Form>
  );
}

export default function MfaChallengePage() {
  const location = useLocation();
  // Social sign-in hands the challenge token over in the URL fragment.
  const [mfaToken] = useState(() => location.state?.mfaToken ?? new URLSearchParams(location.hash.slice(1)).get('mfa'));
  const [mode, setMode] = useState('code');

  if (!mfaToken) return <Navigate to="/login" replace />;
  return (
    <AuthCard
      title="Two-factor authentication"
      description={mode === 'code' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter one of your saved recovery codes. Each code works once.'}
      footer={<TextLink to="/login">Back to login</TextLink>}
    >
      <ChallengeForm key={mode} mfaToken={mfaToken} mode={mode} />
      <div className="text-center text-sm">
        <TextLink onClick={() => setMode(mode === 'code' ? 'recovery' : 'code')}>{mode === 'code' ? 'Use a recovery code instead' : 'Use authenticator app instead'}</TextLink>
      </div>
    </AuthCard>
  );
}
