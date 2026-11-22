import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLE_LABELS, acceptNewUserInviteSchema, tokenOnlySchema } from '@app/shared';
import { invitationsApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { CheckboxField, NewPasswordField, PasswordField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageSpinner } from '../../components/ui/Spinner.jsx';

function NewUserForm({ token, preview }) {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: acceptNewUserInviteSchema,
    defaultValues: { token, firstName: '', lastName: '', password: '', confirmPassword: '', acceptTerms: false },
    onSubmit: async ({ confirmPassword, ...values }) => {
      await invitationsApi.accept(values);
      await signedIn();
      navigate('/app', { replace: true });
    },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <p className="text-sm text-muted">Your username will be <b className="text-ink">{preview.email}</b>. Choose a password to finish.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="firstName" label="First name" autoComplete="given-name" />
        <TextField name="lastName" label="Last name" autoComplete="family-name" />
      </div>
      <NewPasswordField label="Password" />
      <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
      <CheckboxField name="acceptTerms" label="I agree to the Main Services Agreement and Privacy Statement." />
      <SubmitButton fullWidth>Accept invitation</SubmitButton>
    </Form>
  );
}

function ExistingUserAction({ token, preview }) {
  const { user, signOut, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: tokenOnlySchema,
    defaultValues: { token },
    onSubmit: async (values) => {
      const { workspaceId } = await invitationsApi.accept(values);
      await switchWorkspace(workspaceId);
      navigate('/app', { replace: true });
    },
  });

  if (!user) {
    const next = `/accept-invite?token=${encodeURIComponent(token)}`;
    return <Button as={Link} to={`/login?next=${encodeURIComponent(next)}`} fullWidth>Sign in to accept</Button>;
  }
  if (user.email !== preview.email) {
    return (
      <div className="space-y-3">
        <Alert tone="warning">This invitation is for {preview.email}, but you’re signed in as {user.email}.</Alert>
        <Button variant="neutral" fullWidth onClick={signOut}>Sign out</Button>
      </div>
    );
  }
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <SubmitButton fullWidth>Accept invitation</SubmitButton>
    </Form>
  );
}

export default function AcceptInvitePage() {
  const token = useSearchParams()[0].get('token');
  const { data: preview, isLoading, isError } = useQuery({ queryKey: ['invitation', token], queryFn: () => invitationsApi.preview(token), enabled: Boolean(token), retry: false });

  if (token && isLoading) return <PageSpinner />;
  if (!token || isError) {
    return (
      <AuthCard title="Invitation not valid">
        <Alert tone="error">This invitation link is invalid, already used, or has expired. Ask your administrator to send a new one.</Alert>
        <Button as={Link} to="/login" fullWidth variant="neutral">Back to login</Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="You’ve been invited"
      description={<>{preview.inviterName ?? 'A teammate'} invited you to join <b className="text-ink">{preview.workspaceName}</b> as <b className="text-ink">{ROLE_LABELS[preview.role]}</b>.</>}
      width={preview.userExists ? 'sm' : 'md'}
    >
      {preview.userExists ? <ExistingUserAction token={token} preview={preview} /> : <NewUserForm token={token} preview={preview} />}
    </AuthCard>
  );
}
