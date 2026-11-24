import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema } from '@app/shared';
import { authApi, workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { SocialLogin } from '../../components/auth/GoogleButton.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { CheckboxField, PasswordField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
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
    <AuthCard
      title={workspace.data ? `Sign in to ${workspace.data.name}` : 'Welcome back'}
      description="Sign in to access your Quelli workspace"
      footer={<>Don’t have an account? <TextLink to="/signup" className="font-semibold text-ink">Sign up</TextLink> · <TextLink to="/login/workspace">Use workspace URL</TextLink></>}
    >
      {params.get('error') === 'oauth' && <Alert tone="error">Google sign-in failed. Please try again.</Alert>}
      {location.state?.notice && <Alert tone="success">{location.state.notice}</Alert>}
      {slug && workspace.isError && <Alert tone="warning">We couldn’t find that workspace, so you’ll sign in to your default one.</Alert>}
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="email" label="Email" type="email" placeholder="you@example.com" autoComplete="username" inputMode="email" prefix={<Icon name="mail" />} />
        <PasswordField name="password" label="Password" placeholder="••••••••" autoComplete="current-password" prefix={<Icon name="lock" />} />
        <div className="flex items-center justify-between gap-3">
          <CheckboxField name="rememberMe" label="Remember me" />
          <TextLink to="/forgot-password" className="text-sm font-medium text-ink">Forgot password?</TextLink>
        </div>
        <SubmitButton size="lg" fullWidth>Log in</SubmitButton>
      </Form>
      <SocialLogin />
    </AuthCard>
  );
}
