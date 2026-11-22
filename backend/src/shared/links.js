import { config } from './config.js';

/** Builds absolute links into the SPA (used in emails). */
export const appLink = (path, query = {}) => {
  const url = new URL(path, config.APP_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
};
