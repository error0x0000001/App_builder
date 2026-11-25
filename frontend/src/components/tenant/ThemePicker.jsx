import { TENANT_THEMES, hasRole } from '@app/shared';
import { useState } from 'react';
import { tenantsApi } from '../../api/endpoints.js';
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

/** Tenant colour theme chooser: admins pick, everyone in the tenant sees it. Light/dark stays personal. */
export function ThemePicker({ columns }) {
  const { activeTenant, refresh } = useAuth();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // optimistic selection while saving
  if (!activeTenant) return <Alert tone="info">Select or create a tenant to change its theme.</Alert>;
  const canEdit = hasRole(activeTenant.role, 'admin');

  const choose = async (theme) => {
    setError(null);
    setPending(theme);
    try {
      await tenantsApi.updateTheme(activeTenant.id, theme);
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
      <RadioCardGroup name="tenant-theme" label="Tenant theme" value={pending ?? activeTenant.theme} onChange={choose} options={THEME_OPTIONS} disabled={!canEdit} columns={columns} />
      {!canEdit && <p className="text-sm text-muted">Only admins and owners can change the tenant theme.</p>}
    </div>
  );
}
