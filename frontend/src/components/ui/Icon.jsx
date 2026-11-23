import {
  AlertTriangle, ArrowDown, ArrowUp, Announcement01, Briefcase01, Building02, Calendar, CheckSquare, Cloud01, Code01, CornerDownLeft, Cube01, Database01, Grid01, Key01, LifeBuoy01, Palette, Stars01, Target01, TrendUp01, Zap, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronSelectorVertical, Copy01, DotsHorizontal, Download01, Edit01, Eye, EyeOff,
  Home02, InfoCircle, LayoutLeft, Lock01, LogOut01, Mail01, Monitor01, Moon01, Plus, RefreshCw01, SearchLg, Sliders01, Sun, Trash01, User01, Users01, XClose, ShieldTick,
} from '@untitledui/icons';

/**
 * The app's one icon set: Untitled UI Icons (@untitledui/icons, line style, 24px grid). Components refer to icons by name;
 * add an icon by importing it above and giving it a name here. Only the icons listed are bundled (the package is tree-shakeable).
 */
const ICONS = {
  home: Home02, briefcase: Briefcase01, target: Target01, building: Building02, 'trend-up': TrendUp01, 'life-buoy': LifeBuoy01, megaphone: Announcement01, 'check-square': CheckSquare,
  database: Database01, grid: Grid01, stars: Stars01, cube: Cube01, zap: Zap, palette: Palette, code: Code01, cloud: Cloud01, key: Key01, 'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'corner-down-left': CornerDownLeft, users: Users01, user: User01, shield: ShieldTick, sliders: Sliders01,
  check: Check, 'check-circle': CheckCircle, x: XClose, plus: Plus, search: SearchLg, copy: Copy01, trash: Trash01, edit: Edit01, download: Download01, refresh: RefreshCw01,
  eye: Eye, 'eye-off': EyeOff, sun: Sun, moon: Moon01, monitor: Monitor01, mail: Mail01, lock: Lock01, calendar: Calendar, alert: AlertTriangle, info: InfoCircle,
  'log-out': LogOut01, 'panel-left': LayoutLeft, 'chevrons-up-down': ChevronSelectorVertical, 'chevron-right': ChevronRight, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'more-horizontal': DotsHorizontal,
};

export function Icon({ name, className = 'size-4', ...rest }) {
  const Glyph = ICONS[name];
  return Glyph ? <Glyph aria-hidden="true" className={className} {...rest} /> : null;
}

export function GoogleIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.3h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 010-4.4V7H2.1a11 11 0 000 10l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 002.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
