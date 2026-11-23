import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, ROLE_LABELS, hasRole, outranks } from '@app/shared';
import { workspacesApi } from '../../api/endpoints.js';
import { cursorPagination } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { InviteForm } from '../../components/workspace/InviteForm.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Section } from '../../components/ui/Card.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { List, ListRow } from '../../components/ui/ListRow.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { formatDate } from '../../lib/format.js';

function MemberList({ workspaceId, actorRole, currentUserId }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({ queryKey: ['members', workspaceId], queryFn: ({ pageParam }) => workspacesApi.members(workspaceId, { after: pageParam }), ...cursorPagination });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
  const changeRole = useMutation({ mutationFn: ({ userId, role }) => workspacesApi.changeRole(workspaceId, userId, role), onSettled: refresh });
  const remove = useMutation({ mutationFn: (userId) => workspacesApi.removeMember(workspaceId, userId), onSettled: refresh });
  const error = changeRole.error ?? remove.error;

  if (query.isLoading) return <Spinner />;
  const members = query.data.pages.flatMap((p) => p.items);
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error.message}</Alert>}
      <List>
        {members.map((m) => {
          const manageable = hasRole(actorRole, 'admin') && outranks(actorRole, m.role) && m.userId !== currentUserId;
          return (
            <ListRow
              key={m.userId}
              leading={<Avatar name={`${m.firstName} ${m.lastName}`} />}
              title={<>{m.firstName} {m.lastName} {m.userId === currentUserId && <Badge>You</Badge>}</>}
              subtitle={`${m.email} · joined ${formatDate(m.joinedAt)}`}
              trailing={manageable ? (
                <>
                  <Select aria-label={`Role for ${m.email}`} value={m.role} onChange={(role) => changeRole.mutate({ userId: m.userId, role })} options={ROLES.filter((r) => outranks(actorRole, r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} className="!h-8 text-xs" />
                  <Button variant="ghost" size="sm" aria-label={`Remove ${m.email}`} onClick={() => remove.mutate(m.userId)}><Icon name="trash" /></Button>
                </>
              ) : <Badge tone="accent">{ROLE_LABELS[m.role]}</Badge>}
            />
          );
        })}
      </List>
      {query.hasNextPage && <Button variant="neutral" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

function PendingInvitations({ workspaceId }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['invitations', workspaceId], queryFn: () => workspacesApi.invitations(workspaceId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] });
  const resend = useMutation({ mutationFn: (id) => workspacesApi.resendInvitation(workspaceId, id), onSettled: refresh });
  const revoke = useMutation({ mutationFn: (id) => workspacesApi.revokeInvitation(workspaceId, id), onSettled: refresh });
  if (!data?.invitations.length) return null;
  return (
    <Section title="Pending invitations" description="These people haven’t accepted yet.">
      <List>
        {data.invitations.map((invitation) => (
          <ListRow
            key={invitation.id}
            title={invitation.email}
            subtitle={`${ROLE_LABELS[invitation.role]} · expires ${formatDate(invitation.expiresAt)}`}
            trailing={<>
              <Button variant="neutral" size="sm" loading={resend.isPending && resend.variables === invitation.id} onClick={() => resend.mutate(invitation.id)}>Resend</Button>
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(invitation.id)}>Revoke</Button>
            </>}
          />
        ))}
      </List>
    </Section>
  );
}

export default function MembersPage() {
  const { activeWorkspace, user } = useAuth();
  if (!activeWorkspace) return <Alert tone="info">Select or create a workspace to manage its members.</Alert>;
  const canInvite = hasRole(activeWorkspace.role, 'admin');
  return (
 <>
      {canInvite && (
        <PageToolbar><Button size="sm" onClick={() => document.getElementById('invite-people')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="plus" />Invite people</Button></PageToolbar>
      )}
      <Section title="Members" description={`People with access to ${activeWorkspace.name}.`}>
        <MemberList workspaceId={activeWorkspace.id} actorRole={activeWorkspace.role} currentUserId={user.id} />
      </Section>
      {canInvite && (
        <>
          <div id="invite-people"><Section title="Invite people" description="They’ll get an email to set a password and join."><InviteForm workspaceId={activeWorkspace.id} /></Section></div>
          <PendingInvitations workspaceId={activeWorkspace.id} />
        </>
      )}
    </>
  );
}
