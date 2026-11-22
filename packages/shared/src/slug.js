const RESERVED = new Set(['admin', 'api', 'app', 'www', 'auth', 'login', 'signup', 'static', 'assets', 'support', 'help', 'status']);

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
export const isReservedSlug = (slug) => RESERVED.has(slug);

export const slugify = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
