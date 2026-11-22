import { toolInputSchemaFrom } from '@app/shared';
import { useState } from 'react';
import { download, setupApi } from '../../api/endpoints.js';
import { CheckboxField, SelectField, SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Section } from '../../components/ui/Card.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { QueryState } from './QueryState.jsx';
import { useSetupPage } from './useSetupPage.js';

const FIELD = { bool: CheckboxField, select: SelectField, textarea: TextareaField, text: TextField };
const initialOf = (fields) => Object.fromEntries(fields.map((f) => [f.key, f.type === 'bool' ? false : '']));

/** What a tool run reports. Never claims more than the server did (`active:false` = recorded only). */
function ToolResult({ result }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Alert tone={result.ok === false ? 'error' : result.active === false ? 'warning' : 'success'}>{result.message}</Alert>
      {result.errors?.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {result.unmappedColumns?.length > 0 && <p className="text-sm text-muted">Ignored columns: {result.unmappedColumns.join(', ')}</p>}
      {result.output && (
        <div className="space-y-2">
          <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink">{result.output}</pre>
          <Button size="sm" variant="neutral" onClick={async () => { await navigator.clipboard.writeText(result.output); setCopied(true); }}><Icon name="copy" className="size-4" />{copied ? 'Copied' : 'Copy HTML'}</Button>
        </div>
      )}
    </div>
  );
}

function ToolDialog({ page, tool, onClose }) {
  const [result, setResult] = useState(null);
  const { form, submit, formError } = useAppForm({
    schema: toolInputSchemaFrom(tool),
    defaultValues: initialOf(tool.fields),
    onSubmit: async (values) => {
      const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      const res = await setupApi.run(page.key, clean);
      if (res.download) await download(res.download.url, res.download.filename);
      setResult(res);
    },
  });

  return (
    <Dialog open onClose={onClose} label={page.name} className="max-w-xl">
      <Form form={form} onSubmit={submit} error={formError} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">{page.name}</h2>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto px-px py-px">
          {tool.fields.map((f) => {
            const Field = FIELD[f.type] ?? TextField;
            return <Field key={f.key} name={f.key} label={f.label} required={f.required && f.type !== 'bool'} {...(f.type === 'select' ? { options: f.options, placeholder: 'Select…' } : {})} {...(f.key === 'csv' ? { rows: 8, spellCheck: false } : {})} />;
          })}
        </div>
        {result && <ToolResult result={result} />}
        <div className="flex justify-end gap-2">
          <Button variant="neutral" size="sm" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          <SubmitButton size="sm" variant={tool.danger ? 'danger' : 'primary'}>{tool.submit}</SubmitButton>
        </div>
      </Form>
    </Dialog>
  );
}

function InfoBody({ page, tool }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // A tool without a real handler is recorded by the server and reported honestly as "not active".
  const recordOnly = async () => {
    setBusy(true); setError(null);
    try { setResult(await setupApi.run(page.key, {})); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Section title={page.title ?? page.name} description={page.desc}>
      <div className="space-y-4">
        {page.facts?.length > 0 && <ul className="space-y-1.5 text-sm text-muted">{page.facts.map((f) => <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-success" />{f}</li>)}</ul>}
        {error && <Alert tone="error">{error}</Alert>}
        {result && <ToolResult result={result} />}
        {page.cta && <Button onClick={tool ? () => setOpen(true) : recordOnly} loading={busy}>{page.cta}</Button>}
      </div>
      {open && <ToolDialog page={page} tool={tool} onClose={() => setOpen(false)} />}
    </Section>
  );
}

/** Tool/info template: description, facts and one call-to-action that opens the tool (or records the request). */
export default function SetupInfoPage({ pageKey }) {
  const query = useSetupPage(pageKey);
  return <QueryState query={query}>{({ page, tool }) => <InfoBody page={page} tool={tool} />}</QueryState>;
}
