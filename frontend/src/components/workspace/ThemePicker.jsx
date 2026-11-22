import { TENANT_THEMES, hasRole } from '@app/shared';
import { useState } from 'react';
import { workspacesApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../ui/Alert.jsx';
import { RadioCardGroup } from '../ui/RadioCardGroup.jsx';

const THEME_OPTIONS = TENANT_THEMES.map(({ id, label, colors }) => ({
  value: id,
  label,
  preview: (
    <span className="flex shrink-0 overflow-hidden rounded-md border border-line" aria-hidden="true">
      {colors.map((color) => <span key={color} className="size-6" style={{ background: color }} />)}
    </span>
  ),
}));

/** Workspace colour theme chooser: admins pick, everyone in the workspace sees it. Light/dark stays personal. */
export function ThemePicker() {
  const { activeWorkspace, refresh } = useAuth();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // optimistic selection while saving
  if (!activeWorkspace) return <Alert tone="info">Select or create a workspace to change its theme.</Alert>;
  const canEdit = hasRole(activeWorkspace.role, 'admin');

  const choose = async (theme) => {
    setError(null);
    setPending(theme);
    try {
      await workspacesApi.updateTheme(activeWorkspace.id, theme);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <RadioCardGroup name="tenant-theme" label="Workspace theme" value={pending ?? activeWorkspace.theme} onChange={choose} options={THEME_OPTIONS} disabled={!canEdit} />
      {!canEdit && <p className="text-sm text-muted">Only admins and owners can change the workspace theme.</p>}
    </div>
  );
}
