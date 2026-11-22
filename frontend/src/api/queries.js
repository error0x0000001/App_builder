import { meApi } from './endpoints.js';

export const meQuery = { queryKey: ['me'], queryFn: meApi.get, staleTime: 60_000 };

/** Keyset-paginated list: React Query's infinite query driven by the API's nextCursor. */
export const cursorPagination = { initialPageParam: undefined, getNextPageParam: (last) => last.nextCursor ?? undefined };
