/** After a write: refresh data views (lists, hierarchies, dashboards) but never the static definitions (tree/page). */
export const invalidateSetupData = (queryClient) =>
  Promise.all(['records', 'hierarchy', 'metrics', 'settings'].map((kind) => queryClient.invalidateQueries({ queryKey: ['setup', kind] })));
