import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meApi } from '../../../api/endpoints.js';
import { useAuth } from '../../../auth/AuthProvider.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Section } from '../../../components/ui/Card.jsx';
import { List, ListRow } from '../../../components/ui/ListRow.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { formatDateTime } from '../../../lib/format.js';
import { describeUserAgent } from '@app/shared';

export function SessionsSection() {
  const queryClient = useQueryClient();
  const { signOutEverywhere } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['sessions'], queryFn: meApi.sessions });
  const revoke = useMutation({ mutationFn: meApi.revokeSession, onSettled: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }) });

  return (
    <Section title="Active sessions" description="Devices currently signed in to your account." action={<Button variant="neutral" size="sm" onClick={signOutEverywhere}>Sign out everywhere</Button>}>
      {isLoading ? <Spinner /> : (
        <List>
          {data.sessions.map((s) => (
            <ListRow
              key={s.id}
              title={<>{describeUserAgent(s.userAgent)} {s.current && <Badge tone="success">This device</Badge>}</>}
              subtitle={`${s.ip ?? 'Unknown IP'} · last active ${formatDateTime(s.lastUsedAt)}`}
              trailing={!s.current && <Button variant="ghost" size="sm" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>Revoke</Button>}
            />
          ))}
        </List>
      )}
    </Section>
  );
}
