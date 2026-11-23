import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { KEYS } from './chatCache.js';
import { conversationTitle, nameOf } from './chatFormat.js';
import { useConversation, useInbox, usePeople } from './chatQueries.js';

const MUTE_OPTIONS = [{ label: 'Mute for 1 hour', hours: 1 }, { label: 'Mute for 8 hours', hours: 8 }, { label: 'Mute for 1 week', hours: 168 }, { label: 'Mute until I turn it on', hours: 24 * 365 * 10 }];

/** Conversation details: members and roles (groups), invite link, rename, mute / pin / archive, legal hold (workspace admins), leave. */
export function ConversationInfoDialog({ open, conversationId, onClose }) {
  const { user, activeWorkspace } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const people = usePeople();
  const { data, isPending, error: loadError } = useConversation(open ? conversationId : null);
  const inbox = useInbox({ enabled: open });
  const item = inbox.data?.conversations.find((c) => c.id === conversationId);
  const [error, setError] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [title, setTitle] = useState(null);
  const conversation = data?.conversation;
  const admin = conversation?.role === 'admin';
  const workspaceAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const group = conversation?.kind === 'group';
  const muted = item?.mutedUntil && new Date(item.mutedUntil) > new Date();

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: KEYS.conversation(conversationId) }), qc.invalidateQueries({ queryKey: KEYS.inbox })]);
  const run = (fn) => async (...args) => { setError(null); try { await fn(...args); await refresh(); } catch (e) { setError(e.message); } };
  const setState = run((patch) => chatApi.setState(conversationId, patch));
  const inviteUrl = conversation?.inviteCode ? `${location.origin}/app/chat/join/${conversation.inviteCode}` : null;

  return (
    <Dialog open={open} onClose={onClose} label="Conversation details" className="max-w-lg">
      <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{conversation ? conversationTitle({ ...conversation, peerId: conversation.members.find((m) => m.userId !== user.id)?.userId }, people) : 'Details'}</h2>
            {group && <p className="text-sm text-muted">{conversation.members.length} members{conversation.description ? ` · ${conversation.description}` : ''}</p>}
          </div>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><Icon name="x" className="size-4" /></Button>
        </div>
        {(error || loadError) && <Alert tone="error">{error ?? loadError.message}</Alert>}
        {isPending && <div className="flex justify-center py-8"><Spinner /></div>}

        {conversation && (
          <>
            <section aria-label="Preferences" className="space-y-1 rounded-xl border border-line p-1">
              <div className="px-3 py-2"><Switch label="Pin to top" checked={Boolean(item?.pinned)} onChange={(e) => setState({ pinned: e.target.checked })} /></div>
              <div className="px-3 py-2"><Switch label="Archive" description="Hidden from your list until someone writes again." checked={Boolean(item?.archived)} onChange={(e) => setState({ archived: e.target.checked })} /></div>
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div><p className="text-sm font-medium text-ink">Notifications</p><p className="text-xs text-muted">{muted ? 'Muted' : 'On'}</p></div>
                {muted ? <Button size="sm" variant="neutral" onClick={() => setState({ mutedUntil: null })}><Icon name="bell" className="size-4" />Turn on</Button> : (
                  <DropdownMenu>
                    <DropdownMenuTrigger>{(props) => <Button {...props} size="sm" variant="neutral"><Icon name="bell-off" className="size-4" />Mute</Button>}</DropdownMenuTrigger>
                    <DropdownMenuContent align="end">{MUTE_OPTIONS.map((o) => <DropdownMenuItem key={o.label} onSelect={() => setState({ mutedUntil: new Date(Date.now() + o.hours * 3_600_000).toISOString() })}>{o.label}</DropdownMenuItem>)}</DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </section>

            {group && admin && (
              <section aria-label="Group settings" className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Group</h3>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title?.trim()) run(chatApi.update)(conversationId, { title: title.trim() }).then(() => setTitle(null)); }}>
                  <Input aria-label="Group name" value={title ?? conversation.title ?? ''} onChange={(e) => setTitle(e.target.value)} />
                  <Button size="md" variant="neutral" type="submit" disabled={title === null || !title.trim()}>Rename</Button>
                </form>
                <div className="rounded-lg border border-line p-3">
                  <p className="text-sm font-medium text-ink">Invite link</p>
                  {inviteUrl ? (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2 py-1.5 text-xs">{inviteUrl}</code>
                      <Button size="sm" variant="neutral" onClick={() => navigator.clipboard?.writeText(inviteUrl)}><Icon name="copy" className="size-4" />Copy</Button>
                      <Button size="sm" variant="ghost" onClick={run(() => chatApi.revokeInvite(conversationId))}>Revoke</Button>
                    </div>
                  ) : <Button size="sm" variant="neutral" className="mt-2" onClick={run(() => chatApi.createInvite(conversationId))}><Icon name="link" className="size-4" />Create invite link</Button>}
                </div>
                <PeoplePicker label="Add members" placeholder="Add people by name or email" exclude={conversation.members.map((m) => m.userId)} onPick={(p) => run(chatApi.addMembers)(conversationId, [p.id])} />
              </section>
            )}

            {group && (
              <section aria-label="Members">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Members</h3>
                <ul className="divide-y divide-line">
                  {conversation.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 py-2">
                      <Avatar name={nameOf(people, m.userId)} size="size-8" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{nameOf(people, m.userId)}{m.userId === user.id && ' (you)'}</span><span className="block truncate text-xs text-muted">{people[m.userId]?.email}</span></span>
                      {m.role === 'admin' && <span className="rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-muted">Admin</span>}
                      {admin && m.userId !== user.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger>{(props) => <Button {...props} size="icon" variant="ghost" aria-label={`Manage ${nameOf(people, m.userId)}`}><Icon name="more-horizontal" className="size-4" /></Button>}</DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem icon="user" onSelect={run(() => chatApi.setRole(conversationId, m.userId, m.role === 'admin' ? 'member' : 'admin'))}>{m.role === 'admin' ? 'Remove as admin' : 'Make admin'}</DropdownMenuItem>
                            <DropdownMenuItem icon="trash" className="text-danger" onSelect={run(() => chatApi.removeMember(conversationId, m.userId))}>Remove from group</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {workspaceAdmin && (
              <section aria-label="Compliance" className="rounded-xl border border-line p-1">
                <div className="px-3 py-2"><Switch label="Legal hold" description="Freezes this conversation: nothing in it can be edited or deleted." checked={conversation.legalHold} onChange={(e) => run(() => chatApi.setLegalHold(conversationId, e.target.checked))()} /></div>
              </section>
            )}

            {group && <Button variant="neutral" onClick={() => setLeaving(true)} className="text-danger"><Icon name="log-out" className="size-4" />Leave group</Button>}
          </>
        )}
      </div>
      <ConfirmDialog
        open={leaving} title="Leave this group?" description="You will stop receiving messages and will not be able to read the history unless someone adds you again." confirmLabel="Leave" danger onClose={() => setLeaving(false)}
        onConfirm={async () => { await chatApi.removeMember(conversationId, user.id); await qc.invalidateQueries({ queryKey: KEYS.inbox }); onClose(); navigate('/app/chat'); }}
      />
    </Dialog>
  );
}
