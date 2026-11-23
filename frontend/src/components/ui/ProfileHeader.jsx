import { hueOf } from '../../lib/hue.js';
import { cn } from '../../lib/cn.js';
import { Avatar } from './Avatar.jsx';

/**
 * Untitled UI "User profile" header: a soft gradient cover banner, a large photo overlapping it (white ring, presence dot), then name, subtitle, tags and actions.
 * The banner's hue comes from the name, so every person and group gets their own colour. `avatar` replaces the photo (e.g. a group's icon or an upload control).
 */
export function ProfileHeader({ name, src, status, subtitle, tags, actions, avatar, className }) {
  const hue = hueOf(name ?? '');
  return (
    <header className={cn('pb-1', className)}>
      <div className="px-2"><div aria-hidden="true" className="h-24 w-full rounded-xl" style={{ background: `linear-gradient(to top right, hsl(${hue} 90% 80%), hsl(${(hue + 55) % 360} 100% 94%))` }} /></div>
      <div className="-mt-10 flex flex-col gap-3 px-4">
        <div className="relative w-fit rounded-full bg-surface p-1 ring-1 ring-line">{avatar ?? <Avatar name={name} src={src} size="size-20" status={status} className="text-2xl" />}</div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 truncate text-lg font-semibold text-ink">{name}</h3>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {tags}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
