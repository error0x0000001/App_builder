import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CustomizeContext = createContext(null);

/** Open/close state of the owner's Customize sheet, so the account menu (sidebar or top bar) can open it. */
export function CustomizeProvider({ children }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, show, close }), [open, show, close]);
  return <CustomizeContext.Provider value={value}>{children}</CustomizeContext.Provider>;
}

export const useCustomize = () => {
  const context = useContext(CustomizeContext);
  if (!context) throw new Error('useCustomize must be used inside <CustomizeProvider>');
  return context;
};
