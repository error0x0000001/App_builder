import { Alert } from '../../components/ui/Alert.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';

/** Standard loading / error wrapper for a React Query result. Renders children(data) once data exists. */
export function QueryState({ query, children }) {
  if (query.isPending) return <div className="grid place-items-center py-16 text-muted"><Spinner className="size-6" /></div>;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;
  return children(query.data);
}
