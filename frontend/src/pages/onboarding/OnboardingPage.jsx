import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { INDUSTRIES, TEAM_SIZES, TIMEZONES, onboardingSchema } from '@app/shared';
import { workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Button } from '../../components/ui/Button.jsx';
import { Stepper } from '../../components/ui/Stepper.jsx';
import { AuthShell } from '../../layouts/AuthShell.jsx';
import { InviteForm } from '../../components/workspace/InviteForm.jsx';
import { ProfileForm } from '../app/ProfilePage.jsx';

const STEPS = ['About you', 'Your company', 'Invite team'];

function CompanyStep({ workspace, onSaved }) {
  const { refresh } = useAuth();
  const { form, submit, formError } = useAppForm({
    schema: onboardingSchema,
    defaultValues: { name: workspace.name, industry: '', teamSize: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone in Object.fromEntries(TIMEZONES.map((t) => [t, 1])) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '' },
    onSubmit: async (values) => {
      await workspacesApi.completeOnboarding(workspace.id, values);
      await refresh();
      onSaved();
    },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Company name" />
        <SelectField name="industry" label="Industry" options={INDUSTRIES} placeholder="Select…" />
        <SelectField name="teamSize" label="Team size" options={TEAM_SIZES} placeholder="Select…" />
        <SelectField name="timezone" label="Time zone" options={TIMEZONES} placeholder="Select…" />
      </div>
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}

const COPY = [
  { title: (name) => `Welcome${name ? `, ${name}` : ''}! Tell us about you`, text: 'We’ll tailor Cloudbase to the way you work.' },
  { title: () => 'About your company', text: 'This is your workspace — you can change it any time.' },
  { title: () => 'Invite your team', text: 'Teammates get an email to set a password and join. You can also do this later.' },
];

export default function OnboardingPage() {
  const { user, activeWorkspace } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const launch = () => navigate('/app', { replace: true });

  if (!activeWorkspace) { launch(); return null; }
  return (
    <AuthShell>
      <div className="w-full max-w-2xl space-y-6">
        <Stepper steps={STEPS} current={step} />
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{COPY[step].title(user.firstName)}</h1>
          <p className="mt-2 text-sm text-muted">{COPY[step].text}</p>
        </header>
        {step === 0 && <ProfileForm submitLabel="Next" onSaved={() => setStep(1)} />}
        {step === 1 && <CompanyStep workspace={activeWorkspace} onSaved={() => setStep(2)} />}
        {step === 2 && (
          <div className="space-y-4">
            <InviteForm workspaceId={activeWorkspace.id} />
            <div className="flex justify-between"><Button variant="neutral" onClick={() => setStep(1)}>Back</Button><Button onClick={launch}>Launch Cloudbase</Button></div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
