import { useNavigate } from 'react-router-dom';
import { workspaceLookupSchema } from '@app/shared';
import { workspacesApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { AuthCard } from '../../components/ui/AuthCard.jsx';
import { TextLink } from '../../components/ui/TextLink.jsx';

export default function WorkspaceLoginPage() {
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: workspaceLookupSchema,
    defaultValues: { workspace: '' },
    onSubmit: async ({ workspace }) => {
      const found = await workspacesApi.lookup(workspace);
      navigate(`/login?workspace=${encodeURIComponent(found.slug)}`);
    },
  });

  return (
    <AuthCard title="Find your workspace" description="Enter your workspace URL to go to your company’s login page." footer={<TextLink to="/login">Back to login</TextLink>}>
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="workspace" label="Workspace URL" prefix="https://" suffix={<span className="text-sm text-muted">.cloudbase.app</span>} placeholder="your-company" autoCapitalize="none" autoComplete="off" hint="Letters, numbers and hyphens only." />
        <SubmitButton fullWidth>Continue</SubmitButton>
      </Form>
    </AuthCard>
  );
}
