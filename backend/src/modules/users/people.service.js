import { sql } from 'drizzle-orm';
import { avatarUrl } from '../../shared/avatar.js';

/** Finding colleagues: one tenant-scoped name/email search used by every "add people" picker (sharing, chat, meetings). */
export class PeopleService {
  constructor({ db }) { this.db = db; }

  async search(tenantId, q) {
    const needle = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const { rows } = await this.db.execute(sql`select u.id, u.first_name, u.last_name, u.email, u.avatar_version from memberships m join users u on u.id = m.user_id
      where m.tenant_id = ${tenantId} and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${needle} order by u.first_name, u.last_name limit 20`);
    return { people: rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email, avatar: avatarUrl(r.id, r.avatar_version) })) };
  }
}
