import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

/** Who changed what, per tenant. `area` is the part of the product ('profiles', 'integrations', 'deployments', …). */
export class AuditLogRepository {
  constructor(db) { this.db = db; }

  record(tenantId, userId, area, action, summary) {
    return this.db.execute(sql`insert into audit_log (id, tenant_id, user_id, area, action, summary) values (${uuidv7()}::uuid, ${tenantId}, ${userId}, ${area}, ${action}, ${String(summary).slice(0, 500)})`);
  }

  async list(tenantId, { limit, after, area } = {}) {
    return (await this.db.execute(sql`
      select a.id, a.area, a.action, a.summary, a.created_at, u.email,
        coalesce(nullif(trim(concat(u.first_name, ' ', u.last_name)), ''), u.email) as who
      from audit_log a left join users u on u.id = a.user_id
      where a.tenant_id = ${tenantId} ${area ? sql`and a.area = ${area}` : sql``} ${after ? sql`and a.id < ${after}::uuid` : sql``}
      order by a.id desc limit ${limit}`)).rows;
  }

  async deleteOlderThan(days, batch) {
    return (await this.db.execute(sql`delete from audit_log where id in (select id from audit_log where created_at < now() - make_interval(days => ${days}) limit ${batch})`)).rowCount;
  }
}
