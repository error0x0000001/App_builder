/** Setup tree (from the API) → TreeNav nodes / palette items. Leaves link to /app/setup/:page. */
const toNode = (node, trail) => {
  const id = `${trail}/${node.label}`;
  return node.children
    ? { id, label: node.label, children: node.children.map((c) => toNode(c, id)) }
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
