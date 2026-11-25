import { eq, sql } from 'drizzle-orm';
import { tenants } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class TenantRepository {
  constructor(db) { this.db = db; }

  async create(values) { return first(await this.db.insert(tenants).values(values).returning()); }
  async findById(id) { return first(await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1)); }
  async findBySlug(slug) { return first(await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)); }
  async update(id, values) { return first(await this.db.update(tenants).set(values).where(eq(tenants.id, id)).returning()); }
  async slugExists(slug) { return Boolean(await this.findBySlug(slug)); }
  markOnboarded(id) { return this.db.update(tenants).set({ onboardedAt: sql`coalesce(${tenants.onboardedAt}, now())` }).where(eq(tenants.id, id)); }
}
