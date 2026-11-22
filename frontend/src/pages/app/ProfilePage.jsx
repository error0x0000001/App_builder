import { COUNTRIES, updateProfileSchema } from '@app/shared';
import { meApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Section } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { SIDEBAR_VARIANTS, useSidebar } from '../../components/sidebar/SidebarContext.jsx';

/** Shared by the profile page and onboarding's "About you" step. */
export function ProfileForm({ onSaved, submitLabel = 'Save changes' }) {
  const { user, refresh } = useAuth();
  const { form, submit, formError } = useAppForm({
    schema: updateProfileSchema,
    defaultValues: { firstName: user.firstName, lastName: user.lastName, jobTitle: user.jobTitle ?? '', phone: user.phone ?? '', country: user.country ?? '' },
    onSubmit: async (values) => {
      await meApi.updateProfile(values);
      await refresh();
      onSaved?.();
    },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <Input label="Email" value={user.email} readOnly disabled hint="Your email is your username and can’t be changed here." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="firstName" label="First name" autoComplete="given-name" />
        <TextField name="lastName" label="Last name" autoComplete="family-name" />
        <TextField name="jobTitle" label="Job title" autoComplete="organization-title" />
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" />
        <SelectField name="country" label="Country" options={COUNTRIES} placeholder="Select…" />
      </div>
      {form.formState.isSubmitSuccessful && !onSaved && <Alert tone="success">Profile saved.</Alert>}
      <SubmitButton>{submitLabel}</SubmitButton>
    </Form>
  );
}

function AppearanceSection() {
  const { variant, setVariant } = useSidebar();
  return (
    <Section title="Appearance" description="Choose how the sidebar looks. Press Ctrl/Cmd + B to collapse it.">
      <Select label="Sidebar style" value={variant} onChange={setVariant} options={SIDEBAR_VARIANTS} className="max-w-xs" />
    </Section>
  );
}

export default function ProfilePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <Section title="Profile" description="How you appear to teammates.">
        <ProfileForm />
      </Section>
      <AppearanceSection />
    </div>
  );
}
