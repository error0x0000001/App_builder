/** Human-readable "Browser on OS" label for the sessions list. */
export function describeUserAgent(ua = '') {
  const browser = [['Edg/', 'Edge'], ['Chrome/', 'Chrome'], ['Firefox/', 'Firefox'], ['Safari/', 'Safari']].find(([token]) => ua.includes(token))?.[1] ?? 'Browser';
  const os = [['iPhone', 'iOS'], ['Android', 'Android'], ['Windows', 'Windows'], ['Mac OS', 'macOS'], ['Linux', 'Linux']].find(([token]) => ua.includes(token))?.[1] ?? 'Unknown OS';
  return `${browser} on ${os}`;
}
