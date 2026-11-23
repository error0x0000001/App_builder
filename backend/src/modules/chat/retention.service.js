import { sql } from 'drizzle-orm';
import { pgArray } from '../../shared/db/helpers.js';

/**
 * Removes what has expired: disappearing messages (and the files attached to them) — never in a conversation under legal hold.
 * Runs in the worker; reads are already filtered by `expires_at`, so this only reclaims space and files.
 */
export class ChatRetentionService {
  constructor({ db, storage, logger }) { Object.assign(this, { db, storage, logger }); }

  async purgeExpired({ batch = 2000 } = {}) {
    const { rows } = await this.db.execute(sql`delete from chat_messages m using chat_conversations c
      where c.id = m.conversation_id and c.legal_hold = false and (m.conversation_id, m.id) in (
        select conversation_id, id from chat_messages where expires_at is not null and expires_at < now() limit ${batch})
      returning m.conversation_id, m.id, m.attachments`);
    const files = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.id));
    if (files.length) {
      const { rows: gone } = await this.db.execute(sql`delete from drive_files where id = any(${pgArray(files, 'uuid')}) returning storage_key`);
      await Promise.allSettled(gone.map((f) => this.storage.remove(f.storage_key)));
    }
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await this.db.execute(sql`delete from chat_reactions where message_id = any(${pgArray(ids, 'uuid')})`);
      await this.db.execute(sql`delete from chat_stars where message_id = any(${pgArray(ids, 'uuid')})`);
      await this.db.execute(sql`delete from chat_pins where message_id = any(${pgArray(ids, 'uuid')})`);
    }
    this.logger?.info({ messages: rows.length, files: files.length }, 'purged expired chat messages');
    return { messages: rows.length, files: files.length };
  }
}
