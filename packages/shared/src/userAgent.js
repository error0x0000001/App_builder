/** Browser / OS detection from a User-Agent string (used by login history, sessions and the UI). */
const BROWSERS = [['Edg/', 'Edge'], ['Chrome/', 'Chrome'], ['Firefox/', 'Firefox'], ['Safari/', 'Safari']];
const SYSTEMS = [['iPhone', 'iOS'], ['Android', 'Android'], ['Windows', 'Windows'], ['Mac OS', 'macOS'], ['Linux', 'Linux']];

export function parseUserAgent(ua = '') {
  return {
    browser: BROWSERS.find(([token]) => ua.includes(token))?.[1] ?? 'Browser',
    os: SYSTEMS.find(([token]) => ua.includes(token))?.[1] ?? 'Unknown OS',
  };
}

export function describeUserAgent(ua = '') {
  const { browser, os } = parseUserAgent(ua);
  return `${browser} on ${os}`;
}
