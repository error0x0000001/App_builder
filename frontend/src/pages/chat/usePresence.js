import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../../api/endpoints.js';

/** Which of these people are online right now (polled every 30 s while on screen; presence is never pushed). */
export function usePresence(ids) {
  const key = [...new Set(ids)].sort().slice(0, 100);
  const { data } = useQuery({ queryKey: ['chat', 'presence', key.join(',')], queryFn: () => chatApi.presence(key), enabled: key.length > 0, refetchInterval: 30_000, staleTime: 15_000 });
  return data?.online ?? [];
}
