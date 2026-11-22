import { useQuery } from '@tanstack/react-query';
import { setupPageQuery } from '../../api/queries.js';

/** Definition of a Setup page/collection: { page, adapter, tool, views }. Cached for the session. */
export const useSetupPage = (key) => useQuery(setupPageQuery(key));
