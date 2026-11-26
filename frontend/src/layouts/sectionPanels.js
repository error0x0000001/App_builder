import { AppPanel } from './AppPanel.jsx';
import { ChatPanel } from './ChatPanel.jsx';
import { DocumentsPanel } from './DocumentsPanel.jsx';
import { SetupPanel } from './SetupPanel.jsx';

/** `panel` of a navigation.js group -> what the rail panel / classic sidebar shows for that section instead of plain rows. Add a section panel = one entry. */
export const SECTION_PANELS = { chat: ChatPanel, documents: DocumentsPanel, setup: SetupPanel, app: AppPanel };
