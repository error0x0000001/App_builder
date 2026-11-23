import { sql } from 'drizzle-orm';

/** Finding colleagues: one workspace-scoped name/email search used by every "add people" picker (sharing, chat, meetings). */
export class PeopleService {
  constructor({ db }) { this.db = db; }

  async search(workspaceId, q) {
    const needle = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const { rows } = await this.db.execute(sql`select u.id, u.first_name, u.last_name, u.email from memberships m join users u on u.id = m.user_id
      where m.workspace_id = ${workspaceId} and lower(u.first_name || ' ' || u.last_name || ' ' || u.email) like ${needle} order by u.first_name, u.last_name limit 20`);
    return { people: rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email })) };
  }
}
