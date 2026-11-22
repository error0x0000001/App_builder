/** Where to go after authenticating: the page the user originally wanted, if it is a safe in-app path. */
export function nextPath(location) {
  const from = location.state?.from;
  const candidate = from ? `${from.pathname}${from.search ?? ''}` : new URLSearchParams(location.search).get('next');
  return candidate && candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : null;
}
