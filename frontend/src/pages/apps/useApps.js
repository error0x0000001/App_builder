import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { appsApi } from '../../api/endpoints.js';

/** Everything here only fetches. Pages, menus and blocks are resolved and cached by the server (ETag → 304 on a repeat visit). */
export const useAppMeta = () => useQuery({ queryKey: ['apps-meta'], queryFn: appsApi.meta, staleTime: Infinity });
export const useApps = () => useQuery({ queryKey: ['apps'], queryFn: appsApi.list, staleTime: 60_000 });
export const useApp = (key) => useQuery({ queryKey: ['app', key], queryFn: () => appsApi.app(key), enabled: Boolean(key), staleTime: 60_000 });
export const usePage = (routeId, tab) => useQuery({ queryKey: ['page', routeId, tab ?? null], queryFn: () => appsApi.page(routeId, tab), enabled: Boolean(routeId), staleTime: 60_000, placeholderData: keepPreviousData });
export const useBlockData = (blockId, params) => useQuery({ queryKey: ['block-data', blockId, params], queryFn: () => appsApi.data(blockId, params), placeholderData: keepPreviousData, staleTime: 30_000 });

/** A Studio edit: run the request, then refresh whatever the server changed. */
export function useStudioAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fn) => fn(),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['page'] }), qc.invalidateQueries({ queryKey: ['app'] }), qc.invalidateQueries({ queryKey: ['apps'] }), qc.invalidateQueries({ queryKey: ['block-data'] })]),
  });
}

export const StudioContext = createContext({ studio: false, run: async () => {}, tabId: null, meta: null });
export const useStudio = () => useContext(StudioContext);
