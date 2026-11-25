import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, ROLE_LABELS, hasRole, outranks } from '@app/shared';
import { tenantsApi } from '../../api/endpoints.js';
import { cursorPagination } from '../../api/queries.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { PageToolbar } from '../../layouts/PageToolbar.jsx';
import { InviteForm } from '../../components/tenant/InviteForm.jsx';
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

function MemberList({ tenantId, actorRole, currentUserId }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({ queryKey: ['members', tenantId], queryFn: ({ pageParam }) => tenantsApi.members(tenantId, { after: pageParam }), ...cursorPagination });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members', tenantId] });
  const changeRole = useMutation({ mutationFn: ({ userId, role }) => tenantsApi.changeRole(tenantId, userId, role), onSettled: refresh });
  const remove = useMutation({ mutationFn: (userId) => tenantsApi.removeMember(tenantId, userId), onSettled: refresh });
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

function PendingInvitations({ tenantId }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['invitations', tenantId], queryFn: () => tenantsApi.invitations(tenantId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] });
  const resend = useMutation({ mutationFn: (id) => tenantsApi.resendInvitation(tenantId, id), onSettled: refresh });
  const revoke = useMutation({ mutationFn: (id) => tenantsApi.revokeInvitation(tenantId, id), onSettled: refresh });
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
  const { activeTenant, user } = useAuth();
  if (!activeTenant) return <Alert tone="info">Select or create an organisation to manage its members.</Alert>;
  const canInvite = hasRole(activeTenant.role, 'admin');
  return (
 <>
      {canInvite && (
        <PageToolbar><Button size="sm" onClick={() => document.getElementById('invite-people')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="plus" />Invite people</Button></PageToolbar>
      )}
      <Section title="Members" description={`People with access to ${activeTenant.name}.`}>
        <MemberList tenantId={activeTenant.id} actorRole={activeTenant.role} currentUserId={user.id} />
      </Section>
      {canInvite && (
        <>
          <div id="invite-people"><Section title="Invite people" description="They’ll get an email to set a password and join."><InviteForm tenantId={activeTenant.id} /></Section></div>
          <PendingInvitations tenantId={activeTenant.id} />
        </>
      )}
    </>
  );
}
