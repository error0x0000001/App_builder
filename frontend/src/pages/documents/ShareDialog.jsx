import { DRIVE_ROLES, DRIVE_ROLE_LABELS } from '@app/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { driveApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Switch } from '../../components/ui/Switch.jsx';

const ROLE_OPTIONS = DRIVE_ROLES.map((value) => ({ value, label: DRIVE_ROLE_LABELS[value] }));
const GENERAL_OPTIONS = [{ value: '', label: 'Restricted — only people added below' }, { value: 'viewer', label: 'Everyone in this organisation can view' }, { value: 'editor', label: 'Everyone in this organisation can edit' }];

/**
 * Share a folder: add people (any member of the organisation) with a role, give the whole tenant access, and choose whether the folder
 * inherits access from the folder above. Managers edit; everyone else sees who has access. Saved in one call.
 */
export function ShareDialog({ open, folder, onClose }) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.id;
  const queryClient = useQueryClient();
  const { data, isPending, error: loadError } = useQuery({ queryKey: ['drive', 'access', folder?.id], queryFn: () => driveApi.access(folder.id), enabled: open && Boolean(folder), gcTime: 0 });
  const [entries, setEntries] = useState([]);
  const [inherit, setInherit] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = data?.folder.role === 'manager';

  useEffect(() => { if (data) { setEntries(data.entries); setInherit(data.folder.inherit); setError(null); } }, [data]);

  const people = entries.filter((e) => e.principalType === 'user');
  const general = entries.find((e) => e.principalType === 'tenant')?.role ?? '';

  const setRole = (principalId, role) => setEntries((list) => list.map((e) => (e.principalId === principalId ? { ...e, role } : e)));
  const add = (person) => { setEntries((list) => [...list, { principalType: 'user', principalId: person.id, role: 'viewer', name: person.name, email: person.email }]); };
  const setGeneral = (role) => setEntries((list) => [...list.filter((e) => e.principalType !== 'tenant'), ...(role ? [{ principalType: 'tenant', principalId: tenantId, role, name: 'Everyone in this organisation', email: null }] : [])]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await driveApi.setAccess(folder.id, { inherit, entries: entries.map(({ principalType, principalId, role }) => ({ principalType, principalId, role })) });
      await queryClient.invalidateQueries({ queryKey: ['drive'] });
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} label="Share folder" className="max-w-lg">
      <div className="space-y-5 p-5">
        <div>
          <h2 className="text-base font-semibold text-ink">Share “{folder?.name}”</h2>
          <p className="mt-0.5 text-sm text-muted">{canEdit ? 'Only people you add can open this folder.' : 'You can see who has access. Only a manager can change it.'}</p>
        </div>
        {(error || loadError) && <Alert tone="error">{error ?? loadError.message}</Alert>}
        {isPending ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <>
            {canEdit && (
              <PeoplePicker exclude={[data.owner.id, ...people.map((e) => e.principalId)]} onPick={add} />
            )}

            <section aria-label="People with access" className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">People with access</h3>
              <ul className="divide-y divide-line">
                <li className="flex items-center gap-3 py-2"><Avatar name={data.owner.name} size="size-8" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{data.owner.name}</span><span className="block truncate text-xs text-muted">{data.owner.email}</span></span><span className="text-sm text-muted">Owner</span></li>
                {people.map((e) => (
                  <li key={e.principalId} className="flex items-center gap-3 py-2">
                    <Avatar name={e.name} size="size-8" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{e.name}</span><span className="block truncate text-xs text-muted">{e.email}</span></span>
                    {canEdit ? (
                      <>
                        <div className="w-32"><Select aria-label={`Role for ${e.name}`} size="sm" options={ROLE_OPTIONS} value={e.role} onChange={(role) => setRole(e.principalId, role)} /></div>
                        <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setEntries((list) => list.filter((x) => x.principalId !== e.principalId))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="x" className="size-4" /></button>
                      </>
                    ) : <span className="text-sm text-muted">{DRIVE_ROLE_LABELS[e.role]}</span>}
                  </li>
                ))}
                {data.inheritedFrom.map((e) => (
                  <li key={`${e.folderId}:${e.principalId}`} className="flex items-center gap-3 py-2">
                    <Avatar name={e.name} size="size-8" className="opacity-60" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{e.name}</span><span className="block truncate text-xs text-muted">From “{e.folderName}”</span></span><span className="text-sm text-muted">{DRIVE_ROLE_LABELS[e.role]}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="General access" className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">General access</h3>
              {canEdit ? <Select aria-label="General access" options={GENERAL_OPTIONS} value={general} onChange={setGeneral} /> : <p className="flex items-center gap-2 text-sm text-ink"><Icon name="globe" className="size-4 text-muted" />{GENERAL_OPTIONS.find((o) => o.value === general)?.label}</p>}
              {folder?.parentId && <Switch label="Inherit access from the folder above" description="Turn off to make this folder Restricted: people with access to the parent do not automatically get in." checked={inherit} onChange={(e) => setInherit(e.target.checked)} disabled={!canEdit} />}
            </section>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="neutral" size="sm" onClick={onClose} disabled={saving}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && <Button size="sm" onClick={save} loading={saving} disabled={isPending}>Save</Button>}
        </div>
      </div>
    </Dialog>
  );
}
