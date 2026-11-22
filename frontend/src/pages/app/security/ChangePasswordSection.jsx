import { changePasswordSchema } from '@app/shared';
import { meApi } from '../../../api/endpoints.js';
import { Form } from '../../../components/forms/Form.jsx';
import { NewPasswordField, PasswordField, SubmitButton } from '../../../components/forms/fields.jsx';
import { useAppForm } from '../../../components/forms/useAppForm.js';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Section } from '../../../components/ui/Card.jsx';

export function ChangePasswordSection() {
  const { form, submit, formError } = useAppForm({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
    onSubmit: async (values, f) => {
      await meApi.changePassword(values);
      f.reset();
    },
  });
  return (
    <Section title="Password" description="Changing your password signs you out of all your other devices.">
      <Form form={form} onSubmit={submit} error={formError} className="max-w-md space-y-4">
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <NewPasswordField label="New password" />
        <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
        {form.formState.isSubmitSuccessful && <Alert tone="success">Password changed.</Alert>}
        <SubmitButton>Change password</SubmitButton>
      </Form>
    </Section>
  );
}
