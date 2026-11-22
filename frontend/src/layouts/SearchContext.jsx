import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SearchContext = createContext(null);

/** Open/close state of the global search dialog. Ctrl/⌘ K opens it from anywhere; the mobile header button too. */
export function SearchProvider({ children }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ open, show, close }), [open, show, close]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) throw new Error('useSearch must be used inside <SearchProvider>');
  return context;
};
