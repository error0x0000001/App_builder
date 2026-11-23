import { useAuth } from '../auth/AuthProvider.jsx';
import { NavRows, useNavSections } from './NavRows.jsx';
import { isVisibleTo, NAV } from './navigation.js';

/** Classic sidebar body: the same rows as the rail panel, with the group names as small headings. */
export function NavMain() {
  const sections = useNavSections();
  return sections.map((section, index) => (
    <section key={section.id} className="flex flex-col gap-1">
      {index > 0 && <h3 className="px-3 text-xs font-semibold text-sidebar-muted">{section.label}</h3>}
      <ul className="flex flex-col gap-0.5"><NavRows items={section.items} /></ul>
    </section>
  ));
}

/** NAV.bottom (Setup) pinned above the user menu. */
export function NavBottom() {
  const { activeWorkspace } = useAuth();
  const items = NAV.bottom.filter((item) => isVisibleTo(item, activeWorkspace));
  if (!items.length) return null;
  return <nav aria-label="Secondary"><ul className="flex flex-col gap-0.5"><NavRows items={items} /></ul></nav>;
}
