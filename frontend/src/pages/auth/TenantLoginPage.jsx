import { useNavigate } from 'react-router-dom';
import { tenantLookupSchema } from '@app/shared';
import { tenantsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';

export default function TenantLoginPage() {
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: tenantLookupSchema,
    defaultValues: { tenant: '' },
    onSubmit: async ({ tenant }) => {
      const found = await tenantsApi.lookup(tenant);
      navigate(`/login?tenant=${encodeURIComponent(found.slug)}`);
    },
  });

  return (
    <AuthCard title="Find your tenant" description="Enter your tenant URL to go to your company’s login page." footer={<TextLink to="/login">Back to login</TextLink>}>
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="tenant" label="Tenant URL" prefix="https://" suffix={<span className="text-sm text-muted">.quelli.app</span>} placeholder="your-company" autoCapitalize="none" autoComplete="off" hint="Letters, numbers and hyphens only." />
        <SubmitButton fullWidth>Continue</SubmitButton>
      </Form>
    </AuthCard>
  );
}
