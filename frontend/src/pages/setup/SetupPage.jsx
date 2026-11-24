import { Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { PageIntro } from './PageIntro.jsx';
import { StatusBanner } from './StatusBanner.jsx';
import { QueryState } from './QueryState.jsx';
import { TEMPLATES, templateFor } from './templates.js';
import { useSetupPage } from './useSetupPage.js';

/** Resolves /app/setup/:key to its definition and renders the template for its kind. One route serves every Setup page. */
export default function SetupPage() {
  const { key } = useParams();
  const query = useSetupPage(key);
  if (key === 'user-management-settings') return <Navigate to="/app/setup/users?tab=settings" replace />; // a tab of Users now
  return (
    <QueryState query={query}>
      {({ page, status }) => {
        const Template = TEMPLATES[templateFor(page)];
        if (!Template) return <Alert tone="warning">This page type is not available yet.</Alert>;
        return (
          <>
            <div><h1 className="text-lg font-semibold text-ink">{page.name}</h1>{page.path && page.path.at(-1) !== page.name && <p className="text-sm text-muted">{page.path.at(-1)}</p>}</div>
            <PageIntro>{page.desc}</PageIntro>
            <StatusBanner status={status} />
            <Suspense fallback={<div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}><Template key={key} pageKey={key} /></Suspense>
          </>
        );
      }}
    </QueryState>
  );
}
