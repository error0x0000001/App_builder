import { eq, sql } from 'drizzle-orm';
import { workspaces } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class WorkspaceRepository {
  constructor(db) { this.db = db; }

  async create(values) { return first(await this.db.insert(workspaces).values(values).returning()); }
  async findById(id) { return first(await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)); }
  async findBySlug(slug) { return first(await this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1)); }
  async update(id, values) { return first(await this.db.update(workspaces).set(values).where(eq(workspaces.id, id)).returning()); }
  async slugExists(slug) { return Boolean(await this.findBySlug(slug)); }
  markOnboarded(id) { return this.db.update(workspaces).set({ onboardedAt: sql`coalesce(${workspaces.onboardedAt}, now())` }).where(eq(workspaces.id, id)); }
}
