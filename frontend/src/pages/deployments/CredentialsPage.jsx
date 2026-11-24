import { useQuery, useQueryClient } from '@tanstack/react-query';
import { credentialBodySchema } from '@app/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, TextField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { ago } from './parts.jsx';

const KIND = { registry: ['Container registry', 'blue', 'package'], git: ['Git token', 'purple', 'branch'] };
const schema = z.preprocess((v) => ({ ...v, url: v.url || undefined, username: v.username || undefined }), credentialBodySchema);

function NewCredential({ onClose, onSaved }) {
  const { form, submit, formError } = useAppForm({ schema, defaultValues: { kind: 'registry', name: '', url: '', username: '', secret: '' }, onSubmit: async (v) => { await deploymentsApi.addCredential(v); onSaved(); } });
  const kind = form.watch('kind');
  return (
    <Dialog open onClose={onClose} label="New credential" className="max-w-md">
      <div className="space-y-4 p-5">
        <div><h2 className="text-base font-semibold text-ink">New credential</h2><p className="mt-1 text-sm text-muted">Saved once, encrypted, and reused by any service. You can’t read it back.</p></div>
        <Form form={form} onSubmit={submit} error={formError}>
          <SelectField name="kind" label="Type" options={[{ value: 'registry', label: 'Container registry' }, { value: 'git', label: 'Git access token' }]} />
          <TextField name="name" label="Name" placeholder={kind === 'registry' ? 'GitHub Container Registry' : 'GitHub (read-only)'} autoFocus required />
          {kind === 'registry' && <><TextField name="url" label="Registry" placeholder="ghcr.io (blank = Docker Hub)" /><TextField name="username" label="Username" required /></>}
          <TextField name="secret" label={kind === 'registry' ? 'Password or token' : 'Access token'} type="password" autoComplete="off" required />
          <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={onClose}>Cancel</Button><SubmitButton size="sm">Save</SubmitButton></div>
        </Form>
      </div>
    </Dialog>
  );
}

/** Registry logins and Git tokens a workspace saves once and picks when creating a service. */
export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['deployments', 'credentials'], queryFn: deploymentsApi.credentials });
  const [adding, setAdding] = useState(false); const [error, setError] = useState(null);
  const rows = query.data?.credentials ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments', 'credentials'] });
  return (
    <div className="max-w-3xl space-y-5">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>}>
        <Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />New credential</Button>
      </PageToolbar>
      <div><h1 className="text-lg font-semibold text-ink">Credentials</h1><p className="text-sm text-muted">Logins for private container registries and Git repositories.</p></div>
      {error && <Alert tone="error">{error}</Alert>}
      {rows.length === 0 && !query.isPending ? (
        <div className="grid place-items-center gap-3 py-14 text-center"><FeaturedIcon icon="key" color="brand" size="xl" /><div><p className="text-base font-semibold text-ink">No credentials yet</p><p className="text-sm text-muted">Add one to deploy private images or repositories.</p></div></div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3">
              <FeaturedIcon icon={KIND[c.kind][2]} color={KIND[c.kind][1]} size="sm" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{c.name}</p><p className="truncate text-xs text-muted">{[c.url, c.username].filter(Boolean).join(' · ') || 'Token'} · added {ago(c.createdAt)}</p></div>
              <Badge tone="neutral">{KIND[c.kind][0]}</Badge>
              <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={async () => { setError(null); try { await deploymentsApi.deleteCredential(c.id); refresh(); } catch (e) { setError(e.message); } }}><Icon name="trash" className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {adding && <NewCredential onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}
