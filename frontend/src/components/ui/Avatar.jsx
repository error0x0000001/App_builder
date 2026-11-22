import { initials } from '../../lib/format.js';

export const Avatar = ({ name, size = 'size-8' }) => (
  <span className={`${size} grid shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-ink`} aria-hidden="true">{initials(name)}</span>
);
