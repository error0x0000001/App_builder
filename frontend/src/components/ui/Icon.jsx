const PATHS = {
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  'eye-off': 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A16.6 16.6 0 002 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 004.2 4.2',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M5.6 18.4L7 17m10-10l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  mail: 'M3 6h18v12H3V6zm0 0l9 7 9-7',
  copy: 'M9 9h11v11H9V9zM5 15H4V4h11v1',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 11v5m0-8h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  plus: 'M12 5v14M5 12h14',
  'log-out': 'M15 17l5-5-5-5M20 12H9m4 8H5V4h8',
  lock: 'M6 11h12v9H6v-9zm2 0V8a4 4 0 118 0v3',
  'panel-left': 'M4 5h16v14H4V5zm5 0v14',
  'chevrons-up-down': 'M7 15l5 5 5-5M7 9l5-5 5 5',
  'chevron-right': 'M9 6l6 6-6 6',
  search: 'M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z',
  'more-horizontal': 'M5 12h.01M12 12h.01M19 12h.01',
  'chevron-down': 'M6 9l6 6 6-6',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
};

/**
 * Duotone icons (used by navigation and page headers): a soft filled shape (`fill`, 32% of the current colour)
 * with a darker detail on top (`line`). Everything else is a plain line icon.
 */
const DUOTONE = {
  home: {
    fill: 'M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1H5a1 1 0 01-1-1v-8.5z',
    line: 'M3.5 11L12 4l8.5 7M10 20v-5.5h4V20',
  },
  users: {
    fill: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20v-1.5A3.5 3.5 0 016.5 15h5a3.5 3.5 0 013.5 3.5V20z',
    line: 'M16.5 4.2a3.5 3.5 0 010 6.6M18 15.2a3.5 3.5 0 013 3.3V20M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  },
  user: {
    fill: 'M12 11.5a4 4 0 100-8 4 4 0 000 8zM4.5 20v-1a4.5 4.5 0 014.5-4.5h6a4.5 4.5 0 014.5 4.5v1z',
    line: 'M12 11.5a4 4 0 100-8 4 4 0 000 8zM8 14.5',
  },
  shield: {
    fill: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z',
    line: 'M8.5 12l2.5 2.5 4.5-5',
  },
  sliders: {
    fill: 'M3 6.2h18v1.8H3zM3 11.1h18v1.8H3zM3 16h18v1.8H3z',
    line: 'M8 9.2a2 2 0 100-4 2 2 0 000 4zM16 14a2 2 0 100-4 2 2 0 000 4zM10 18.8a2 2 0 100-4 2 2 0 000 4z',
  },
};

export function Icon({ name, className = 'size-4', ...rest }) {
  const duotone = DUOTONE[name];
  if (duotone) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
        <path d={duotone.fill} fill="currentColor" fillOpacity="0.32" stroke="none" />
        <path d={duotone.line} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
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
