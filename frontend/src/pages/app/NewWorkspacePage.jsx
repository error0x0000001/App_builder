import { useNavigate } from 'react-router-dom';
import { createWorkspaceSchema } from '@app/shared';
import { workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Section } from '../../components/ui/Card.jsx';

export default function NewWorkspacePage() {
  const { switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const { form, submit, formError } = useAppForm({
    schema: createWorkspaceSchema,
    defaultValues: { name: '' },
    onSubmit: async (values) => {
      const { workspace } = await workspacesApi.create(values);
      await switchWorkspace(workspace.id); // RequireOnboarding then routes the new owner through setup
      navigate('/app');
    },
  });
  return (
    <Section title="Create a workspace" description="A workspace is a separate space for a team, with its own members and roles." className="max-w-xl">
      <Form form={form} onSubmit={submit} error={formError}>
        <TextField name="name" label="Workspace name" placeholder="Acme Inc." />
        <SubmitButton>Create workspace</SubmitButton>
      </Form>
    </Section>
  );
}
