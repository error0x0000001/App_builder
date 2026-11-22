import { getSetupPage } from '@app/shared/setup-registry';
import { settingsDefaults } from '@app/shared';

/** Cached, typed-by-the-registry read of a settings page (defaults merged). Invalidated by the page's version namespace. */
export class SettingsReader {
  constructor({ repos, cache }) { Object.assign(this, { repos, cache }); }

  values(ws, pageKey) {
    return this.cache.rememberValue(`s:${ws}:${pageKey}`, 'plain', { ttlMs: 60_000 }, async () => {
      const row = await this.repos.setupSettings.get(ws, pageKey);
      return { ...settingsDefaults(getSetupPage(pageKey)), ...(row?.values ?? {}) };
    });
  }
}
