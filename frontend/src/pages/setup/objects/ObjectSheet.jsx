import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { objectsApi } from '../../../api/endpoints.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { ErrorBox } from './shared.jsx';

const pascal = (label) => label.trim().replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const BLANK = { key: '', label: '', pluralLabel: '', description: '', icon: 'layers', color: 'brand', workspaceScope: 'workspace', hasOwner: true, allowReports: true, allowActivities: false, allowAttachments: true, trackHistory: false, allowSearch: true, deploymentStatus: 'deployed' };

/** Create or edit an object's details. */
export function ObjectSheet({ open, onClose, object, meta, onSaved }) {
  const editing = Boolean(object);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => (object ? { ...BLANK, ...object } : BLANK));
  const [touched, setTouched] = useState({ key: false, plural: false });
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const save = useMutation({
    mutationFn: () => {
      const { id, kind, fieldCount, archivedAt, createdAt, updatedAt, recordName, recordRules, ...rest } = draft;
      if (editing) { delete rest.key; return objectsApi.update(object.id, rest); }
      return objectsApi.create(rest);
    },
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['objects'] }); await queryClient.invalidateQueries({ queryKey: ['object'] }); onSaved?.(result.object); onClose(); },
  });
  return (
    <Sheet open={open} onClose={onClose} width="w-[32rem]" icon={draft.icon} title={editing ? `Edit ${object.label}` : 'New object'} description={editing ? object.key : 'An object holds one kind of record, like Invoice or Shipment.'}
      footer={<div className="flex justify-end gap-2"><Button variant="neutral" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!draft.label.trim() || !draft.pluralLabel.trim() || !draft.key.trim()} onClick={() => save.mutate()}>{editing ? 'Save changes' : 'Create object'}</Button></div>}>
      <div className="space-y-5">
        <ErrorBox error={save.error} />
        <Input label="Label" required value={draft.label} onChange={(e) => set({ label: e.target.value, ...(!editing && !touched.plural ? { pluralLabel: e.target.value ? `${e.target.value}s` : '' } : {}), ...(!editing && !touched.key ? { key: pascal(e.target.value) } : {}) })} />
        <Input label="Plural label" required value={draft.pluralLabel} onChange={(e) => { setTouched((t) => ({ ...t, plural: true })); set({ pluralLabel: e.target.value }); }} />
        <Input label="API name" required disabled={editing} hint={editing ? 'The API name can’t change.' : 'Letters, numbers and underscores. It can’t be changed later.'} value={draft.key} onChange={(e) => { setTouched((t) => ({ ...t, key: true })); set({ key: e.target.value }); }} />
        <Textarea label="Description" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Icon" options={meta.icons} value={draft.icon} onChange={(icon) => set({ icon })} />
          <Select label="Colour" options={meta.colours} value={draft.color} onChange={(color) => set({ color })} />
        </div>
        <Select label="Records belong to" options={[{ value: 'workspace', label: 'One workspace' }, { value: 'tenant', label: 'The whole organisation (shared)' }]} value={draft.workspaceScope} onChange={(workspaceScope) => set({ workspaceScope })} hint="Shared records are visible in every workspace." />
        <Select label="Status" options={[{ value: 'deployed', label: 'Deployed' }, { value: 'development', label: 'In development' }]} value={draft.deploymentStatus} onChange={(deploymentStatus) => set({ deploymentStatus })} hint="Objects in development aren’t shown to users." />
        <div className="space-y-4 border-t border-line pt-4">
          <Switch label="Records have an owner" description="Needed for “own records” sharing." checked={draft.hasOwner} onChange={(e) => set({ hasOwner: e.target.checked })} />
          <Switch label="Allow reports" checked={draft.allowReports} onChange={(e) => set({ allowReports: e.target.checked })} />
          <Switch label="Allow activities" description="Tasks and events on records." checked={draft.allowActivities} onChange={(e) => set({ allowActivities: e.target.checked })} />
          <Switch label="Allow attachments" checked={draft.allowAttachments} onChange={(e) => set({ allowAttachments: e.target.checked })} />
          <Switch label="Track field history" checked={draft.trackHistory} onChange={(e) => set({ trackHistory: e.target.checked })} />
          <Switch label="Include in search" checked={draft.allowSearch} onChange={(e) => set({ allowSearch: e.target.checked })} />
        </div>
      </div>
    </Sheet>
  );
}
