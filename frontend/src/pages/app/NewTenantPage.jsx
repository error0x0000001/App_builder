import { useNavigate } from 'react-router-dom';
import { createTenantSchema } from '@app/shared';
import { tenantsApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Section } from '../../components/ui/Card.jsx';

export default function NewTenantPage() {
  const { switchTenant } = useAuth();
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: createTenantSchema,
    defaultValues: { name: '' },
    onSubmit: async (values) => {
      const { tenant } = await tenantsApi.create(values);
      await switchTenant(tenant.id); // RequireOnboarding then routes the new owner through setup
      navigate('/app');
    },
  });
  return (
    <Section title="Create an organisation" description="An organisation is a separate space for a team, with its own members and roles." className="max-w-xl">
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="name" label="Organisation name" placeholder="Acme Inc." />
        <SubmitButton>Create organisation</SubmitButton>
      </Form>
    </Section>
  );
}
