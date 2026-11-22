import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPasswordSchema } from '@app/shared';
import { authApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { NewPasswordField, PasswordField, SubmitButton } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { Button } from '../../components/ui/Button.jsx';

export default function ResetPasswordPage() {
  const token = useSearchParams()[0].get('token');
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: resetPasswordSchema,
    defaultValues: { token: token ?? '', password: '', confirmPassword: '' },
    onSubmit: async (values) => {
      await authApi.resetPassword(values);
      navigate('/login', { state: { notice: 'Your password was updated. Sign in with your new password.' } });
    },
  });

  if (!token) {
    return (
      <AuthCard title="Link not valid">
        <Alert tone="error">This reset link is missing or incomplete.</Alert>
        <Button as={Link} to="/forgot-password" fullWidth>Request a new link</Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description="You’ll be signed out of all other devices.">
      <Form form={form} onSubmit={submit} error={formError}>
        <NewPasswordField label="New password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        <SubmitButton fullWidth>Change password</SubmitButton>
      </Form>
    </AuthCard>
  );
}
