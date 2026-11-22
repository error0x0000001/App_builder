import { useNavigate } from 'react-router-dom';
import { COUNTRIES, TEAM_SIZES, signupSchema } from '@app/shared';
import { authApi } from '../../api/endpoints.js';
import { SocialLogin } from '../../components/auth/GoogleButton.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { CheckboxField, NewPasswordField, SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';

export default function SignupPage() {
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: signupSchema,
    defaultValues: { firstName: '', lastName: '', jobTitle: '', email: '', company: '', phone: '', teamSize: '', country: '', password: '', acceptTerms: false },
    onSubmit: async (values) => {
      await authApi.signup(values);
      navigate('/verify-email', { state: { email: values.email } });
    },
  });

  return (
    <AuthCard title="Start your free 30-day trial" description="No credit card required. Set up in minutes." width="lg" footer={<TextLink to="/login">Already have an account? Log in</TextLink>}>
      <SocialLogin label="Sign up with Google" />
      <Form form={form} onSubmit={submit} error={formError}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="firstName" label="First name" autoComplete="given-name" required />
          <TextField name="lastName" label="Last name" autoComplete="family-name" required />
          <TextField name="jobTitle" label="Job title" autoComplete="organization-title" />
          <TextField name="email" label="Work email" type="email" autoComplete="email" inputMode="email" required />
          <TextField name="company" label="Company" autoComplete="organization" required />
          <TextField name="phone" label="Phone" type="tel" autoComplete="tel" />
          <SelectField name="teamSize" label="Employees" options={TEAM_SIZES} placeholder="Select…" />
          <SelectField name="country" label="Country" options={COUNTRIES} placeholder="Select…" />
        </div>
        <NewPasswordField />
        <CheckboxField name="acceptTerms" label="I agree to the Main Services Agreement and Privacy Statement." />
        <SubmitButton fullWidth>Start my free trial</SubmitButton>
      </Form>
    </AuthCard>
  );
}
