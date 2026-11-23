/** Setup tree (from the API) → TreeNav nodes / palette items. Leaves link to /app/setup/:page. */
/** Icons for the Setup sections (presentation only; leaves keep the plain look). */
const SECTION_ICONS = {
  Users: 'users', Data: 'database', Email: 'mail', Apps: 'grid', 'Feature Settings': 'sliders', Einstein: 'stars', 'Objects and Fields': 'cube',
  'Process Automation': 'zap', 'User Interface': 'palette', 'Custom Code': 'code', Environments: 'cloud', 'Company Settings': 'building', Identity: 'key', Security: 'shield',
};
const TOP_ICONS = { ADMINISTRATION: 'settings', 'PLATFORM TOOLS': 'zap', SETTINGS: 'sliders' };
const titleCase = (label) => label.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); // the data shouts ("PLATFORM TOOLS"); the sidebar speaks ("Platform Tools")
const toNode = (node, trail) => {
  const id = `${trail}/${node.label}`;
  const top = trail === '';
  return node.children
    ? { id, label: top ? titleCase(node.label) : node.label, icon: top ? TOP_ICONS[node.label] : SECTION_ICONS[node.label], children: node.children.map((c) => toNode(c, id)) }
    : { id, label: node.label, to: `/app/setup/${node.page}`, page: node.page };
};
export const toTreeNodes = (tree) => tree.map((n) => toNode(n, ''));

/** Case-insensitive filter that keeps matching leaves and the branches that lead to them. */
export function filterNodes(nodes, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  const walk = (list) => list.flatMap((node) => {
    if (node.children) {
      const kids = walk(node.children);
      return kids.length ? [{ ...node, children: kids }] : [];
    }
    return node.label.toLowerCase().includes(needle) ? [node] : [];
  });
  return walk(nodes);
}

export const flattenSetupTree = (tree) => {
  const out = [];
  const walk = (list, trail) => list.forEach((n) => (n.children ? walk(n.children, [...trail, n.label]) : out.push({ to: `/app/setup/${n.page}`, icon: 'sliders', label: n.label, hint: trail.slice(-1)[0] })));
  walk(tree, []);
  return out;
};
