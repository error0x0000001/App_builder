import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';
import { KEYS, mergePeople } from './chatCache.js';

/** Query hooks for chat. Every response carries the people it mentions; they are merged into one shared map. */
const withPeople = (qc, fn) => async (...args) => { const data = await fn(...args); mergePeople(qc, data.people); return data; };

export function useInbox({ enabled = true } = {}) {
  const qc = useQueryClient();
  return useQuery({ queryKey: KEYS.inbox, queryFn: withPeople(qc, () => chatApi.inbox()), enabled, staleTime: 30_000 });
}

export function useConversation(id) {
  const qc = useQueryClient();
  return useQuery({ queryKey: KEYS.conversation(id), queryFn: withPeople(qc, () => chatApi.conversation(id)), enabled: Boolean(id), staleTime: 30_000 });
}

export const usePeople = () => useQuery({ queryKey: KEYS.people, queryFn: () => ({}), staleTime: Infinity, gcTime: Infinity }).data ?? {};

export const messagesQueryOptions = (qc, id) => ({
  queryKey: KEYS.messages(id),
  queryFn: withPeople(qc, ({ pageParam }) => chatApi.messages(id, { before: pageParam })),
  initialPageParam: undefined,
  getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
  staleTime: 30_000,
});
