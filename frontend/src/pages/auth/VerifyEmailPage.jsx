import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { OTP_LENGTH, verifyEmailSchema } from '@app/shared';
import { authApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { OtpField, SubmitButton } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';
import { useCooldown } from '../../hooks/useCooldown.js';

export default function VerifyEmailPage() {
  const { state } = useLocation();
  const { signedIn } = useAuth();
  const cooldown = useCooldown(60);
  const [resent, setResent] = useState(false);
  const email = state?.email;

  const { form, submit, formError } = useAppForm({
    schema: verifyEmailSchema,
    defaultValues: { email: email ?? '', code: '' },
    onSubmit: async (values) => {
      await authApi.verifyEmail(values);
      await signedIn(); // GuestOnly forwards new accounts on to onboarding
    },
  });

  if (!email) return <Navigate to="/signup" replace />;

  const resend = async () => {
    await authApi.resendVerification({ email });
    setResent(true);
    cooldown.start();
  };

  return (
    <AuthCard title="Verify your email" description={<>We sent a {OTP_LENGTH}-digit code to <b className="text-ink">{email}</b>. Enter it below.</>} footer={<TextLink to="/signup">Use a different email</TextLink>}>
      {resent && <Alert tone="success">A new code is on its way.</Alert>}
      <Form form={form} onSubmit={submit} error={formError} className="space-y-5">
        <OtpField name="code" length={OTP_LENGTH} autoFocus />
        <SubmitButton fullWidth>Verify</SubmitButton>
      </Form>
      <p className="text-center text-sm text-muted">
        Didn’t get it?{' '}
        {cooldown.active ? `Resend in ${cooldown.remaining}s` : <TextLink onClick={resend}>Resend code</TextLink>}
      </p>
    </AuthCard>
  );
}
