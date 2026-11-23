import { DocumentsNav } from '../pages/documents/DocumentsNav.jsx';

/** The Documents section's panel: search + "+", its views and the storage meter, in the navigation colours. The 12px inset matches the chat list (the panel host bleeds to the edges). */
export const DocumentsPanel = () => <div className="on-sidebar flex min-h-0 flex-1 flex-col px-3 text-sidebar-ink"><DocumentsNav /></div>;
