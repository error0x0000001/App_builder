import { cn } from '../../lib/cn.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu.jsx';
import { Icon } from './Icon.jsx';

const SIZES = { sm: ['size-7', 'size-3.5'], md: ['size-9', 'size-4'] };

/**
 * Untitled UI style round icon button. Filters, sort orders and view switches are ALWAYS round buttons like this — never a boxed select or a segmented box.
 * `RoundMenu` opens a small menu (children: `MenuChoice` rows); a dot shows that something is applied. `RoundButton` is the same look as a plain / toggle button.
 */
const ROUND = 'relative grid shrink-0 place-items-center rounded-full border border-line-strong text-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const Dot = () => <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-surface bg-accent" />;

export function RoundMenu({ icon, label, active = false, size = 'sm', align = 'end', children }) {
  const [box, glyph] = SIZES[size];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {(props) => <button type="button" aria-label={label} title={label} {...props} className={cn(ROUND, box, active && 'bg-surface-2 text-ink')}><Icon name={icon} className={glyph} />{active && <Dot />}</button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RoundButton({ icon, label, active = false, size = 'md', className, ...rest }) {
  const [box, glyph] = SIZES[size];
  return <button type="button" aria-label={label} title={label} className={cn(ROUND, box, active && 'bg-surface-2 text-ink', className)} {...rest}><Icon name={icon} className={glyph} />{active && <Dot />}</button>;
}

/** A row of a RoundMenu: label, with a check on the chosen one. */
export const MenuChoice = ({ selected, onSelect, children }) => (
  <DropdownMenuItem onSelect={onSelect}>{children}{selected && <Icon name="check" className="ml-auto size-4 text-link" />}</DropdownMenuItem>
);
