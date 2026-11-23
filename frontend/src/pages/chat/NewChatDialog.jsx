import { createDmSchema, createGroupSchema } from '@app/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { chatApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
import { KEYS } from './chatCache.js';

/** People chips: who is being added, with a remove button. */
export function PersonChips({ people, onRemove }) {
  if (!people.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
      {people.map((p) => (
        <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pl-0.5 pr-2 text-sm">
          <Avatar name={p.name} src={p.avatar} size="size-6" /><span className="max-w-40 truncate">{p.name}</span>
          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)} className="grid size-4 place-items-center rounded-full text-muted hover:text-ink"><Icon name="x" className="size-3" /></button>
        </li>
      ))}
    </ul>
  );
}

function GroupForm({ onCreated }) {
  const [members, setMembers] = useState([]);
  const { form, submit, formError } = useAppForm({
    schema: createGroupSchema.pick({ title: true }),
    defaultValues: { title: '' },
    onSubmit: async ({ title }) => {
      onCreated(await chatApi.createGroup({ title, memberIds: members.map((m) => m.id) }));
    },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <TextField name="title" label="Group name" autoFocus />
      <div className="space-y-2">
        <PeoplePicker label="Add people" placeholder="Add people by name or email" exclude={members.map((m) => m.id)} onPick={(p) => setMembers((list) => [...list, p])} />
        <PersonChips people={members} onRemove={(id) => setMembers((list) => list.filter((m) => m.id !== id))} />
      </div>
      <div className="flex justify-end"><SubmitButton>Create group</SubmitButton></div>
    </Form>
  );
}

/** Start a direct message or a group. Choosing a person for a DM opens (or reuses) the conversation. */
export function NewChatDialog({ mode, onClose, onOpen }) {
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  useEffect(() => { setError(null); }, [mode]);
  if (!mode) return null;

  const created = async (data) => { await qc.invalidateQueries({ queryKey: KEYS.inbox }); onOpen(data.conversation.id); onClose(); };
  const openDm = async (person) => {
    try { created(await chatApi.openDm(createDmSchema.parse({ userId: person.id }).userId)); } catch (e) { setError(e.message); }
  };
  const label = { dm: 'New message', group: 'New group' }[mode];

  return (
    <Dialog open onClose={onClose} label={label} className="max-w-md">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between"><h2 className="text-base font-semibold text-ink">{label}</h2><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><Icon name="x" className="size-4" /></Button></div>
        {error && <Alert tone="error">{error}</Alert>}
        {mode === 'dm' ? <PeoplePicker label="To" placeholder="Search people by name or email" autoFocus onPick={openDm} /> : <GroupForm key={mode} onCreated={created} />}
      </div>
    </Dialog>
  );
}
