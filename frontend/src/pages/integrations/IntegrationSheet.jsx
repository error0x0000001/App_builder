import { useQueryClient } from '@tanstack/react-query';
import { INTEGRATION_CATEGORIES, integrationBodySchema, secretFieldKeys } from '@app/shared';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { integrationsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { PasswordField, SelectField, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { ProviderTile, STATUS } from './parts.jsx';

const dotted = 'border-t border-dotted border-line-strong';

/** The form's initial values: stored settings, then each field's default. Secrets start empty — the stored value never reaches the browser. */
const initialValues = (def, state) => ({
  config: Object.fromEntries(def.fields.filter((f) => f.type !== 'secret').map((f) => [f.key, state.config?.[f.key] ?? f.default ?? ''])),
  secrets: Object.fromEntries(def.fields.filter((f) => f.type === 'secret').map((f) => [f.key, ''])),
});

/**
 * Untitled UI "Integration menu" drawer: the two logos with a swap arrow, a title and blurb, what it is used for, then the connection form
 * (generated from the shared registry, validated by the same schema as the API), and the three steps: save → test → turn on.
 */
export function IntegrationSheet({ def, state, onClose }) {
  const queryClient = useQueryClient();
  const category = INTEGRATION_CATEGORIES.find((c) => c.id === def.category);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const status = STATUS[state.status] ?? STATUS.unconfigured;
  const secretsSaved = new Set(state.secretsSet);

  const schema = useMemo(() => {
    const api = integrationBodySchema(def.key);
    return z.preprocess((v) => ({ ...v, secrets: Object.fromEntries(Object.entries(v?.secrets ?? {}).filter(([, x]) => x)) }), api).superRefine((value, ctx) => {
      for (const key of secretFieldKeys(def.key)) {
        if (!value.secrets?.[key] && !secretsSaved.has(key)) ctx.addIssue({ code: 'custom', path: ['secrets', key], message: `${def.fields.find((f) => f.key === key).label} is required` });
      }
    });
  }, [def, state.secretsSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations'] });
  const { form, submit, formError } = useAppForm({
    schema, defaultValues: initialValues(def, state),
    onSubmit: async (values) => {
      const body = { config: values.config, secrets: Object.fromEntries(Object.entries(values.secrets ?? {}).filter(([, v]) => v)) };
      await integrationsApi.save(def.key, body);
      setNotice('Saved. Test the connection to make sure it works.');
      await refresh();
      form.reset(initialValues(def, { ...state, config: values.config }));
    },
  });

  const run = async (name, fn) => { setBusy(name); setNotice(null); try { await fn(); await refresh(); } catch (e) { setNotice(e.message); } finally { setBusy(null); } };
  const test = () => run('test', () => integrationsApi.test(def.key));
  const toggle = (enabled) => run('enable', () => integrationsApi.setEnabled(def.key, enabled));
  const disconnect = () => run('disconnect', async () => { await integrationsApi.disconnect(def.key); onClose(); });
  const dirty = form.formState.isDirty;

  return (
    <Sheet
      open onClose={onClose} title={def.name} width="w-[30rem]"
      footer={(
        <div className="flex flex-wrap items-center gap-2">
          {state.saved && <Button variant="neutral" size="sm" className="text-danger!" loading={busy === 'disconnect'} onClick={disconnect}>Disconnect</Button>}
          <span className="ml-auto" />
          {state.saved && <Button variant="neutral" size="sm" loading={busy === 'test'} disabled={dirty} onClick={test}>Test connection</Button>}
          <Button size="sm" type="submit" form={`integration-${def.key}`} loading={form.formState.isSubmitting} disabled={state.saved && !dirty}>{state.saved ? 'Save changes' : 'Save and continue'}</Button>
        </div>
      )}
    >
      <div className="-mt-2 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl border border-line bg-surface-2"><Logo markOnly size="sm" /></span><Icon name="swap" className="size-4 text-placeholder" /><ProviderTile def={def} size="lg" /></div>
        <div><h3 className="text-base font-semibold text-ink">Connect {def.name}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted">{def.description}</p></div>
        <div className="flex flex-wrap items-center justify-center gap-1.5"><Badge tone={status.tone} dot>{status.label}</Badge>{!def.live && <Badge tone="neutral">Nothing uses this yet</Badge>}</div>
      </div>

      <section aria-label="What it is used for" className={`${dotted} pt-4`}>
        <h4 className="mb-2 text-sm font-semibold text-ink">{def.live ? 'Once on, Cloudbase uses it for' : 'Planned use'}</h4>
        <ul className="space-y-1.5">{def.uses.map((u) => <li key={u} className="flex items-start gap-2 text-sm text-muted"><Icon name="check" className={`mt-0.5 size-4 shrink-0 ${def.live ? 'text-success' : 'text-placeholder'}`} />{u}</li>)}</ul>
        {!def.live && <p className="mt-2 text-xs text-muted">You can connect and test it now; features will start using it as they are built. Until then it has no effect.</p>}
      </section>

      <section aria-label="Connection" className={`${dotted} pt-4`}>
        {state.status === 'error' && state.statusMessage && <Alert tone="error" title="The last test failed" className="mb-3">{state.statusMessage}</Alert>}
        {state.status === 'connected' && state.statusMessage && !dirty && <Alert tone="success" title="Connected" className="mb-3">{state.statusMessage}</Alert>}
        {notice && <Alert tone={/saved/i.test(notice) ? 'success' : 'error'} className="mb-3">{notice}</Alert>}
        <Form form={form} onSubmit={submit} error={formError} id={`integration-${def.key}`}>
          {def.fields.map((f) => {
            const name = f.type === 'secret' ? `secrets.${f.key}` : `config.${f.key}`;
            if (f.type === 'select') return <SelectField key={f.key} name={name} label={f.label} hint={f.hint} options={f.options} required={f.required} />;
            if (f.type === 'secret') return <PasswordField key={f.key} name={name} label={f.label} autoComplete="off" placeholder={secretsSaved.has(f.key) ? '•••••••• saved — leave blank to keep' : undefined} hint={f.hint} required={f.required && !secretsSaved.has(f.key)} />;
            return <TextField key={f.key} name={name} label={f.label} hint={f.hint} placeholder={f.placeholder} required={f.required} type={f.type === 'number' ? 'number' : 'text'} autoComplete="off" />;
          })}
        </Form>
      </section>

      {state.saved && (
        <section aria-label="Use it" className={`${dotted} pt-4`}>
          <Switch
            label={`Use ${def.name} for ${category.label.toLowerCase()}`}
            description={state.status === 'connected' ? 'It is connected. Turning it on makes Cloudbase use it.' : 'Available once the connection test passes.'}
            checked={state.enabled} disabled={busy === 'enable' || (state.status !== 'connected' && !state.enabled)}
            onChange={(e) => toggle(e.target.checked)}
          />
          {['email', 'storage', 'maps'].includes(def.category) && <p className="mt-2 text-xs text-muted">Only one {category.label.toLowerCase()} provider can be on at a time; turning this on turns the others off.</p>}
        </section>
      )}
    </Sheet>
  );
}
