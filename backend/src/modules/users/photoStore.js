import { sql } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { photoSignatureValid, photoUrl } from '../../shared/avatar.js';

export const PHOTO_MAX_BYTES = 512 * 1024;

/**
 * One small JPEG per owner (a person's profile photo, a group's icon): the browser crops/resizes it, the server accepts only JPEG, stores it behind the
 * StorageDriver under `<kind>/<id>/<version>.jpg` and serves it through signed immutable URLs. The version lives in a column of the owner's row.
 */
export class PhotoStore {
  /** `table` / `column` are fixed identifiers from the container (never user input). */
  constructor({ db, storage, kind, table, column, touchUpdatedAt = false }) { Object.assign(this, { db, storage, kind, table: sql.raw(table), column: sql.raw(column), touchUpdatedAt }); }

  #key = (id, version) => `${this.kind}/${id}/${version}.jpg`;
  url = (id, version) => photoUrl(this.kind, id, version);

  async set(id, stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk); // the upload helper caps the stream at PHOTO_MAX_BYTES + 1 and marks it truncated
    if (stream.truncated) throw new ValidationError({ file: 'Choose a smaller photo (max 512 KB)' });
    const bytes = Buffer.concat(chunks);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ValidationError({ file: 'The photo must be a JPEG image' });
    const { rows: [row] } = await this.db.execute(sql`update ${this.table} set ${this.column} = ${this.column} + 1${this.touchUpdatedAt ? sql`, updated_at = now()` : sql``} where id = ${id} returning ${this.column} as version`);
    if (!row) throw new NotFoundError('Not found');
    await this.storage.put(this.#key(id, row.version), Readable.from(bytes));
    if (row.version > 1) await this.storage.remove(this.#key(id, row.version - 1)); // old URLs stop working
    return { photo: this.url(id, row.version) };
  }

  async remove(id) {
    const { rows: [row] } = await this.db.execute(sql`select ${this.column} as version from ${this.table} where id = ${id}`);
    if (row?.version > 0) {
      await this.storage.remove(this.#key(id, row.version));
      await this.db.execute(sql`update ${this.table} set ${this.column} = 0${this.touchUpdatedAt ? sql`, updated_at = now()` : sql``} where id = ${id}`);
    }
    return { photo: null };
  }

  /** The bytes behind a signed URL (404 for a forged signature, an old version or no photo). */
  open(id, version, signature) {
    if (!photoSignatureValid(this.kind, id, version, signature)) throw new NotFoundError('Photo not found');
    return this.storage.open(this.#key(id, version));
  }
}
