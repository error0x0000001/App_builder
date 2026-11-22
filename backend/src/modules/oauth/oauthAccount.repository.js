import { and, eq } from 'drizzle-orm';
import { oauthAccounts } from '../../shared/db/schema/index.js';
import { first } from '../../shared/db/helpers.js';

export class OAuthAccountRepository {
  constructor(db) { this.db = db; }

  async find(provider, providerUserId) {
    return first(await this.db.select().from(oauthAccounts).where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId))).limit(1));
  }

  link(values) { return this.db.insert(oauthAccounts).values(values).onConflictDoNothing(); }
}
