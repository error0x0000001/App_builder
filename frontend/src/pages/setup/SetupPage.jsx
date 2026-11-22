import { Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Alert } from '../../components/ui/Alert.jsx';
import { PageHeaderMeta, PageHeaderTitle } from '../../layouts/PageHeader.jsx';
import { PageIntro } from './PageIntro.jsx';
import { QueryState } from './QueryState.jsx';
import { TEMPLATES, templateFor } from './templates.js';
import { useSetupPage } from './useSetupPage.js';

/** Resolves /app/setup/:key to its definition and renders the template for its kind. One route serves every Setup page. */
export default function SetupPage() {
  const { key } = useParams();
  const query = useSetupPage(key);
  return (
    <QueryState query={query}>
      {({ page }) => {
        const Template = TEMPLATES[templateFor(page)];
        if (!Template) return <Alert tone="warning">This page type is not available yet.</Alert>;
        return (
          <>
            <PageHeaderTitle icon="sliders">{page.name}</PageHeaderTitle>
            {page.path && <PageHeaderMeta>{page.path.at(-1)}</PageHeaderMeta>}
            <PageIntro>{page.desc}</PageIntro>
            <Suspense fallback={<div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>}><Template key={key} pageKey={key} /></Suspense>
          </>
        );
      }}
    </QueryState>
  );
}
