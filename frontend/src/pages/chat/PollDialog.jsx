import { createPollSchema } from '@app/shared';
import { chatApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, SwitchField, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { uuidv7 } from '../../lib/uuidv7.js';

/** Create a poll: a question, 2–12 options, single or multiple choice. */
export function PollDialog({ conversationId, open, onClose }) {
  const { form, submit, formError } = useAppForm({
    schema: createPollSchema, defaultValues: { question: '', options: ['', ''], multi: false },
    onSubmit: async (values) => { await chatApi.createPoll(conversationId, { ...values, id: uuidv7() }); form.reset(); onClose(); },
  });
  const options = form.watch('options'); // a flat list of strings: driven from the form values (useFieldArray needs objects)
  const setOptions = (next) => form.setValue('options', next, { shouldDirty: true });
  return (
    <Dialog open={open} onClose={onClose} label="Create poll" className="max-w-md">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between"><h2 className="text-base font-semibold text-ink">Create poll</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><Icon name="x" className="size-4" /></Button></div>
        <Form form={form} onSubmit={submit} error={formError}>
          <TextField name="question" label="Question" autoFocus />
          <div className="space-y-2">
            <span className="text-sm font-medium text-ink">Options</span>
            {options.map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><TextField name={`options.${i}`} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} /></div>
                {options.length > 2 && <Button size="icon" variant="ghost" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((__, j) => j !== i))} className="mt-1"><Icon name="x" className="size-4" /></Button>}
              </div>
            ))}
            {options.length < 12 && <Button size="sm" variant="ghost" onClick={() => setOptions([...options, ''])}><Icon name="plus" className="size-4" />Add option</Button>}
          </div>
          <SwitchField name="multi" label="Allow multiple answers" />
          <div className="flex justify-end"><SubmitButton>Send poll</SubmitButton></div>
        </Form>
      </div>
    </Dialog>
  );
}
