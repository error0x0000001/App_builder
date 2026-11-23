import { DISAPPEAR_OPTIONS, formatBytes, meetingFormSchema, patchConversationSchema } from '@app/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi, download } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Form } from '../../components/forms/Form.jsx';
import { SubmitButton, TextField, TextareaField } from '../../components/forms/fields.jsx';
import { useAppForm } from '../../components/forms/useAppForm.js';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
import { PhotoUpload } from '../../components/ui/PhotoUpload.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/format.js';
import { formatMeeting, localParts, toIso } from '../../lib/meetingTime.js';
import { MeetingFields } from './MeetingFields.jsx';
import { PreviewDialog } from '../documents/PreviewDialog.jsx';
import { FileTypeIcon } from '../documents/FileTypeIcon.jsx';
import { ImageThumb, asDriveFile } from './Attachments.jsx';
import { ChatAvatar } from './ChatAvatar.jsx';
import { KEYS } from './chatCache.js';
import { conversationTitle, nameOf } from './chatFormat.js';
import { useConversation, useInbox, usePeople } from './chatQueries.js';
import { useCall } from './calls/CallProvider.jsx';

const MUTE_OPTIONS = [{ label: 'Mute for 1 hour', hours: 1 }, { label: 'Mute for 8 hours', hours: 8 }, { label: 'Mute for 1 week', hours: 168 }, { label: 'Mute until I turn it on', hours: 24 * 365 * 10 }];
const SHARED_TABS = [{ id: 'media', label: 'Media' }, { id: 'docs', label: 'Docs' }, { id: 'links', label: 'Links' }];

const Section = ({ title, aside, children }) => (
  <section className="border-t border-line px-4 py-4">
    <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>{aside}</div>
    {children}
  </section>
);

/** Media, documents and links shared in this conversation (loaded a page at a time as you ask for more). */
function SharedContent({ conversationId }) {
  const [type, setType] = useState('media');
  const [preview, setPreview] = useState(null);
  const query = useInfiniteQuery({
    queryKey: ['chat', 'shared', conversationId, type],
    queryFn: ({ pageParam }) => chatApi.shared(conversationId, { type, before: pageParam }),
    initialPageParam: undefined, getNextPageParam: (last) => last.nextBefore ?? undefined, staleTime: 15_000,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const files = items.filter((i) => i.file).map((i) => asDriveFile(i.file));
  return (
    <div>
      <Tabs label="Shared content" tabs={SHARED_TABS} value={type} onChange={setType} />
      <div className="pt-3">
        {query.isPending && <div className="flex justify-center py-6"><Spinner /></div>}
        {query.isSuccess && items.length === 0 && <p className="py-6 text-center text-sm text-muted">{type === 'links' ? 'No links shared yet.' : type === 'docs' ? 'No documents shared yet.' : 'No photos or videos shared yet.'}</p>}
        {type === 'media' && items.length > 0 && (
          <ul className="grid grid-cols-3 gap-1" aria-label="Photos and videos">
            {items.map((i) => { const f = asDriveFile(i.file); return <li key={`${i.messageId}:${f.id}`}>{f.kind === 'image' ? <ImageThumb file={f} onClick={() => setPreview(f)} className="aspect-square w-full" /> : <button type="button" onClick={() => setPreview(f)} aria-label={`Open ${f.name}`} className="grid aspect-square w-full place-items-center rounded-lg bg-surface-2"><Icon name="video" className="size-6 text-muted" /></button>}</li>; })}
          </ul>
        )}
        {type === 'docs' && items.length > 0 && (
          <ul className="divide-y divide-line" aria-label="Documents">
            {items.map((i) => { const f = asDriveFile(i.file); return (
              <li key={`${i.messageId}:${f.id}`}><button type="button" onClick={() => setPreview(f)} className="flex w-full items-center gap-3 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                <FileTypeIcon item={f} className="size-8" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{f.name}</span><span className="block text-xs text-muted">{formatBytes(f.size)} · {formatDate(i.createdAt)}</span></span>
              </button></li>
            ); })}
          </ul>
        )}
        {type === 'links' && items.length > 0 && (
          <ul className="divide-y divide-line" aria-label="Links">
            {items.map((i) => (
              <li key={`${i.messageId}:${i.url}`} className="py-2">
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-link hover:underline"><Icon name="link" className="size-4 shrink-0" /><span className="truncate">{i.url}</span></a>
                <p className="mt-0.5 truncate text-xs text-muted">{formatDate(i.createdAt)} · {i.text}</p>
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage && <Button size="sm" variant="ghost" fullWidth className="mt-2" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Show more</Button>}
      </div>
      <PreviewDialog file={preview} files={files} onClose={() => setPreview(null)} onNavigate={setPreview} onDownload={(f) => download(`/drive/files/${f.id}/download`, f.name)} />
    </div>
  );
}

function GroupDetails({ conversation, onSaved }) {
  const { form, submit, formError } = useAppForm({
    schema: patchConversationSchema, defaultValues: { title: conversation.title ?? '', description: conversation.description ?? '' },
    onSubmit: async (values) => { await chatApi.update(conversation.id, { title: values.title, description: values.description?.trim() || null }); onSaved(); },
  });
  return (
    <Form form={form} onSubmit={submit} error={formError}>
      <TextField name="title" label="Group name" />
      <TextareaField name="description" label="Description" rows={2} placeholder="What is this group for?" />
      <SubmitButton size="sm">Save</SubmitButton>
    </Form>
  );
}

function Reschedule({ conversation, onSaved }) {
  const { form, submit, formError } = useAppForm({
    schema: meetingFormSchema.pick({ date: true, time: true }), defaultValues: localParts(conversation.meetingAt),
    onSubmit: async ({ date, time }) => { await chatApi.update(conversation.id, { meetingAt: toIso(date, time) }); onSaved(); },
  });
  return <Form form={form} onSubmit={submit} error={formError}><MeetingFields /><SubmitButton size="sm">Reschedule</SubmitButton></Form>;
}

/**
 * The WhatsApp-style info panel: photo, name and contact details, shared media / docs / links, notification and pin settings, the member list
 * and invite link for groups, groups in common for a person, legal hold for workspace admins.
 */
export function ConversationInfo({ conversationId, onClose }) {
  const { user, activeWorkspace } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const calls = useCall();
  const people = usePeople();
  const { data, isPending, error: loadError } = useConversation(conversationId);
  const inbox = useInbox();
  const item = inbox.data?.conversations.find((c) => c.id === conversationId);
  const [error, setError] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const conversation = data?.conversation;
  const group = conversation?.kind === 'group';
  const peerId = conversation?.members.find((m) => m.userId !== user.id)?.userId;
  const peer = peerId ? people[peerId] : null;
  const admin = conversation?.role === 'admin';
  const workspaceAdmin = ['owner', 'admin'].includes(activeWorkspace?.role);
  const muted = item?.mutedUntil && new Date(item.mutedUntil) > new Date();
  const { data: common } = useQuery({ queryKey: ['chat', 'common', peerId], queryFn: () => chatApi.commonGroups(peerId), enabled: Boolean(peerId && !group) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: KEYS.conversation(conversationId) }), qc.invalidateQueries({ queryKey: KEYS.inbox })]);
  const run = (fn) => async (...args) => { setError(null); try { await fn(...args); await refresh(); } catch (e) { setError(e.message); } };
  const setState = run((patch) => chatApi.setState(conversationId, patch));
  const inviteUrl = conversation?.inviteCode ? `${location.origin}/app/chat/join/${conversation.inviteCode}` : null;
  const title = conversation ? conversationTitle({ ...conversation, peerId }, people) : '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" role="complementary" aria-label={group ? 'Group info' : 'Contact info'}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Button size="icon" variant="ghost" aria-label="Close info" onClick={onClose}><Icon name="x" className="size-4" /></Button>
        <h2 className="text-sm font-semibold text-ink">{group ? 'Group info' : 'Contact info'}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(error || loadError) && <div className="p-4"><Alert tone="error">{error ?? loadError.message}</Alert></div>}
        {isPending && <div className="flex justify-center py-10"><Spinner /></div>}
        {conversation && (
          <>
            <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
              {group && admin ? <PhotoUpload name={title} src={conversation.icon} onUpload={async (file) => { await chatApi.uploadIcon(conversationId, file); await refresh(); }} onRemove={async () => { await chatApi.removeIcon(conversationId); await refresh(); }} />
                : group ? <ChatAvatar conversation={{ ...conversation, peerId }} people={people} size="size-28" /> : <Avatar name={title} src={peer?.avatar} size="size-28" className="text-3xl" />}
              <h3 className="mt-3 max-w-full truncate text-lg font-semibold text-ink">{title}</h3>
              {group ? <p className="text-sm text-muted">Group · {conversation.members.length} members</p> : (
                <>
                  {peer?.jobTitle && <p className="text-sm text-ink">{peer.jobTitle}</p>}
                  {peer?.email && <p className="text-sm text-muted">{peer.email}</p>}
                </>
              )}
              {calls.enabled && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="neutral" disabled={Boolean(calls.session)} onClick={() => calls.startCall(conversationId, false)}><Icon name="phone" className="size-4" />Audio</Button>
                  <Button size="sm" variant="neutral" disabled={Boolean(calls.session)} onClick={() => calls.startCall(conversationId, true)}><Icon name="video" className="size-4" />Video</Button>
                </div>
              )}
            </div>

            {group && (admin ? <Section title="About"><GroupDetails key={`${conversation.title}|${conversation.description}`} conversation={conversation} onSaved={refresh} /></Section> : conversation.description && <Section title="Description"><p className="whitespace-pre-wrap text-sm text-ink">{conversation.description}</p></Section>)}

            {group && conversation.meetingAt && <Section title={`Meeting · ${formatMeeting(conversation.meetingAt)}`}>{admin ? <Reschedule key={conversation.meetingAt} conversation={conversation} onSaved={refresh} /> : <p className="text-sm text-muted">Only admins can reschedule.</p>}</Section>}

            <Section title="Media, docs and links"><SharedContent conversationId={conversationId} /></Section>

            <Section title="Notifications and chat">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold text-ink">Mute notifications</p><p className="text-xs text-muted">{muted ? 'Muted' : 'You will be notified of new messages'}</p></div>
                  {muted ? <Button size="sm" variant="neutral" onClick={() => setState({ mutedUntil: null })}><Icon name="bell" className="size-4" />Unmute</Button> : (
                    <DropdownMenu>
                      <DropdownMenuTrigger>{(props) => <Button {...props} size="sm" variant="neutral"><Icon name="bell-off" className="size-4" />Mute</Button>}</DropdownMenuTrigger>
                      <DropdownMenuContent align="end">{MUTE_OPTIONS.map((o) => <DropdownMenuItem key={o.label} onSelect={() => setState({ mutedUntil: new Date(Date.now() + o.hours * 3_600_000).toISOString() })}>{o.label}</DropdownMenuItem>)}</DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink">Disappearing messages</p>
                  <Select aria-label="Disappearing messages" disabled={group && !admin} options={DISAPPEAR_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))} value={String(conversation.disappearAfter ?? 0)} onChange={(v) => run(() => chatApi.setDisappearing(conversationId, Number(v)))()} />
                  <p className="text-xs text-muted">New messages {conversation.disappearAfter ? 'in this chat disappear after the chosen time (files too).' : 'stay until someone deletes them.'}{group && !admin ? ' Only admins can change this.' : ''}</p>
                </div>
                <Switch label="Pin chat" checked={Boolean(item?.pinned)} onChange={(e) => setState({ pinned: e.target.checked })} />
                <Switch label="Archive chat" description="Hidden from your list until someone writes again." checked={Boolean(item?.archived)} onChange={(e) => setState({ archived: e.target.checked })} />
                {workspaceAdmin && <Switch label="Legal hold" description="Freezes this conversation: nothing in it can be edited or deleted." checked={conversation.legalHold} onChange={(e) => run(() => chatApi.setLegalHold(conversationId, e.target.checked))()} />}
              </div>
            </Section>

            {!group && common?.groups.length > 0 && (
              <Section title={`${common.groups.length} ${common.groups.length === 1 ? 'group' : 'groups'} in common`}>
                <ul className="divide-y divide-line">
                  {common.groups.map((g) => <li key={g.id}><button type="button" onClick={() => navigate(`/app/chat/${g.id}`)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-surface-2"><ChatAvatar conversation={{ kind: 'group', title: g.title }} people={people} size="size-9" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{g.title}</span><span className="block text-xs text-muted">{g.members} members</span></span></button></li>)}
                </ul>
              </Section>
            )}

            {group && (
              <Section title={`${conversation.members.length} members`}>
                {admin && (
                  <div className="mb-3 space-y-3">
                    <PeoplePicker label="Add members" placeholder="Add people by name or email" exclude={conversation.members.map((m) => m.userId)} onPick={(p) => run(chatApi.addMembers)(conversationId, [p.id])} />
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
                  </div>
                )}
                <ul className="divide-y divide-line">
                  {conversation.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 py-2">
                      <Avatar name={nameOf(people, m.userId)} src={people[m.userId]?.avatar} size="size-9" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{nameOf(people, m.userId)}{m.userId === user.id && ' (you)'}</span><span className="block truncate text-xs text-muted">{people[m.userId]?.jobTitle ?? people[m.userId]?.email}</span></span>
                      {m.role === 'admin' && <span className={cn('rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-muted')}>Admin</span>}
                      {admin && m.userId !== user.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger>{(props) => <Button {...props} size="icon" variant="ghost" aria-label={`Manage ${nameOf(people, m.userId)}`}><Icon name="more-horizontal" className="size-4" /></Button>}</DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem icon="chat" onSelect={async () => { const dm = await chatApi.openDm(m.userId); navigate(`/app/chat/${dm.conversation.id}`); }}>Message</DropdownMenuItem>
                            <DropdownMenuItem icon="user" onSelect={run(() => chatApi.setRole(conversationId, m.userId, m.role === 'admin' ? 'member' : 'admin'))}>{m.role === 'admin' ? 'Remove as admin' : 'Make admin'}</DropdownMenuItem>
                            <DropdownMenuItem icon="trash" className="text-danger" onSelect={run(() => chatApi.removeMember(conversationId, m.userId))}>Remove from group</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {group && <div className="border-t border-line p-4"><Button variant="neutral" fullWidth onClick={() => setLeaving(true)} className="text-danger"><Icon name="log-out" className="size-4" />Leave group</Button></div>}
          </>
        )}
      </div>
      <ConfirmDialog
        open={leaving} title="Leave this group?" description="You will stop receiving messages and will not be able to read the history unless someone adds you again." confirmLabel="Leave" danger onClose={() => setLeaving(false)}
        onConfirm={async () => { await chatApi.removeMember(conversationId, user.id); await qc.invalidateQueries({ queryKey: KEYS.inbox }); onClose(); navigate('/app/chat'); }}
      />
    </div>
  );
}
