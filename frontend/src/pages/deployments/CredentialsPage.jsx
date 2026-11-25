import { useQuery, useQueryClient } from '@tanstack/react-query';
import { credentialBodySchema } from '@app/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { deploymentsApi } from '../../api/endpoints.js';
import { Form } from '../../components/forms/Form.jsx';
import { SelectField, SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { Hero, Kpi, KpiStrip, Panel, hueFor, tint } from './ui.jsx';
import { CopyField, ago } from './parts.jsx';

const KIND = { registry: ['Container registry', 'blue', 'package'], git: ['Git token', 'purple', 'branch'], ssh: ['SSH key', 'orange', 'terminal'] };
const schema = z.preprocess((v) => ({ ...v, url: v.url || undefined, username: v.username || undefined }), credentialBodySchema);

function NewCredential({ onClose, onSaved }) {
  const { form, submit, formError } = useAppForm({ schema, defaultValues: { kind: 'registry', name: '', url: '', username: '', secret: '' }, onSubmit: async (v) => { await deploymentsApi.addCredential(v); onSaved(); } });
  const kind = form.watch('kind');
  return (
    <Dialog open onClose={onClose} label="New credential" className="max-w-md">
      <div className="space-y-4 p-5">
        <div><h2 className="text-base font-semibold text-ink">New credential</h2><p className="mt-1 text-sm text-muted">Saved once, encrypted, and reused by any service. You can’t read it back.</p></div>
        <Form form={form} onSubmit={submit} error={formError}>
          <SelectField name="kind" label="Type" options={[{ value: 'registry', label: 'Container registry' }, { value: 'git', label: 'Git access token' }, { value: 'ssh', label: 'SSH private key (paste)' }]} />
          <TextField name="name" label="Name" placeholder={kind === 'registry' ? 'GitHub Container Registry' : 'GitHub (read-only)'} autoFocus required />
          {kind === 'registry' && <><TextField name="url" label="Registry" placeholder="ghcr.io (blank = Docker Hub)" /><TextField name="username" label="Username" required /></>}
          {kind === 'ssh' ? <TextareaField name="secret" label="Private key" rows={6} className="font-mono text-xs" required /> : <TextField name="secret" label={kind === 'registry' ? 'Password or token' : 'Access token'} type="password" autoComplete="off" required />}
          <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={onClose}>Cancel</Button><SubmitButton size="sm">Save</SubmitButton></div>
        </Form>
      </div>
    </Dialog>
  );
}

/** Registry logins and Git tokens a tenant saves once and picks when creating a service. */
export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['deployments', 'credentials'], queryFn: deploymentsApi.credentials });
  const [adding, setAdding] = useState(false); const [error, setError] = useState(null); const [generated, setGenerated] = useState(null); const [genName, setGenName] = useState(null);
  const rows = query.data?.credentials ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deployments', 'credentials'] });
  return (
    <div className="space-y-4">
      <PageToolbar meta={<Link to="/app/deployments" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="chevron-left" className="size-4" />Deployments</Link>} />
      <Hero icon="key" color="pink" title="Git, registry & SSH" subtitle="Logins you save once, encrypted, and pick whenever you create a service or add a server."
        actions={<><Button size="sm" variant="neutral" onClick={() => setGenName('')}><Icon name="key" className="size-4" />Generate SSH key</Button><Button size="sm" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" />New credential</Button></>}>
        <KpiStrip><Kpi icon="branch" color="purple" label="Git tokens" value={rows.filter((c) => c.kind === 'git').length} /><Kpi icon="package" color="blue" label="Registry logins" value={rows.filter((c) => c.kind === 'registry').length} /><Kpi icon="terminal" color="orange" label="SSH keys" value={rows.filter((c) => c.kind === 'ssh').length} /><Kpi icon="lock" color="success" label="Stored" value="Encrypted" /></KpiStrip>
      </Hero>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {Object.entries(KIND).map(([kind, [label, color, icon]]) => {
          const list = rows.filter((c) => c.kind === kind);
          return (
            <Panel key={kind} icon={icon} color={color} title={label + (kind === 'git' ? 's' : kind === 'ssh' ? 's' : 's')} description={`${list.length} saved`} bodyClassName="p-0">
              {list.length === 0 ? <p className="p-4 text-sm text-muted">{kind === 'git' ? 'For private repositories.' : kind === 'registry' ? 'For private images.' : 'For connecting to your servers.'}</p> : (
                <ul className="divide-y divide-line">{list.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{c.name}</p><p className="truncate text-xs text-muted">{[c.url, c.username].filter(Boolean).join(' · ') || (kind === 'ssh' ? 'Private key' : 'Token')} · {ago(c.createdAt)}</p>{c.publicKey && <button type="button" onClick={() => setGenerated(c)} className="text-xs font-medium text-link hover:underline">Show public key</button>}</div>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={async () => { setError(null); try { await deploymentsApi.deleteCredential(c.id); refresh(); } catch (e) { setError(e.message); } }}><Icon name="trash" className="size-4" /></Button>
                  </li>
                ))}</ul>
              )}
            </Panel>
          );
        })}
      </div>
      <Dialog open={genName !== null} onClose={() => setGenName(null)} label="Generate SSH key" className="max-w-md">
        <form className="space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); if (!genName.trim()) return; try { const { credential } = await deploymentsApi.generateSshKey(genName.trim()); setGenName(null); refresh(); setGenerated(credential); } catch (err) { setError(err.message); setGenName(null); } }}>
          <div><h2 className="text-base font-semibold text-ink">Generate SSH key</h2><p className="mt-1 text-sm text-muted">Creates an ed25519 key pair. The private key stays encrypted here; you add the public key to your server.</p></div>
          <label className="block text-sm font-medium text-ink">Name<input autoFocus value={genName ?? ''} onChange={(e) => setGenName(e.target.value)} placeholder="production servers" className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ring" /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="neutral" size="sm" onClick={() => setGenName(null)}>Cancel</Button><Button type="submit" size="sm">Generate</Button></div>
        </form>
      </Dialog>
      <Dialog open={Boolean(generated)} onClose={() => setGenerated(null)} label="Public key" className="max-w-xl">
        <div className="space-y-4 p-5"><div><h2 className="text-base font-semibold text-ink">{generated?.name}</h2><p className="mt-1 text-sm text-muted">Add this line to <span className="font-mono text-xs">~/.ssh/authorized_keys</span> on the server (for the user Quelli connects as), then add the server with this key.</p></div>
          {generated && <CopyField label="public key" value={generated.publicKey} />}
          <div className="flex justify-end"><Button size="sm" onClick={() => setGenerated(null)}>Done</Button></div></div>
      </Dialog>
      {adding && <NewCredential onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
    </div>
  );
}
