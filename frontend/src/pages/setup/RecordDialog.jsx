import { recordFormFields, recordFormSchema } from '@app/shared';
import { useQueryClient } from '@tanstack/react-query';
import { setupApi } from '../../api/endpoints.js';
import { CheckboxField, SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';

import { invalidateSetupData } from './invalidate.js';

const FIELD = { select: SelectField, check: CheckboxField, text: TextField };
const blank = (fields, defaults) => Object.fromEntries(fields.map((f) => [f.key, defaults?.[f.key] ?? (f.type === 'check' ? false : '')]));

/** Create / edit one record. Fields and validation come from the shared definition, so the server enforces the same rules. */
export function RecordDialog({ pageKey, collection, title, mode, record, defaults, parentId, onClose }) {
  const queryClient = useQueryClient();
  const fields = recordFormFields(collection, mode);
  const { form, submit, formError } = useAppForm({
    schema: recordFormSchema(collection, mode),
    defaultValues: blank(fields, mode === 'edit' ? record : defaults),
    onSubmit: async (values) => {
      if (mode === 'edit') await setupApi.updateRecord(pageKey, record.id, values);
      else await setupApi.createRecord(pageKey, parentId ? { ...values, parentId } : values);
      await invalidateSetupData(queryClient);
      onClose();
    },
  });

  return (
    <Dialog open onClose={onClose} label={title} className="max-w-lg">
      <Form form={form} onSubmit={submit} error={formError} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto px-px py-px">
          {fields.map((f) => {
            const Field = FIELD[f.type] ?? TextField;
            return <Field key={f.key} name={f.key} label={f.label} required={f.required} {...(f.type === 'select' ? { options: f.options, placeholder: f.required ? undefined : 'Select…' } : {})} />;
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
