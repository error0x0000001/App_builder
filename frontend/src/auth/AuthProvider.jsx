import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resolveUiSettings } from '@app/shared';
import { authApi, meApi, tenantsApi } from '../api/endpoints.js';
import { applyCustomColors } from '../lib/customColors.js';
import { applyThemeMode } from '../lib/themeMode.js';
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
    if (data.user.preferences?.themeMode) applyThemeMode(data.user.preferences.themeMode); // the saved choice follows the person across devices
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

  const switchTenant = useCallback(async (tenantId) => {
    await tenantsApi.switch(tenantId);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'auth-config' });
    return loadMe();
  }, [loadMe, queryClient]);

  /** Admin "log in as": the response carries a short-lived token (no cookie); drop cached data and reload as that person. */
  const startImpersonation = useCallback(async (tenantId, userId) => {
    await tenantsApi.loginAs(tenantId, userId);
    queryClient.clear();
    return loadMe();
  }, [loadMe, queryClient]);

  /** Back to the admin's own session (the refresh cookie still belongs to them). */
  const stopImpersonation = useCallback(async () => {
    await refreshSession();
    queryClient.clear();
    return loadMe();
  }, [loadMe, queryClient]);

  /** Owner's UI customization: applied at once, saved to the tenant, rolled back if the server refuses it. */
  const updateUi = useCallback(async (patch) => {
    const tenantId = me?.activeTenantId;
    const apply = (settings) => setMe((prev) => prev && ({ ...prev, tenants: prev.tenants.map((w) => (w.id === tenantId ? { ...w, uiSettings: settings } : w)) }));
    const previous = me?.tenants.find((w) => w.id === tenantId)?.uiSettings ?? {};
    apply({ ...previous, ...patch });
    try {
      const { tenant } = await tenantsApi.updateUi(tenantId, patch);
      apply(tenant.uiSettings);
    } catch (error) {
      apply(previous);
      throw error;
    }
  }, [me]);

  /** Personal theme mode: applied at once, then saved on the account (best effort — it is also kept locally). */
  const setThemeMode = useCallback((mode) => {
    applyThemeMode(mode);
    meApi.updatePreferences({ themeMode: mode }).catch(() => {});
  }, []);

  const activeTheme = me?.tenants.find((w) => w.id === me.activeTenantId)?.theme;
  useEffect(() => {
    // Tenant theme only applies inside the app; sign-in screens always use the default.
    if (status === 'authenticated' && activeTheme) document.documentElement.dataset.tenantTheme = activeTheme;
    else delete document.documentElement.dataset.tenantTheme;
  }, [status, activeTheme]);

  const storedUi = me?.tenants.find((w) => w.id === me.activeTenantId)?.uiSettings;
  useEffect(() => {
    // Navigation colour and the owner's custom colours only apply inside the app, like the tenant theme.
    applyCustomColors(status === 'authenticated' ? resolveUiSettings(storedUi) : null);
  }, [status, storedUi]);

  const value = useMemo(() => {
    const found = me?.tenants.find((w) => w.id === me.activeTenantId) ?? null;
    const activeTenant = found ? { ...found, features: me.features ?? {} } : null; // which optional system apps this install runs
    const ui = resolveUiSettings(activeTenant?.uiSettings);
    return { status, signedOut, me, user: me?.user ?? null, tenants: me?.tenants ?? [], activeTenant, refresh: loadMe, signedIn: loadMe, signOut, signOutEverywhere, switchTenant, impersonatedBy: me?.impersonatedBy ?? null, startImpersonation, stopImpersonation, ui, updateUi, setThemeMode };
  }, [status, me, loadMe, signOut, signOutEverywhere, switchTenant, startImpersonation, stopImpersonation, updateUi, setThemeMode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};
