import { settingsPatchSchema } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { setupApi } from '../../api/endpoints.js';
import { setupSettingsQuery } from '../../api/queries.js';
import { SelectField, SwitchField, SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Section } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { PageHeaderActions } from '../../layouts/PageHeader.jsx';
import { QueryState } from './QueryState.jsx';
import { useSetupPage } from './useSetupPage.js';

const FIELD = { bool: SwitchField, select: SelectField, textarea: TextareaField, text: TextField };
const fieldsOf = (page) => page.sections.flatMap((s) => s.fields ?? []);
const show = (v) => (v === true ? 'Yes' : v === false ? 'No' : v === '' || v == null ? '—' : String(v));

/** Read-only "label: value" grid, used by detail layouts before Edit is pressed. */
function DetailGrid({ fields, values }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{f.label}</dt>
          <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{show(values[f.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionTable({ section, rows }) {
  const columns = section.table.columns.map((c) => ({ key: c.key, label: c.label, align: c.type === 'number' ? 'right' : undefined }));
  return <DataTable columns={columns} rows={rows.map((r, i) => ({ id: i, ...r }))} empty="No rows" />;
}

function FormBody({ page, pageKey, data, onSaved }) {
  const queryClient = useQueryClient();
  const formId = useId(); // the Save button lives in the page header (outside this <form>), so it is linked by id
  const detail = page.layout === 'detail';
  const [editing, setEditing] = useState(!detail);
  const [conflict, setConflict] = useState(false);
  const fields = useMemo(() => fieldsOf(page), [page]);
  const readOnly = new Set(data.readOnly);
  const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, data.values[f.key] ?? (f.type === 'bool' ? false : '')])), [fields, data.values]);

  const { form, submit, formError, setFormError } = useAppForm({
    schema: settingsPatchSchema(page),
    defaultValues: initial,
    onError: (error) => {
      if (error.status !== 409) return false;
      setConflict(true);
      return true;
    },
    onSubmit: async (values) => {
      const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== initial[k] && !readOnly.has(k)));
      if (!Object.keys(changed).length) { if (detail) setEditing(false); return; }
      const next = await setupApi.saveSettings(pageKey, data.version, changed);
      queryClient.setQueryData(setupSettingsQuery(pageKey).queryKey, next);
      form.reset(Object.fromEntries(fields.map((f) => [f.key, next.values[f.key] ?? (f.type === 'bool' ? false : '')])));
      onSaved();
      setConflict(false);
      if (detail) setEditing(false);
    },
  });

  const reload = async () => { await queryClient.invalidateQueries({ queryKey: setupSettingsQuery(pageKey).queryKey }); setConflict(false); setFormError(null); };
  const dirty = form.formState.isDirty;

  return (
    <Form id={formId} form={form} onSubmit={submit} error={formError} className="space-y-5">
      <PageHeaderActions>
        {editing ? (
          <>
            {dirty && <Button size="sm" variant="neutral" onClick={() => { form.reset(initial); if (detail) setEditing(false); }}>{detail ? 'Cancel' : 'Reset'}</Button>}
            <SubmitButton size="sm" form={formId} disabled={!dirty}>Save</SubmitButton>
          </>
        ) : <Button size="sm" variant="neutral" onClick={() => setEditing(true)}>Edit</Button>}
      </PageHeaderActions>

      {conflict && (
        <Alert tone="warning" title="Someone else changed this page">
          <Button size="sm" variant="ghost" className="-ml-3" onClick={reload}>Reload the latest values</Button>
        </Alert>
      )}

      {page.sections.map((section) => (
        <Section key={section.title} title={section.title}>
          {section.table ? <SectionTable section={section} rows={data.tables?.[section.title] ?? []} /> : editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((f) => {
                const Field = FIELD[f.type] ?? TextField;
                const wide = f.type === 'bool' || f.type === 'textarea';
                return (
                  <div key={f.key} className={wide ? 'sm:col-span-2' : undefined}>
                    <Field name={f.key} label={f.label} disabled={readOnly.has(f.key)} {...(f.type === 'select' ? { options: f.options } : {})} />
                  </div>
                );
              })}
            </div>
          ) : <DetailGrid fields={section.fields} values={data.values} />}
        </Section>
      ))}
    </Form>
  );
}

/** Settings template: every form-type Setup page. Values load with defaults applied, save as a versioned patch of changed keys. */
export default function SetupFormPage({ pageKey }) {
  const definition = useSetupPage(pageKey);
  const settings = useQuery(setupSettingsQuery(pageKey));
  const page = definition.data?.page;
  const [saved, setSaved] = useState(false);
  const onSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 3000); };
  return (
    <QueryState query={settings}>
      {(data) => (page ? (
        <div className="space-y-5">
          {saved && <Alert tone="success">Saved.</Alert>}
          <FormBody key={data.version} page={page} pageKey={pageKey} data={data} onSaved={onSaved} />
        </div>
      ) : null)}
    </QueryState>
  );
}
