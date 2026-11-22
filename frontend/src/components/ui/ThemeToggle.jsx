import { useTheme } from '../../hooks/useTheme.js';
import { Icon } from './Icon.jsx';

export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className={`grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink ${className}`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="size-4.5" />
    </button>
  );
}
