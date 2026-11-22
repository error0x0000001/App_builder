import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';

const base = 'text-link hover:underline underline-offset-2';

/** Router link or (with `onClick`) button that looks like a link. */
export function TextLink({ className, onClick, to, children, ...rest }) {
  if (onClick) return <button type="button" onClick={onClick} className={cn(base, className)} {...rest}>{children}</button>;
  return <Link to={to} className={cn(base, className)} {...rest}>{children}</Link>;
}
