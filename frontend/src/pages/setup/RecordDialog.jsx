import { CheckboxField, SelectField, SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';

const FIELD = { select: SelectField, check: CheckboxField, textarea: TextareaField, text: TextField };
const blank = (fields, values) => Object.fromEntries(fields.map((f) => [f.key, values?.[f.key] ?? (f.type === 'check' ? false : '')]));

/**
 * Generic create/edit dialog. The caller supplies the field list, the (shared) validation schema and what saving does,
 * so Setup records and object records use the same form code. `field.type`: text | textarea | select | check | date | number.
 */
export function RecordDialog({ title, fields, schema, values, onSubmit, onClose, children }) {
  const { form, submit, formError } = useAppForm({
    schema,
    defaultValues: blank(fields, values),
    onSubmit: async (v) => { await onSubmit(v); onClose(); },
  });

  return (
    <Dialog open onClose={onClose} label={title} className="max-w-lg">
      <Form form={form} onSubmit={submit} error={formError} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {children}
        <div className="max-h-[55vh] space-y-4 overflow-y-auto px-px py-px">
          {fields.map((f) => {
            const Field = FIELD[f.type] ?? TextField;
            const extra = f.type === 'select' ? { options: f.options, placeholder: f.required ? undefined : 'Select…' } : f.type === 'date' || f.type === 'number' ? { type: f.type === 'number' ? 'text' : 'date', inputMode: f.type === 'number' ? 'decimal' : undefined } : {};
            return <Field key={f.key} name={f.key} label={f.label} required={f.required} {...extra} />;
          })}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button>
          <SubmitButton size="sm">Save</SubmitButton>
        </div>
      </Form>
    </Dialog>
  );
}
