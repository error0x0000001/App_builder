import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { setupApi } from '../../api/endpoints.js';
import { SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { TreeNav } from '../../components/ui/TreeNav.jsx';
import { PageHeaderActions } from '../../layouts/PageHeader.jsx';
import { invalidateSetupData } from './invalidate.js';
import { QueryState } from './QueryState.jsx';

const toNodes = (roots) => roots.map((r) => ({ id: r.id, label: r.name, trailing: r.assignedTo || undefined, children: toNodes(r.children), raw: r }));
const flatten = (roots, depth = 0) => roots.flatMap((r) => [{ value: r.id, label: `${'— '.repeat(depth)}${r.name}` }, ...flatten(r.children, depth + 1)]);

const schema = z.object({ name: z.string().trim().min(1, 'Required').max(500), assigned_to: z.string().max(500), parentId: z.string() });

function RoleDialog({ pageKey, roots, onClose }) {
  const queryClient = useQueryClient();
  const { form, submit, formError } = useAppForm({
    schema,
    defaultValues: { name: '', assigned_to: '', parentId: '' },
    onSubmit: async ({ parentId, ...values }) => {
      await setupApi.createRecord(pageKey, parentId ? { ...values, parentId } : values);
      await invalidateSetupData(queryClient);
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} label="Add role" className="max-w-lg">
      <Form form={form} onSubmit={submit} error={formError} className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">Add role</h2>
        <TextField name="name" label="Role name" required />
        <TextField name="assigned_to" label="Assigned to" />
        <SelectField name="parentId" label="Reports to" options={flatten(roots)} placeholder="Top of the hierarchy" />
        <div className="flex justify-end gap-2"><Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button><SubmitButton size="sm">Save</SubmitButton></div>
      </Form>
    </Dialog>
  );
}

/** Role hierarchy: nested tree, add a role anywhere, remove a role that has no sub-roles. */
export default function SetupHierarchyPage({ pageKey }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['setup', 'hierarchy', pageKey], queryFn: () => setupApi.hierarchy(pageKey) });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const nodes = useMemo(() => toNodes(query.data?.roots ?? []).map((n) => decorate(n, setRemoving)), [query.data]);

  return (
    <QueryState query={query}>
      {({ roots }) => (
        <>
          <PageHeaderActions><Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />Add role</Button></PageHeaderActions>
          <div className="rounded-lg border border-line bg-surface p-2">
            <TreeNav nodes={nodes} label="Role hierarchy" isOpenByDefault={() => true} />
          </div>
          {adding && <RoleDialog pageKey={pageKey} roots={roots} onClose={() => setAdding(false)} />}
          <ConfirmDialog
            open={Boolean(removing)} onClose={() => setRemoving(null)} danger confirmLabel="Remove" title={`Remove “${removing?.name}”?`}
            description="Roles with sub-roles can't be removed until those are moved or removed."
            onConfirm={async () => { await setupApi.deleteRecords(pageKey, [removing.id]); await invalidateSetupData(queryClient); }}
          />
        </>
      )}
    </QueryState>
  );
}

/** Adds a remove button next to leaf roles (TreeNav stays generic: it just renders `trailing`). */
function decorate(node, onRemove) {
  const children = node.children.map((c) => decorate(c, onRemove));
  const trailing = (
    <span className="flex items-center gap-2">
      {node.trailing}
      {!children.length && node.raw.name && <button type="button" aria-label={`Remove ${node.raw.name}`} onClick={(e) => { e.stopPropagation(); onRemove(node.raw); }} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"><Icon name="trash" className="size-3.5" /></button>}
    </span>
  );
  return { ...node, children, trailing };
}
