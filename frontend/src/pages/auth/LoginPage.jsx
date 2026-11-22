import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema } from '@app/shared';
import { authApi, workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { SocialLogin } from '../../components/auth/GoogleButton.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { CheckboxField, PasswordField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';

export default function LoginPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const slug = params.get('workspace') ?? '';
  const from = location.state?.from;

  const workspace = useQuery({ queryKey: ['workspace-lookup', slug], queryFn: () => workspacesApi.lookup(slug), enabled: Boolean(slug), retry: false });

  const { form, submit, formError } = useAppForm({
    schema: loginSchema,
    defaultValues: { email: '', password: '', workspace: slug, rememberMe: true },
    onSubmit: async (values) => {
      const result = await authApi.login(values);
      if (result.mfaRequired) navigate('/login/mfa', { state: { mfaToken: result.mfaToken, from } });
      else await signedIn(); // GuestOnly then forwards to the page the user wanted
    },
    onError: (error) => {
      if (error.code !== 'EMAIL_NOT_VERIFIED') return false;
      navigate('/verify-email', { state: { email: error.details.email } });
      return true;
    },
  });

  return (
    <div className="w-full max-w-[25rem] space-y-4">
      <AuthCard title={workspace.data ? `Sign in to ${workspace.data.name}` : 'Log in'} width="sm">
        {params.get('error') === 'oauth' && <Alert tone="error">Google sign-in failed. Please try again.</Alert>}
        {location.state?.notice && <Alert tone="success">{location.state.notice}</Alert>}
        {slug && workspace.isError && <Alert tone="warning">We couldn’t find that workspace, so you’ll sign in to your default one.</Alert>}
        <SocialLogin />
        <Form form={form} onSubmit={submit} error={formError}>
          <TextField name="email" label="Email" type="email" autoComplete="username" inputMode="email" />
          <PasswordField name="password" label="Password" autoComplete="current-password" />
          <CheckboxField name="rememberMe" label="Remember me" />
          <SubmitButton fullWidth>Log in</SubmitButton>
        </Form>
        <div className="flex justify-between text-sm">
          <TextLink to="/forgot-password">Forgot your password?</TextLink>
          <TextLink to="/login/workspace">Use workspace URL</TextLink>
        </div>
      </AuthCard>
      <div className="space-y-2 text-center text-sm text-muted">
        <p>Not a customer?</p>
        <Button as={Link} to="/signup" variant="neutral" fullWidth>Try for free</Button>
      </div>
    </div>
  );
}
