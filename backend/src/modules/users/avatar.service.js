import { sql } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { avatarSignatureValid, avatarUrl } from '../../shared/avatar.js';

export const AVATAR_MAX_BYTES = 512 * 1024;
const key = (userId, version) => `avatars/${userId}/${version}.jpg`;

/** Profile photos: one small JPEG per person (the browser crops/resizes it), stored behind the StorageDriver, served by signed immutable URLs. */
export class AvatarService {
  constructor({ db, storage }) { Object.assign(this, { db, storage }); }

  async set(userId, stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk); // the upload helper caps the stream at MAX_BYTES + 1 and marks it truncated
    if (stream.truncated) throw new ValidationError({ file: 'Choose a smaller photo (max 512 KB)' });
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ValidationError({ file: 'The photo must be a JPEG image' });
    const { rows: [row] } = await this.db.execute(sql`update users set avatar_version = avatar_version + 1, updated_at = now() where id = ${userId} returning avatar_version`);
    await this.storage.put(key(userId, row.avatar_version), Readable.from(bytes));
    if (row.avatar_version > 1) await this.storage.remove(key(userId, row.avatar_version - 1)); // old URLs stop working
    return { avatar: avatarUrl(userId, row.avatar_version) };
  }

  async remove(userId) {
    const { rows: [row] } = await this.db.execute(sql`select avatar_version from users where id = ${userId}`);
    if (row?.avatar_version > 0) {
      await this.storage.remove(key(userId, row.avatar_version));
      await this.db.execute(sql`update users set avatar_version = 0, updated_at = now() where id = ${userId}`);
    }
    return { avatar: null };
  }

  /** The bytes behind a signed URL (404 for a forged signature, an old version or no photo). */
  open(userId, version, signature) {
    if (!avatarSignatureValid(userId, version, signature)) throw new NotFoundError('Photo not found');
    return this.storage.open(key(userId, version));
  }
}
