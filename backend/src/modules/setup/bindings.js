import { ROLE_LABELS } from '@app/shared';

/**
 * A "binding" connects a settings page to the real platform data it describes, so the page is not a copy of it:
 *   read(ws)  -> values that are derived (shown read-only / overlaid on stored values)
 *   write(ws, patch) -> applies bound keys to their real owner and returns the keys that should be stored as settings
 */
export class SettingsBindings {
  constructor({ repos, appHost }) { Object.assign(this, { repos, appHost }); this.map = this.#build(); }

  async read(ws, pageKey) { return this.map[pageKey]?.read ? this.map[pageKey].read(ws) : {}; }

  async write(ws, pageKey, patch) {
    const binding = this.map[pageKey];
    if (!binding?.write) return patch;
    return binding.write(ws, patch);
  }

  /** Rows of a read-only table section (e.g. Licenses). */
  async table(ws, pageKey, title) { return this.map[pageKey]?.tables?.[title]?.(ws) ?? []; }

  #build() {
    const workspace = (ws) => this.repos.workspaces.findById(ws);
    const date = (d) => new Date(d).toISOString().slice(0, 10);
    return {
      'company-information': {
        read: async (ws) => {
          const w = await workspace(ws);
          return { organization_name: w.name, salesforce_com_organization_id: w.id, created: date(w.createdAt), edition: 'Enterprise', instance: 'Cloudbase Cloud' };
        },
        write: async (ws, patch) => {
          const { organization_name: name, ...rest } = patch;
          if (name) await this.repos.workspaces.update(ws, { name });
          return rest;
        },
        tables: {
          Licenses: async (ws) => {
            const members = await this.repos.memberships.countMembers(ws);
            return [{ license: 'User Licenses', type: 'Workspace member', total: 'Unlimited', used: String(members), remaining: '∞' }];
          },
        },
      },
      'my-domain': {
        read: async (ws) => {
          const w = await workspace(ws);
          return { current_my_domain_url: `${w.slug}.${this.appHost}`, status: 'Deployed to users', domain_created: date(w.createdAt) };
        },
      },
    };
  }
}
export const roleLabel = (role) => ROLE_LABELS[role] ?? role;
