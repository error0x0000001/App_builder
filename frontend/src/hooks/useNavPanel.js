import { useSidebar } from '../components/sidebar/SidebarContext.jsx';

/**
 * Is the navigation showing a section panel right now? (Rail or classic sidebar on desktop, panel not collapsed.) When it is, a page must NOT draw its own
 * secondary column — the chat list, contact info, Documents' views all render inside that panel. When it is not (top bar layout, collapsed panel, phones),
 * the page falls back to drawing the same component itself.
 */
export function useNavPanel() {
  const { layout, isMobile, collapsed } = useSidebar();
  return !isMobile && layout !== 'topbar' && !collapsed;
}
