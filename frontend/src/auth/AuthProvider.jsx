import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, workspacesApi } from '../api/endpoints.js';
import { onSessionExpired, refreshSession, tokenStore } from '../api/http.js';
import { meQuery } from '../api/queries.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [me, setMe] = useState(null);
  const [signedOut, setSignedOut] = useState(false); // deliberate sign-out: don't remember the page for next login

  const loadMe = useCallback(async () => {
    const data = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
    setMe(data);
    setSignedOut(false);
    setStatus('authenticated');
    return data;
  }, [queryClient]);

  const reset = useCallback(() => {
    tokenStore.clear();
    queryClient.clear();
    setMe(null);
    setStatus('anonymous');
  }, [queryClient]);

  useEffect(() => {
    refreshSession().then(loadMe).catch(() => setStatus('anonymous'));
    return onSessionExpired(reset);
  }, [loadMe, reset]);

  const exit = useCallback((request) => async () => {
    try { await request(); } finally { setSignedOut(true); reset(); }
  }, [reset]);
  const signOut = useMemo(() => exit(authApi.logout), [exit]);
  const signOutEverywhere = useMemo(() => exit(authApi.logoutAll), [exit]);

  const switchWorkspace = useCallback(async (workspaceId) => {
    await workspacesApi.switch(workspaceId);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-config' });
    return loadMe();
  }, [loadMe, queryClient]);

  const value = useMemo(() => {
    const activeWorkspace = me?.workspaces.find((w) => w.id === me.activeWorkspaceId) ?? null;
    return { status, signedOut, me, user: me?.user ?? null, workspaces: me?.workspaces ?? [], activeWorkspace, refresh: loadMe, signedIn: loadMe, signOut, signOutEverywhere, switchWorkspace };
  }, [status, me, loadMe, signOut, signOutEverywhere, switchWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};
