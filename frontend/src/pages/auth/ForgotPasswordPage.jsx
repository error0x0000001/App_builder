import { useState } from 'react';
import { emailOnlySchema } from '@app/shared';
import { authApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState(null);
  const { form, submit, formError } = useAppForm({
    schema: emailOnlySchema,
    defaultValues: { email: '' },
    onSubmit: async (values) => {
      await authApi.forgotPassword(values);
      setSentTo(values.email);
    },
  });

  if (sentTo) {
    return (
      <AuthCard title="Check your email" description={`If an account exists for ${sentTo}, we sent a link to reset your password. It expires in 60 minutes.`}>
        <Button as={Link} to="/login" fullWidth>Back to login</Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Forgot your password?" description="Enter your email and we’ll send you a link to reset your password." footer={<TextLink to="/login">Cancel</TextLink>}>
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="email" label="Email" type="email" placeholder="you@example.com" autoComplete="email" inputMode="email" prefix={<Icon name="mail" />} />
        <SubmitButton fullWidth>Continue</SubmitButton>
      </Form>
    </AuthCard>
  );
}
