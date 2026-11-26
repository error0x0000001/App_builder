import { lazy } from 'react';

/** block kind → component. Each kind is its own chunk, loaded only when a page uses it. */
export const BLOCKS = {
  table: lazy(() => import('./TableBlock.jsx')),
  list: lazy(() => import('./ListBlock.jsx')),
  details: lazy(() => import('./DetailsBlock.jsx')),
  form: lazy(() => import('./FormBlock.jsx')),
  filter: lazy(() => import('./FormBlock.jsx')),
  chart: lazy(() => import('./ChartBlock.jsx')),
  kanban: lazy(() => import('./KanbanBlock.jsx')),
  calendar: lazy(() => import('./CalendarBlock.jsx')),
  markdown: lazy(() => import('./MarkdownBlock.jsx')),
  iframe: lazy(() => import('./IframeBlock.jsx')),
};
