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
import { Badge } from '../../components/ui/Badge.jsx';
import { FeaturedIcon } from '../../components/ui/FeaturedIcon.jsx';
import { useFilePicker } from '../../components/ui/FilePicker.jsx';
import { ProfileHeader } from '../../components/ui/ProfileHeader.jsx';
import { squareJpeg } from '../../lib/squareJpeg.js';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { PeoplePicker } from '../../components/ui/PeoplePicker.jsx';
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
import { usePresence } from './usePresence.js';

const MUTE_OPTIONS = [{ label: 'Mute for 1 hour', hours: 1 }, { label: 'Mute for 8 hours', hours: 8 }, { label: 'Mute for 1 week', hours: 168 }, { label: 'Mute until I turn it on', hours: 24 * 365 * 10 }];
const SHARED_TABS = [{ id: 'media', label: 'Media' }, { id: 'docs', label: 'Docs' }, { id: 'links', label: 'Links' }];

/** A titled block of the panel: a tinted featured icon (Untitled UI), the title, an optional count/aside, then the content. */
const Section = ({ title, icon, color, aside, children }) => (
  <section className="border-t border-line px-4 py-4">
    <div className="mb-3 flex items-center gap-2.5">
      {icon && <FeaturedIcon icon={icon} color={color} size="sm" />}
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</h3>
      {aside}
    </div>
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
 * The contact / group info (Untitled UI "user profile" drawer): gradient banner and photo with presence, role tags, Audio / Video, About, shared media / docs / links,
 * notification settings with tinted icons, members (groups) or groups in common (people). Always a panel on the right of the conversation.
 */
export function ConversationInfo({ conversationId, onClose }) {
  const { user, activeTenant } = useAuth();
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
  const online = usePresence(peerId ? [peerId] : []).includes(peerId);
  const admin = conversation?.role === 'admin';
  const tenantAdmin = ['owner', 'admin'].includes(activeTenant?.role);
  const muted = item?.mutedUntil && new Date(item.mutedUntil) > new Date();
  const { data: common } = useQuery({ queryKey: ['chat', 'common', peerId], queryFn: () => chatApi.commonGroups(peerId), enabled: Boolean(peerId && !group) });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: KEYS.conversation(conversationId) }), qc.invalidateQueries({ queryKey: KEYS.inbox })]);
  const run = (fn) => async (...args) => { setError(null); try { await fn(...args); await refresh(); } catch (e) { setError(e.message); } };
  const setState = run((patch) => chatApi.setState(conversationId, patch));
  const inviteUrl = conversation?.inviteCode ? `${location.origin}/app/chat/join/${conversation.inviteCode}` : null;
  const title = conversation ? conversationTitle({ ...conversation, peerId }, people) : '';
  const iconPicker = useFilePicker({ multiple: false, accept: 'image/png,image/jpeg,image/webp', onPick: async ([file]) => { try { await chatApi.uploadIcon(conversationId, await squareJpeg(file)); await refresh(); } catch (e) { setError(e.message); } } });

  const callButtons = calls.enabled && (
    <>
      <Button size="sm" disabled={Boolean(calls.session)} onClick={() => calls.startCall(conversationId, true)}><Icon name="video" className="size-4" />Video call</Button>
      <Button size="sm" variant="neutral" disabled={Boolean(calls.session)} onClick={() => calls.startCall(conversationId, false)}><Icon name="phone" className="size-4" />Audio call</Button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" role="complementary" aria-label={group ? 'Group info' : 'Contact info'}>
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Button size="icon" variant="ghost" aria-label="Close info" onClick={onClose}><Icon name="x" className="size-4" /></Button>
        <h2 className="text-base font-semibold text-ink">{group ? 'Group info' : 'Contact info'}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {(error || loadError) && <div className="p-4"><Alert tone="error">{error ?? loadError.message}</Alert></div>}
        {isPending && <div className="flex justify-center py-10"><Spinner /></div>}
        {conversation && (
          <>
            <ProfileHeader
              name={title}
              src={group ? conversation.icon : peer?.avatar}
              avatar={group && !conversation.icon ? <ChatAvatar conversation={{ ...conversation, peerId }} people={people} size="size-20" /> : undefined}
              status={group ? undefined : online ? 'online' : 'offline'}
              subtitle={group ? `Group · ${conversation.members.length} members` : peer?.email}
              tags={(
                <div className="flex flex-wrap gap-1.5">
                  {!group && peer?.jobTitle && <Badge tone="accent">{peer.jobTitle}</Badge>}
                  {!group && <Badge tone={online ? 'success' : 'neutral'}>{online ? 'Online' : 'Offline'}</Badge>}
                  {group && conversation.meetingAt && <Badge tone="warning">Meeting</Badge>}
                  {conversation.disappearAfter ? <Badge tone="accent">Disappearing</Badge> : null}
                  {conversation.legalHold && <Badge tone="danger">Legal hold</Badge>}
                </div>
              )}
              actions={<>{callButtons}{group && admin && <Button size="sm" variant="neutral" onClick={iconPicker.open}><Icon name="file-plus" className="size-4" />{conversation.icon ? 'Change photo' : 'Add photo'}</Button>}{group && admin && conversation.icon && <Button size="sm" variant="ghost" onClick={run(() => chatApi.removeIcon(conversationId))}>Remove photo</Button>}</>}
            />
            {iconPicker.input}

            {group && (admin ? <Section title="About" icon="info" color="blue"><GroupDetails key={`${conversation.title}|${conversation.description}`} conversation={conversation} onSaved={refresh} /></Section> : conversation.description && <Section title="About" icon="info" color="blue"><p className="whitespace-pre-wrap text-sm text-ink">{conversation.description}</p></Section>)}

            {group && conversation.meetingAt && <Section title={`Meeting · ${formatMeeting(conversation.meetingAt)}`} icon="calendar" color="orange">{admin ? <Reschedule key={conversation.meetingAt} conversation={conversation} onSaved={refresh} /> : <p className="text-sm text-muted">Only admins can reschedule.</p>}</Section>}

            <Section title="Media, docs and links" icon="image" color="purple"><SharedContent conversationId={conversationId} /></Section>

            <Section title="Settings" icon="settings" color="gray">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3"><FeaturedIcon icon={muted ? 'bell-off' : 'bell'} color="warning" size="sm" /><span className="min-w-0"><span className="block text-sm font-semibold text-ink">Notifications</span><span className="block text-xs text-muted">{muted ? 'Muted' : 'On'}</span></span></span>
                  {muted ? <Button size="sm" variant="neutral" onClick={() => setState({ mutedUntil: null })}>Unmute</Button> : (
                    <DropdownMenu>
                      <DropdownMenuTrigger>{(props) => <Button {...props} size="sm" variant="neutral"><Icon name="bell-off" className="size-4" />Mute</Button>}</DropdownMenuTrigger>
                      <DropdownMenuContent align="end">{MUTE_OPTIONS.map((o) => <DropdownMenuItem key={o.label} onSelect={() => setState({ mutedUntil: new Date(Date.now() + o.hours * 3_600_000).toISOString() })}>{o.label}</DropdownMenuItem>)}</DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="space-y-2">
                  <span className="flex items-center gap-3"><FeaturedIcon icon="timer" color="brand" size="sm" /><span className="text-sm font-semibold text-ink">Disappearing messages</span></span>
                  <Select aria-label="Disappearing messages" disabled={group && !admin} options={DISAPPEAR_OPTIONS.map((o) => ({ value: String(o.seconds), label: o.label }))} value={String(conversation.disappearAfter ?? 0)} onChange={(v) => run(() => chatApi.setDisappearing(conversationId, Number(v)))()} />
                  <p className="text-xs text-muted">{conversation.disappearAfter ? 'New messages disappear after the chosen time (files too).' : 'New messages stay until someone deletes them.'}{group && !admin ? ' Only admins can change this.' : ''}</p>
                </div>
                <Switch leading={<FeaturedIcon icon="pin" color="purple" size="sm" />} label="Pin chat" checked={Boolean(item?.pinned)} onChange={(e) => setState({ pinned: e.target.checked })} />
                <Switch leading={<FeaturedIcon icon="archive" color="gray" size="sm" />} label="Archive chat" description="Hidden until someone writes again." checked={Boolean(item?.archived)} onChange={(e) => setState({ archived: e.target.checked })} />
                {tenantAdmin && <Switch leading={<FeaturedIcon icon="lock" color="error" size="sm" />} label="Legal hold" description="Nothing in this chat can be edited or deleted." checked={conversation.legalHold} onChange={(e) => run(() => chatApi.setLegalHold(conversationId, e.target.checked))()} />}
              </div>
            </Section>

            {!group && common?.groups.length > 0 && (
              <Section title="Groups in common" icon="users" color="teal" aside={<Badge tone="neutral">{common.groups.length}</Badge>}>
                <ul className="-mx-2 space-y-0.5">
                  {common.groups.map((g) => <li key={g.id}><button type="button" onClick={() => navigate(`/app/chat/${g.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"><ChatAvatar conversation={{ kind: 'group', title: g.title }} people={people} size="size-9" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{g.title}</span><span className="block text-xs text-muted">{g.members} members</span></span></button></li>)}
                </ul>
              </Section>
            )}

            {group && (
              <Section title="Members" icon="users" color="success" aside={<Badge tone="success">{conversation.members.length}</Badge>}>
                {admin && (
                  <div className="mb-3 space-y-3">
                    <PeoplePicker label="Add members" placeholder="Add people by name or email" exclude={conversation.members.map((m) => m.userId)} onPick={(p) => run(chatApi.addMembers)(conversationId, [p.id])} />
                    <div className="rounded-xl border border-line p-3">
                      <span className="flex items-center gap-3"><FeaturedIcon icon="link" color="blue" size="sm" /><span className="text-sm font-semibold text-ink">Invite link</span></span>
                      {inviteUrl ? (
                        <div className="mt-2.5 space-y-2">
                          <code className="block truncate rounded-md bg-surface-2 px-2 py-1.5 text-xs">{inviteUrl}</code>
                          <div className="flex gap-2"><Button size="sm" variant="neutral" onClick={() => navigator.clipboard?.writeText(inviteUrl)}><Icon name="copy" className="size-4" />Copy</Button><Button size="sm" variant="ghost" onClick={run(() => chatApi.revokeInvite(conversationId))}>Revoke</Button></div>
                        </div>
                      ) : <Button size="sm" variant="neutral" className="mt-2.5" onClick={run(() => chatApi.createInvite(conversationId))}><Icon name="link" className="size-4" />Create invite link</Button>}
                    </div>
                  </div>
                )}
                <ul className="-mx-2 space-y-0.5">
                  {conversation.members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                      <Avatar name={nameOf(people, m.userId)} src={people[m.userId]?.avatar} size="size-9" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{nameOf(people, m.userId)}{m.userId === user.id && ' (you)'}</span><span className="block truncate text-xs text-muted">{people[m.userId]?.jobTitle ?? people[m.userId]?.email}</span></span>
                      {m.role === 'admin' && <Badge tone="accent">Admin</Badge>}
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

            {group && <div className="border-t border-line px-4 pt-4"><Button variant="neutral" fullWidth onClick={() => setLeaving(true)} className="text-danger"><Icon name="log-out" className="size-4" />Leave group</Button></div>}
          </>
        )}
      </div>
      <ConfirmDialog
        open={leaving} title="Leave this group?" description="You will stop receiving messages and will not be able to read the history unless someone adds you again." confirmLabel="Leave" danger onClose={() => setLeaving(false)}
        onConfirm={async () => { await chatApi.removeMember(conversationId, user.id); await qc.invalidateQueries({ queryKey: KEYS.inbox }); navigate('/app/chat'); }}
      />
    </div>
  );
}
