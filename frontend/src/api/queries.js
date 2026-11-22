import { meApi, setupApi } from './endpoints.js';

export const meQuery = { queryKey: ['me'], queryFn: meApi.get, staleTime: 60_000 };

/** Keyset-paginated list: React Query's infinite query driven by the API's nextCursor. */
export const cursorPagination = { initialPageParam: undefined, getNextPageParam: (last) => last.nextCursor ?? undefined };

/** Setup definitions never change within a deploy: cache them for the session. */
export const setupTreeQuery = { queryKey: ['setup', 'tree'], queryFn: setupApi.tree, staleTime: Infinity };
export const setupPageQuery = (key) => ({ queryKey: ['setup', 'page', key], queryFn: () => setupApi.page(key), staleTime: 10 * 60_000 });
export const setupSettingsQuery = (key) => ({ queryKey: ['setup', 'settings', key], queryFn: () => setupApi.settings(key) });
export const setupMetricsQuery = (key) => ({ queryKey: ['setup', 'metrics', key], queryFn: () => setupApi.metrics(key), refetchInterval: 60_000 });
