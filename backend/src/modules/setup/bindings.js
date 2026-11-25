import fixtures from '../../../seed/setup-fixtures.generated.json' with { type: 'json' };

/**
 * A "binding" connects a settings page to the real platform data it describes, so the page is not a copy of it:
 *   read(ws)  -> values that are derived (shown read-only / overlaid on stored values)
 *   write(ws, patch) -> applies bound keys to their real owner and returns the keys that should be stored as settings
 */
export class SettingsBindings {
  constructor({ repos, appHost, usage, intakeUrl }) { Object.assign(this, { repos, appHost, usage, intakeUrl }); this.map = this.#build(); }

  async read(ws, pageKey) { return this.map[pageKey]?.read ? this.map[pageKey].read(ws) : {}; }

  /** Keys that mirror real platform data and cannot be edited on the Setup page. */
  readOnly(pageKey) { return this.map[pageKey]?.readOnly ?? []; }

  async write(ws, pageKey, patch) {
    const binding = this.map[pageKey];
    if (!binding?.write) return patch;
    return binding.write(ws, patch);
  }

  /** Rows of a read-only table section (e.g. Licenses). */
  async table(ws, pageKey, title) { return this.map[pageKey]?.tables?.[title]?.(ws) ?? fixtures.details[pageKey]?.[title] ?? []; }

  #build() {
    const tenant = (ws) => this.repos.tenants.findById(ws);
    const date = (d) => new Date(d).toISOString().slice(0, 10);
    return {
      'company-information': {
        readOnly: ['salesforce_com_organization_id', 'created', 'edition', 'instance', 'used_data_space', 'used_file_space', 'api_requests_last_24_hours', 'streaming_api_events_last_24_hours'],
        read: async (ws) => {
          const w = await tenant(ws);
          const [storage, api] = await Promise.all([this.repos.setupRecords.storageByCollection(ws), this.usage.last24h(ws)]);
          const mb = storage.reduce((n, r) => n + r.bytes, 0) / 1e6;
          return {
            organization_name: w.name, salesforce_com_organization_id: w.id, created: date(w.createdAt), edition: 'Enterprise', instance: 'Quelli Cloud',
            used_data_space: `${mb.toFixed(1)} MB`, used_file_space: '0 MB', api_requests_last_24_hours: api.toLocaleString('en-US'), streaming_api_events_last_24_hours: '0',
          };
        },
        write: async (ws, patch) => {
          const { organization_name: name, ...rest } = patch;
          if (name) await this.repos.tenants.update(ws, { name });
          return rest;
        },
        tables: {
          Licenses: async (ws) => {
            const members = await this.repos.memberships.countMembers(ws);
            return [{ license: 'User Licenses', type: 'Tenant member', total: 'Unlimited', used: String(members), remaining: '∞' }];
          },
        },
      },
      'email-to-case': {
        readOnly: ['routing_address'],
        read: async (ws) => ({ routing_address: this.intakeUrl('email-to-case', ws) }),
      },
      'my-domain': {
        readOnly: ['current_my_domain_url', 'domain_type', 'status', 'domain_created'],
        read: async (ws) => {
          const w = await tenant(ws);
          return { current_my_domain_url: `${w.slug}.${this.appHost}`, domain_type: 'Tenant subdomain', status: 'Deployed to users', domain_created: date(w.createdAt) };
        },
      },
    };
  }
}
