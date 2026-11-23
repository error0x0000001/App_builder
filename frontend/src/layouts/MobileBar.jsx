import { useLocation } from 'react-router-dom';
import { SidebarTrigger } from '../components/sidebar/Sidebar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { useSearch } from './SearchContext.jsx';
import { pageFor } from './navigation.js';

/** Phones only: the one thing the page needs a bar for — the button that opens the navigation drawer (and search, which has no ⌘K on a phone). Desktop has no content header. */
export function MobileBar() {
  const { pathname } = useLocation();
  const { show } = useSearch();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 md:hidden">
      <SidebarTrigger />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{pageFor(pathname).label}</span>
      <Button size="icon" variant="ghost" aria-label="Search" onClick={show}><Icon name="search" className="size-4" /></Button>
    </div>
  );
}
