import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { appsApi } from '../../../api/endpoints.js';
import { Button } from '../../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Sheet } from '../../../components/ui/Sheet.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { SwitchGroup } from '../../../components/ui/SwitchGroup.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { ErrorBox } from '../../setup/objects/shared.jsx';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/^[^a-z]+/, '').slice(0, 40);
const ROLES = [['owner', 'Owners'], ['admin', 'Admins'], ['member', 'Members'], ['viewer', 'Viewers']];

/** Create an app, or edit one: name, look, who can open it, and removal. */
export function AppSheet({ app, meta, onClose }) {
  const editing = Boolean(app);
  const qc = useQueryClient(); const navigate = useNavigate();
  const [d, setD] = useState(app ?? { key: '', label: '', description: '', icon: 'grid', color: 'brand', active: true });
  const [keyTouched, setKeyTouched] = useState(false); const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [removing, setRemoving] = useState(false);
  const assignments = useQuery({ queryKey: ['app-assignments', app?.key], queryFn: () => appsApi.assignments(app.key), enabled: editing });
  const [roles, setRoles] = useState(null);
  const chosenRoles = roles ?? (assignments.data?.assignments ?? []).filter((a) => a.orgRole).map((a) => a.orgRole);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['apps'] }), qc.invalidateQueries({ queryKey: ['app'] })]);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (editing) {
        await appsApi.update(app.key, { label: d.label, description: d.description, icon: d.icon, color: d.color, active: d.active });
        if (roles) await appsApi.setAssignments(app.key, roles.map((orgRole) => ({ orgRole })));
        await refresh(); onClose();
      } else { const { app: created } = await appsApi.create({ key: d.key, label: d.label, description: d.description, icon: d.icon, color: d.color }); await refresh(); onClose(); navigate(`/app/a/${created.key}`); }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const remove = async () => { await appsApi.remove(app.key); await refresh(); onClose(); navigate('/app'); };
  return (
    <Sheet open onClose={onClose} width="w-[32rem]" icon={d.icon} title={editing ? `Edit ${app.label}` : 'New app'} description={editing ? `/app/a/${app.key}` : 'An app is a set of pages you build yourself.'}
      footer={<div className="flex items-center justify-between">{editing ? <Button variant="ghost" className="text-danger!" onClick={() => setRemoving(true)}>Delete app</Button> : <span />}<div className="flex gap-2"><Button variant="neutral" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!d.label.trim() || !d.key.trim()} onClick={save}>{editing ? 'Save changes' : 'Create app'}</Button></div></div>}>
      <div className="space-y-5">
        <ErrorBox error={error} />
        <Input label="Name" required value={d.label} onChange={(e) => setD((x) => ({ ...x, label: e.target.value, ...(!editing && !keyTouched ? { key: slugify(e.target.value) } : {}) }))} />
        <Input label="Address" required disabled={editing} hint={editing ? 'The address can’t change.' : 'Lower-case letters, numbers and dashes.'} value={d.key} onChange={(e) => { setKeyTouched(true); setD((x) => ({ ...x, key: e.target.value })); }} />
        <Textarea label="Description" rows={2} value={d.description} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3"><Select label="Icon" options={meta.icons} value={d.icon} onChange={(icon) => setD((x) => ({ ...x, icon }))} /><Select label="Colour" options={meta.colours} value={d.color} onChange={(color) => setD((x) => ({ ...x, color }))} /></div>
        {editing && (
          <>
            <Switch label="Active" description="Inactive apps disappear from the launcher." checked={d.active} onChange={(e) => setD((x) => ({ ...x, active: e.target.checked }))} />
            <SwitchGroup label="Who can open it" hint="Leave all off to let everybody in. Admins can always open it." value={chosenRoles} options={ROLES.map(([value, label]) => ({ value, label }))} onChange={setRoles} />
          </>
        )}
      </div>
      <ConfirmDialog open={removing} title={`Delete ${app?.label}?`} description="The app, its menu, pages and blocks are removed. This can’t be undone." confirmLabel="Delete app" danger onConfirm={remove} onClose={() => setRemoving(false)} />
    </Sheet>
  );
}
