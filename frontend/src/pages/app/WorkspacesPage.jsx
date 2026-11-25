import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Section } from '../../components/ui/Card.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { List, ListRow } from '../../components/ui/ListRow.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { hueOf } from '../../lib/hue.js';

const COLORS = ['brand', 'blue', 'purple', 'pink', 'orange', 'teal', 'indigo'];

/** Inline name editor shared by "create" and "rename". */
function NameForm({ initial = '', submitLabel, onSubmit, onCancel, busy }) {
  const [name, setName] = useState(initial);
  return (
    <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}>
      <Input aria-label="Workspace name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
      <Button size="sm" type="submit" loading={busy} disabled={!name.trim()}>{submitLabel}</Button>
      <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function WorkspaceList({ tenantId, archived }) {
  const queryClient = useQueryClient();
  const key = ['workspaces', tenantId, archived];
  const query = useQuery({ queryKey: key, queryFn: () => workspacesApi.all(tenantId, true) });
  const [editing, setEditing] = useState(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['workspaces'] }), queryClient.invalidateQueries({ queryKey: ['me'] })]);
  const rename = useMutation({ mutationFn: ({ id, name }) => workspacesApi.rename(tenantId, id, name), onSuccess: () => { setEditing(null); return refresh(); } });
  const toggle = useMutation({ mutationFn: ({ id, archive }) => (archive ? workspacesApi.archive(tenantId, id) : workspacesApi.restore(tenantId, id)), onSettled: refresh });
  const error = rename.error ?? toggle.error;

  if (query.isPending) return <Spinner />;
  const rows = query.data.workspaces.filter((w) => Boolean(w.archivedAt) === archived);
  if (rows.length === 0) return <p className="text-sm text-muted">{archived ? 'No archived workspaces.' : 'No workspaces.'}</p>;
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error.message}</Alert>}
      <List>
        {rows.map((w) => (
          <ListRow
            key={w.id}
            leading={<FeaturedIcon icon="building" color={COLORS[hueOf(w.name) % COLORS.length]} />}
            title={editing === w.id ? <NameForm initial={w.name} submitLabel="Save" busy={rename.isPending} onSubmit={(name) => rename.mutate({ id: w.id, name })} onCancel={() => setEditing(null)} /> : <>{w.name} {w.isDefault && <Badge tone="accent">Default</Badge>}</>}
            subtitle={`${w.members.toLocaleString()} ${w.members === 1 ? 'person' : 'people'} · /${w.slug}`}
            trailing={editing === w.id ? null : (
              <>
                {!archived && <Button variant="ghost" size="sm" aria-label={`Rename ${w.name}`} onClick={() => setEditing(w.id)}><Icon name="edit" /></Button>}
                {!w.isDefault && <Button variant="neutral" size="sm" loading={toggle.isPending && toggle.variables?.id === w.id} onClick={() => toggle.mutate({ id: w.id, archive: !archived })}>{archived ? 'Restore' : 'Archive'}</Button>}
              </>
            )}
          />
        ))}
      </List>
    </div>
  );
}

export default function WorkspacesPage() {
  const { activeTenant } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const create = useMutation({
    mutationFn: (name) => workspacesApi.create(activeTenant.id, name),
    onSuccess: async () => { setAdding(false); await Promise.all([queryClient.invalidateQueries({ queryKey: ['workspaces'] }), queryClient.invalidateQueries({ queryKey: ['me'] })]); },
  });
  if (!activeTenant) return <Alert tone="info">Select an organisation first.</Alert>;
  return (
    <>
      <PageToolbar><Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" />New workspace</Button></PageToolbar>
      {create.error && <Alert tone="error">{create.error.message}</Alert>}
      {adding && <Section title="New workspace" description="A space inside the organisation — a company, branch or team. Assign people to it from their page under Setup › Users."><NameForm submitLabel="Create" busy={create.isPending} onSubmit={(name) => create.mutate(name)} onCancel={() => setAdding(false)} /></Section>}
      <Section title="Workspaces" description={`Spaces inside ${activeTenant.name}. Roles, profiles and settings are shared by all of them; people only see the workspaces they are assigned to.`}>
        <WorkspaceList tenantId={activeTenant.id} archived={false} />
      </Section>
      <Section title="Archived" description="Hidden from every switcher. Restoring brings back the people who were assigned.">
        <WorkspaceList tenantId={activeTenant.id} archived />
      </Section>
    </>
  );
}
