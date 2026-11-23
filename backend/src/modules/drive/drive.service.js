import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { DRIVE_ROLES, FILE_KIND_LABELS, fileKindOf } from '@app/shared';
import { pgArray } from '../../shared/db/helpers.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { TooLargeError } from '../../shared/storage/localStorage.js';
import { searchNs } from '../search/search.service.js';

const RANK = Object.fromEntries(DRIVE_ROLES.map((role, i) => [role, i + 1]));
const best = (a, b) => (RANK[b] > (RANK[a] ?? 0) ? b : a);
const MINUTE = 60_000;
const coll = (key) => `obj:${key}`;

const folderDto = (r) => ({
  type: 'folder', id: r.id, name: r.name, parentId: r.parent_id, kind: r.kind, inherit: r.inherit, ownerId: r.owner_id, ownerName: r.owner_name ?? null,
  recordObject: r.record_object, recordId: r.record_id, createdAt: r.created_at, updatedAt: r.updated_at, trashedAt: r.trashed_at ?? null, starred: Boolean(r.starred), shared: Boolean(r.shared),
});
const fileDto = (r) => ({
  type: 'file', id: r.id, name: r.name, mime: r.mime, size: Number(r.size), kind: fileKindOf(r.name, r.mime), folderId: r.folder_id, ownerId: r.owner_id, ownerName: r.owner_name ?? null,
  recordObject: r.record_object, recordId: r.record_id, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, trashedAt: r.trashed_at ?? null, starred: Boolean(r.starred),
});
const encodeCursor = (k, id) => Buffer.from(JSON.stringify({ k, id })).toString('base64url');
const decodeCursor = (s) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { throw new ValidationError({ after: 'Invalid cursor' }); } };
const cleanFilename = (name) => (String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) || 'Untitled');
const withSuffix = (name, n) => { const i = name.lastIndexOf('.'); return i > 0 ? `${name.slice(0, i)} (${n})${name.slice(i)}` : `${name} (${n})`; };

/**
 * Documents (the Drive). Everything here is workspace-scoped and permission-checked in this class — routes only translate HTTP.
 *
 * Access (see docs/workspace-suite-plan.md): per-folder grants inherited down the tree until a Restricted folder; folder owner = manager;
 * workspace owners/admins manage everything. Folders under `Records/<Object>/<record uuid>` are record attachments: access there is the
 * record's own permission (ObjectsService), never the folder grants.
 */
export class DriveService {
  constructor({ db, storage, objects, cache, secret, limits }) { Object.assign(this, { db, storage, objects, cache, secret, limits }); }

  // ---------------------------------------------------------------------------------------------------------------- access

  #isAdmin = (ctx) => ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  async #rows(query) { return (await this.db.execute(query)).rows; }

  async #folder(ctx, id, { trashed = false } = {}) {
    const [row] = await this.#rows(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and id = ${id} ${trashed ? sql`` : sql`and trashed_at is null`}`);
    if (!row) throw new NotFoundError('Folder not found');
    return row;
  }

  /** What this person may do in a folder: viewer | editor | manager, or null (no access). */
  async roleOn(ctx, folder) {
    if (this.#isAdmin(ctx)) return 'manager';
    if (folder.kind === 'record') { // the record's own permission decides — even for whoever created the folder
      try {
        await this.objects.get(ctx, folder.record_object, folder.record_id);
        return (await this.objects.permissions(ctx, folder.record_object)).edit ? 'editor' : 'viewer';
      } catch { return null; }
    }
    if (folder.kind === 'records') return folder.record_object ? ((await this.#visibleObjectKeys(ctx)).includes(folder.record_object) ? 'viewer' : null) : 'viewer';
    if (folder.owner_id === ctx.userId) return 'manager';
    const ids = folder.path.split('/').filter(Boolean);
    const [nodes, grants] = await Promise.all([
      this.#rows(sql`select id, owner_id, inherit from drive_folders where workspace_id = ${ctx.workspaceId} and id = any(${pgArray(ids, 'uuid')})`),
      this.#rows(sql`select folder_id, role from drive_access where workspace_id = ${ctx.workspaceId} and folder_id = any(${pgArray(ids, 'uuid')}) and principal_id in (${ctx.userId}, ${ctx.workspaceId})`),
    ]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let role = null;
    for (const id of [...ids].reverse()) { // from the folder up, stopping after the first Restricted one
      const node = byId.get(id);
      if (!node) continue;
      if (node.owner_id === ctx.userId) role = best(role, 'manager');
      for (const g of grants) if (g.folder_id === id) role = best(role, g.role);
      if (!node.inherit) break;
    }
    return role;
  }

  async #need(ctx, folder, minimum) {
    const role = await this.roleOn(ctx, folder);
    if (!role) throw new NotFoundError('Folder not found'); // never reveal that a folder exists
    if (RANK[role] < RANK[minimum]) throw new ForbiddenError(minimum === 'manager' ? 'Only a manager can change who has access' : 'You only have view access to this folder');
    return role;
  }

  async #visibleObjectKeys(ctx) {
    const { all, own } = await this.objects.readScopes(ctx);
    return [...all, ...own.map((o) => o.collection)].map((c) => c.slice(4));
  }

  /** SQL: is the item at `pathExpr` visible through a grant or ownership (respecting Restricted folders)? */
  #pathVisible(ctx, pathExpr) {
    const ws = ctx.workspaceId; const me = ctx.userId;
    return sql`exists (
      select 1 from drive_folders g
      where g.workspace_id = ${ws} and g.kind = 'folder' and g.trashed_at is null and ${pathExpr} like g.path || '%'
        and (g.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = g.id and a.principal_id in (${me}, ${ws})))
        and not exists (select 1 from drive_folders r where r.workspace_id = ${ws} and r.inherit = false and r.id <> g.id and r.path like g.path || '%' and ${pathExpr} like r.path || '%'))`;
  }

  /** SQL: may the person read the record behind a record-attachment file? (Same scopes as global search.) */
  async #recordVisible(ctx, alias) {
    const { all, own } = await this.objects.readScopes(ctx);
    const parts = [
      ...(all.length ? [sql`('obj:' || ${sql.raw(alias)}.record_object) = any(${pgArray(all, 'text')})`] : []),
      ...own.map((o) => sql`(('obj:' || ${sql.raw(alias)}.record_object) = ${o.collection} and exists (select 1 from setup_records sr where sr.workspace_id = ${ctx.workspaceId} and sr.collection = ${o.collection} and sr.id = ${sql.raw(alias)}.record_id and sr.data @> ${JSON.stringify({ [o.ownerKey]: ctx.email })}::jsonb))`),
    ];
    return parts.length ? sql.join(parts, sql` or `) : sql`false`;
  }

  async #fileVisible(ctx, alias = 'f') {
    if (this.#isAdmin(ctx)) return sql`true`;
    const record = await this.#recordVisible(ctx, alias);
    return sql`((${sql.raw(alias)}.record_object is null and ${this.#pathVisible(ctx, sql.raw(`${alias}.folder_path`))}) or (${sql.raw(alias)}.record_object is not null and (${record})))`;
  }

  // ---------------------------------------------------------------------------------------------------------------- listing

  #bump(ctx) { return this.cache.bump(searchNs(ctx.workspaceId)); }

  #ownerJoin = (alias) => sql`left join users u on u.id = ${sql.raw(alias)}.owner_id`;
  #ownerName = sql`nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), '') as owner_name`;
  #starred = (ctx, type, alias) => sql`exists (select 1 from drive_stars s where s.user_id = ${ctx.userId} and s.item_type = ${type} and s.item_id = ${sql.raw(alias)}.id) as starred`;

  async list(ctx, { view = 'folder', folder: folderId, sort = 'name', after, limit = 60, q } = {}) {
    if (q) return this.#searchList(ctx, q, limit);
    if (view === 'recent') return this.#recent(ctx, { after, limit });
    if (view === 'starred') return this.#starredItems(ctx);
    if (view === 'shared') return this.#shared(ctx);
    if (view === 'trash') return this.#trash(ctx);
    if (view === 'all') { if (!this.#isAdmin(ctx)) throw new ForbiddenError('Only admins can see every folder'); return this.#roots(ctx, { all: true }); }
    if (!folderId) return this.#roots(ctx, {});

    const folder = await this.#folder(ctx, folderId);
    const role = await this.#need(ctx, folder, 'viewer');
    const crumbs = await this.#breadcrumbs(ctx, folder);
    const head = { ...folderDto(folder), role, breadcrumbs: crumbs };

    if (folder.kind === 'records' && !folder.record_object) { // the Records root: one folder per object the person can read
      const keys = new Set(await this.#visibleObjectKeys(ctx));
      const rows = await this.#rows(sql`select d.*, null::text as owner_name from drive_folders d where d.workspace_id = ${ctx.workspaceId} and d.parent_id = ${folder.id} and d.trashed_at is null order by d.name`);
      return { folder: head, folders: rows.filter((r) => keys.has(r.record_object)).map(folderDto), files: [], nextCursor: null };
    }
    if (folder.kind === 'records') return this.#recordFolders(ctx, folder, head, { after, limit });

    const folders = folder.kind === 'record' ? [] : await this.#childFolders(ctx, folder, role);
    const { files, nextCursor } = await this.#childFiles(ctx, folder, { sort, after, limit });
    return { folder: head, folders, files, nextCursor };
  }

  async #breadcrumbs(ctx, folder) {
    const ids = folder.path.split('/').filter(Boolean);
    const nodes = await this.#rows(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and id = any(${pgArray(ids, 'uuid')})`);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const crumbs = [];
    for (const id of [...ids].reverse()) {
      const node = byId.get(id);
      if (!node || (node.id !== folder.id && !(await this.roleOn(ctx, node)))) break; // stop where the person loses access
      crumbs.unshift({ id: node.id, name: node.name });
    }
    return crumbs;
  }

  async #roots(ctx, { all }) {
    const ws = ctx.workspaceId; const me = ctx.userId;
    const records = await this.#recordsRoot(ctx);
    const visible = all || this.#isAdmin(ctx)
      ? sql`true`
      : sql`(d.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${me}, ${ws})))`;
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, exists (select 1 from drive_access a where a.folder_id = d.id) as shared
      from drive_folders d ${this.#ownerJoin('d')} where d.workspace_id = ${ws} and d.parent_id is null and d.kind = 'folder' and d.trashed_at is null and ${visible} order by lower(d.name), d.id limit 500`);
    return { folder: null, folders: [folderDto(records), ...rows.map(folderDto)], files: [], nextCursor: null };
  }

  async #childFolders(ctx, parent, parentRole) {
    const ws = ctx.workspaceId; const me = ctx.userId;
    const visible = this.#isAdmin(ctx)
      ? sql`true`
      : sql`((d.inherit and ${parentRole ? sql`true` : sql`false`}) or d.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${me}, ${ws})))`;
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, exists (select 1 from drive_access a where a.folder_id = d.id) as shared
      from drive_folders d ${this.#ownerJoin('d')} where d.workspace_id = ${ws} and d.parent_id = ${parent.id} and d.kind = 'folder' and d.trashed_at is null and ${visible} order by lower(d.name), d.id limit 1000`);
    return rows.map(folderDto);
  }

  async #childFiles(ctx, folder, { sort, after, limit }) {
    const c = after ? decodeCursor(after) : null;
    const byName = sort === 'name';
    const keyset = !c ? sql`true` : byName ? sql`(lower(f.name), f.id) > (${c.k}, ${c.id})` : sql`(f.updated_at, f.id) < (${c.k}::timestamptz, ${c.id})`;
    const rows = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')}
      where f.workspace_id = ${ctx.workspaceId} and f.folder_id = ${folder.id} and f.trashed_at is null and ${keyset}
      order by ${byName ? sql`lower(f.name), f.id` : sql`f.updated_at desc, f.id desc`} limit ${limit + 1}`);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { files: page.map(fileDto), nextCursor: rows.length > limit ? encodeCursor(byName ? last.name.toLowerCase() : new Date(last.updated_at).toISOString(), last.id) : null };
  }

  /** Record folders of one object, only for the records this person may read (a record folder per record that has attachments). */
  async #recordFolders(ctx, objectFolder, head, { after, limit }) {
    const { all, own } = await this.objects.readScopes(ctx);
    const key = coll(objectFolder.record_object);
    const mine = own.find((o) => o.collection === key);
    if (!this.#isAdmin(ctx) && !all.includes(key) && !mine) throw new NotFoundError('Folder not found');
    const scope = this.#isAdmin(ctx) || all.includes(key) ? sql`true` : sql`exists (select 1 from setup_records sr where sr.workspace_id = ${ctx.workspaceId} and sr.collection = ${key} and sr.id = d.record_id and sr.data @> ${JSON.stringify({ [mine.ownerKey]: ctx.email })}::jsonb)`;
    const c = after ? decodeCursor(after) : null;
    const rows = await this.#rows(sql`select d.*, null::text as owner_name from drive_folders d where d.workspace_id = ${ctx.workspaceId} and d.parent_id = ${objectFolder.id} and d.kind = 'record' and d.trashed_at is null and ${scope}
      ${c ? sql`and (lower(d.name), d.id) > (${c.k}, ${c.id})` : sql``} order by lower(d.name), d.id limit ${limit + 1}`);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { folder: head, folders: page.map(folderDto), files: [], nextCursor: rows.length > limit ? encodeCursor(last.name.toLowerCase(), last.id) : null };
  }

  async #recent(ctx, { after, limit }) {
    const c = after ? decodeCursor(after) : null;
    const visible = await this.#fileVisible(ctx);
    const rows = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')}
      where f.workspace_id = ${ctx.workspaceId} and f.trashed_at is null and ${visible} ${c ? sql`and (f.updated_at, f.id) < (${c.k}::timestamptz, ${c.id})` : sql``}
      order by f.updated_at desc, f.id desc limit ${limit + 1}`);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { folder: null, folders: [], files: page.map(fileDto), nextCursor: rows.length > limit ? encodeCursor(new Date(last.updated_at).toISOString(), last.id) : null };
  }

  async #starredItems(ctx) {
    const visible = await this.#fileVisible(ctx);
    const files = await this.#rows(sql`select f.*, ${this.#ownerName}, true as starred from drive_files f ${this.#ownerJoin('f')} join drive_stars s on s.item_id = f.id and s.item_type = 'file' and s.user_id = ${ctx.userId}
      where f.workspace_id = ${ctx.workspaceId} and f.trashed_at is null and ${visible} order by lower(f.name) limit 500`);
    const folders = await this.#rows(sql`select d.*, ${this.#ownerName}, true as starred from drive_folders d ${this.#ownerJoin('d')} join drive_stars s on s.item_id = d.id and s.item_type = 'folder' and s.user_id = ${ctx.userId}
      where d.workspace_id = ${ctx.workspaceId} and d.trashed_at is null and d.kind = 'folder' and (${this.#isAdmin(ctx) ? sql`true` : this.#pathVisible(ctx, sql.raw('d.path'))}) order by lower(d.name) limit 500`);
    return { folder: null, folders: folders.map(folderDto), files: files.map(fileDto), nextCursor: null };
  }

  async #shared(ctx) {
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, true as shared from drive_folders d ${this.#ownerJoin('d')}
      where d.workspace_id = ${ctx.workspaceId} and d.kind = 'folder' and d.trashed_at is null and d.owner_id <> ${ctx.userId}
        and exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${ctx.userId}, ${ctx.workspaceId})) order by lower(d.name), d.id limit 500`);
    return { folder: null, folders: rows.map(folderDto), files: [], nextCursor: null };
  }

  async #trash(ctx) {
    const mine = this.#isAdmin(ctx) ? sql`true` : sql`x.owner_id = ${ctx.userId}`;
    const folders = await this.#rows(sql`select x.*, ${this.#ownerName} from drive_folders x ${this.#ownerJoin('x')} where x.workspace_id = ${ctx.workspaceId} and x.kind = 'folder' and x.trashed_at is not null and ${mine}
      and (x.parent_id is null or exists (select 1 from drive_folders p where p.id = x.parent_id and p.trashed_at is null)) order by x.trashed_at desc limit 500`);
    const files = await this.#rows(sql`select x.*, ${this.#ownerName} from drive_files x ${this.#ownerJoin('x')} where x.workspace_id = ${ctx.workspaceId} and x.trashed_at is not null and ${mine}
      and exists (select 1 from drive_folders p where p.id = x.folder_id and p.trashed_at is null) order by x.trashed_at desc limit 500`);
    return { folder: null, folders: folders.map(folderDto), files: files.map(fileDto), nextCursor: null };
  }

  /** Name search across everything this person can see (the Documents search box and global search share it). */
  async search(ctx, q, limit = 20) {
    const needle = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const visible = await this.#fileVisible(ctx);
    const [files, folders] = await Promise.all([
      this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')}, p.name as folder_name from drive_files f ${this.#ownerJoin('f')} left join drive_folders p on p.id = f.folder_id
        where f.workspace_id = ${ctx.workspaceId} and f.trashed_at is null and lower(f.name) like ${needle} and ${visible} order by f.updated_at desc limit ${limit}`),
      this.#rows(sql`select d.*, ${this.#ownerName} from drive_folders d ${this.#ownerJoin('d')}
        where d.workspace_id = ${ctx.workspaceId} and d.kind = 'folder' and d.trashed_at is null and lower(d.name) like ${needle} and (${this.#isAdmin(ctx) ? sql`true` : this.#pathVisible(ctx, sql.raw('d.path'))}) order by lower(d.name) limit ${limit}`),
    ]);
    return { files: files.map((r) => ({ ...fileDto(r), folderName: r.folder_name })), folders: folders.map(folderDto) };
  }

  async #searchList(ctx, q, limit) {
    const { files, folders } = await this.search(ctx, q, limit);
    return { folder: null, folders, files, nextCursor: null, search: q };
  }

  // ---------------------------------------------------------------------------------------------------------------- folders

  async createFolder(ctx, { name, parentId }) {
    const id = uuidv7();
    let parent = null;
    if (parentId) {
      parent = await this.#folder(ctx, parentId);
      if (parent.kind !== 'folder') throw new ValidationError({ parentId: 'Folders can only be created inside your own folders' });
      await this.#need(ctx, parent, 'editor');
    }
    await this.#assertFolderNameFree(ctx, parentId ?? null, name);
    const [row] = await this.#rows(sql`insert into drive_folders (id, workspace_id, parent_id, name, path, owner_id)
      values (${id}, ${ctx.workspaceId}, ${parentId ?? null}, ${name}, ${`${parent?.path ?? '/'}${id}/`}, ${ctx.userId}) returning *`);
    return { folder: folderDto(row) };
  }

  async #assertFolderNameFree(ctx, parentId, name, exceptId) {
    const [hit] = await this.#rows(sql`select 1 from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'folder' and trashed_at is null and lower(name) = lower(${name})
      and parent_id is not distinct from ${parentId} ${exceptId ? sql`and id <> ${exceptId}` : sql``} limit 1`);
    if (hit) throw new ConflictError('A folder with that name already exists here');
  }

  async renameOrMoveFolder(ctx, id, { name, parentId }) {
    const folder = await this.#folder(ctx, id);
    if (folder.kind !== 'folder') throw new ForbiddenError('This folder is managed automatically');
    await this.#need(ctx, folder, 'editor');
    const targetParentId = parentId === undefined ? folder.parent_id : parentId;
    const newName = name ?? folder.name;
    await this.#assertFolderNameFree(ctx, targetParentId, newName, id);
    if (parentId !== undefined && parentId !== folder.parent_id) {
      let target = null;
      if (parentId) {
        target = await this.#folder(ctx, parentId);
        if (target.kind !== 'folder') throw new ValidationError({ parentId: 'You cannot move a folder there' });
        if (target.path.startsWith(folder.path)) throw new ValidationError({ parentId: 'A folder cannot be moved into itself' });
        await this.#need(ctx, target, 'editor');
      }
      const newPath = `${target?.path ?? '/'}${folder.id}/`;
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`update drive_folders set path = ${newPath} || substr(path, ${folder.path.length + 1}), updated_at = now() where workspace_id = ${ctx.workspaceId} and path like ${`${folder.path}%`}`);
        await tx.execute(sql`update drive_files set folder_path = ${newPath} || substr(folder_path, ${folder.path.length + 1}) where workspace_id = ${ctx.workspaceId} and folder_path like ${`${folder.path}%`}`);
        await tx.execute(sql`update drive_folders set parent_id = ${parentId}, name = ${newName}, updated_at = now() where id = ${id}`);
      });
    } else {
      await this.db.execute(sql`update drive_folders set name = ${newName}, updated_at = now() where id = ${id}`);
    }
    await this.#bump(ctx);
    return { folder: folderDto(await this.#folder(ctx, id)) };
  }

  // ---------------------------------------------------------------------------------------------------------------- files

  /** Streams an upload into a folder (a normal folder you can edit). */
  async upload(ctx, args) {
    return this.#upload(ctx, await this.#folder(ctx, args.folderId), args);
  }

  async #upload(ctx, folder, { filename, mime, stream, declaredSize }) {
    if (folder.kind === 'records') throw new ForbiddenError('Upload attachments from the record itself');
    await this.#need(ctx, folder, 'editor');
    const maxBytes = this.limits.maxUploadBytes;
    if (declaredSize && declaredSize > maxBytes) { stream.resume(); throw new TooLargeError(maxBytes); }
    const used = await this.usedBytes(ctx.workspaceId);
    if (used + (declaredSize ?? 0) > this.limits.quotaBytes) { stream.resume(); throw new ConflictError('This workspace has run out of Documents storage'); }

    const id = uuidv7();
    const key = `${ctx.workspaceId}/${new Date().getUTCFullYear()}/${id}`;
    const { size, checksum } = await this.storage.put(key, stream, { maxBytes: Math.min(maxBytes, this.limits.quotaBytes - used) });
    const name = await this.#freeFileName(ctx, folder.id, cleanFilename(filename));
    const [row] = await this.#rows(sql`insert into drive_files (id, workspace_id, folder_id, folder_path, name, mime, size, storage_key, checksum, owner_id, record_object, record_id)
      values (${id}, ${ctx.workspaceId}, ${folder.id}, ${folder.path}, ${name}, ${String(mime || 'application/octet-stream').slice(0, 120)}, ${size}, ${key}, ${checksum}, ${ctx.userId}, ${folder.record_object}, ${folder.record_id}) returning *`);
    await this.#bump(ctx);
    return { file: fileDto(row) };
  }

  async #freeFileName(ctx, folderId, name) {
    const rows = await this.#rows(sql`select name from drive_files where workspace_id = ${ctx.workspaceId} and folder_id = ${folderId} and trashed_at is null and lower(name) like ${`${name.toLowerCase().replace(/[\\%_]/g, '\\$&').replace(/\.[^.]*$/, '')}%`}`);
    const taken = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 1; ; n += 1) { const candidate = withSuffix(name, n); if (!taken.has(candidate.toLowerCase())) return candidate; }
  }

  async #file(ctx, id, { trashed = false } = {}) {
    const [row] = await this.#rows(sql`select * from drive_files where workspace_id = ${ctx.workspaceId} and id = ${id} ${trashed ? sql`` : sql`and trashed_at is null`}`);
    if (!row) throw new NotFoundError('File not found');
    return row;
  }

  async #fileFolder(ctx, file, minimum) {
    const folder = await this.#folder(ctx, file.folder_id, { trashed: true });
    await this.#need(ctx, folder, minimum);
    return folder;
  }

  async fileInfo(ctx, id) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'viewer');
    const [row] = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')} where f.id = ${id}`);
    return { file: fileDto(row) };
  }

  /** For downloads: checks access and returns the file row. */
  async fileForDownload(ctx, id) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'viewer');
    return file;
  }

  open(file, range) { return this.storage.open(file.storage_key, range); }

  /** A short-lived signed link so <img>, <video> and PDF viewers can load a file without an Authorization header. */
  async signedLink(ctx, id) {
    const file = await this.fileForDownload(ctx, id);
    const payload = Buffer.from(JSON.stringify({ f: file.id, w: ctx.workspaceId, e: Date.now() + 5 * MINUTE })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(`drive:${payload}`).digest('base64url');
    return { url: `/api/v1/drive/raw/${payload}.${sig}`, expiresInSeconds: 300 };
  }

  async fileForLink(token) {
    const [payload, sig] = String(token).split('.');
    const expected = createHmac('sha256', this.secret).update(`drive:${payload}`).digest('base64url');
    const a = Buffer.from(sig ?? ''); const b = Buffer.from(expected);
    if (!payload || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundError('Link expired');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.e < Date.now()) throw new NotFoundError('Link expired');
    const [row] = await this.#rows(sql`select * from drive_files where workspace_id = ${data.w} and id = ${data.f} and trashed_at is null`);
    if (!row) throw new NotFoundError('File not found');
    return row;
  }

  async renameOrMoveFile(ctx, id, { name, folderId }) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'editor');
    let target = null;
    if (folderId && folderId !== file.folder_id) {
      target = await this.#folder(ctx, folderId);
      if (target.kind === 'records') throw new ValidationError({ folderId: 'You cannot move a file there' });
      await this.#need(ctx, target, 'editor');
      if ((target.kind === 'record') !== Boolean(file.record_object) || (target.kind === 'record' && target.record_id !== file.record_id)) throw new ValidationError({ folderId: 'Record attachments stay with their record' });
    }
    const folder = target ?? { id: file.folder_id, path: file.folder_path };
    const newName = await this.#freeFileNameExcept(ctx, folder.id, name ?? file.name, id);
    await this.db.execute(sql`update drive_files set name = ${newName}, folder_id = ${folder.id}, folder_path = ${folder.path}, updated_at = now() where id = ${id}`);
    await this.#bump(ctx);
    return this.fileInfo(ctx, id);
  }

  async #freeFileNameExcept(ctx, folderId, name, exceptId) {
    const rows = await this.#rows(sql`select name from drive_files where workspace_id = ${ctx.workspaceId} and folder_id = ${folderId} and trashed_at is null and id <> ${exceptId}`);
    const taken = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 1; ; n += 1) { const candidate = withSuffix(name, n); if (!taken.has(candidate.toLowerCase())) return candidate; }
  }

  async copyFile(ctx, id, { folderId, name }) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'viewer');
    const target = await this.#folder(ctx, folderId ?? file.folder_id);
    if (target.kind === 'records' || target.kind === 'record') throw new ValidationError({ folderId: 'Copy into one of your folders' });
    await this.#need(ctx, target, 'editor');
    const used = await this.usedBytes(ctx.workspaceId);
    if (used + Number(file.size) > this.limits.quotaBytes) throw new ConflictError('This workspace has run out of Documents storage');
    const newId = uuidv7();
    const key = `${ctx.workspaceId}/${new Date().getUTCFullYear()}/${newId}`;
    await this.storage.put(key, this.storage.open(file.storage_key));
    const copyName = await this.#freeFileName(ctx, target.id, name ?? (target.id === file.folder_id ? `Copy of ${file.name}` : file.name));
    const [row] = await this.#rows(sql`insert into drive_files (id, workspace_id, folder_id, folder_path, name, mime, size, storage_key, checksum, owner_id)
      values (${newId}, ${ctx.workspaceId}, ${target.id}, ${target.path}, ${copyName}, ${file.mime}, ${file.size}, ${key}, ${file.checksum}, ${ctx.userId}) returning *`);
    await this.#bump(ctx);
    return { file: fileDto(row) };
  }

  // ---------------------------------------------------------------------------------------------------------------- trash

  async trash(ctx, { type, id }) {
    const when = new Date();
    if (type === 'file') {
      const file = await this.#file(ctx, id);
      await this.#fileFolder(ctx, file, 'editor');
      await this.db.execute(sql`update drive_files set trashed_at = ${when} where id = ${id}`);
    } else {
      const folder = await this.#folder(ctx, id);
      if (folder.kind !== 'folder') throw new ForbiddenError('This folder is managed automatically');
      await this.#need(ctx, folder, 'editor');
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`update drive_folders set trashed_at = ${when} where workspace_id = ${ctx.workspaceId} and path like ${`${folder.path}%`} and trashed_at is null`);
        await tx.execute(sql`update drive_files set trashed_at = ${when} where workspace_id = ${ctx.workspaceId} and folder_path like ${`${folder.path}%`} and trashed_at is null`);
      });
    }
    await this.#bump(ctx);
    return { ok: true };
  }

  async restore(ctx, { type, id }) {
    if (type === 'file') {
      const file = await this.#file(ctx, id, { trashed: true });
      const folder = await this.#folder(ctx, file.folder_id, { trashed: true });
      if (folder.trashed_at) throw new ConflictError('Restore the folder first');
      await this.#need(ctx, folder, 'editor');
      await this.db.execute(sql`update drive_files set trashed_at = null, updated_at = now() where id = ${id}`);
    } else {
      const folder = await this.#folder(ctx, id, { trashed: true });
      await this.#need(ctx, folder, 'editor');
      if (folder.parent_id) { const parent = await this.#folder(ctx, folder.parent_id, { trashed: true }); if (parent.trashed_at) throw new ConflictError('Restore the parent folder first'); }
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`update drive_folders set trashed_at = null where workspace_id = ${ctx.workspaceId} and path like ${`${folder.path}%`} and trashed_at = ${folder.trashed_at}`);
        await tx.execute(sql`update drive_files set trashed_at = null where workspace_id = ${ctx.workspaceId} and folder_path like ${`${folder.path}%`} and trashed_at = ${folder.trashed_at}`);
      });
    }
    await this.#bump(ctx);
    return { ok: true };
  }

  /** Permanently deletes something that is already in the trash (rows and stored bytes). */
  async removeForever(ctx, { type, id }) {
    let keys;
    if (type === 'file') {
      const file = await this.#file(ctx, id, { trashed: true });
      if (!file.trashed_at) throw new ConflictError('Move it to the trash first');
      await this.#fileFolder(ctx, file, 'editor');
      await this.db.execute(sql`delete from drive_files where id = ${id}`);
      keys = [file.storage_key];
    } else {
      const folder = await this.#folder(ctx, id, { trashed: true });
      if (!folder.trashed_at) throw new ConflictError('Move it to the trash first');
      await this.#need(ctx, folder, 'editor');
      keys = (await this.#rows(sql`select storage_key from drive_files where workspace_id = ${ctx.workspaceId} and folder_path like ${`${folder.path}%`}`)).map((r) => r.storage_key);
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`delete from drive_files where workspace_id = ${ctx.workspaceId} and folder_path like ${`${folder.path}%`}`);
        await tx.execute(sql`delete from drive_access where workspace_id = ${ctx.workspaceId} and folder_id in (select id from drive_folders where workspace_id = ${ctx.workspaceId} and path like ${`${folder.path}%`})`);
        await tx.execute(sql`delete from drive_folders where workspace_id = ${ctx.workspaceId} and path like ${`${folder.path}%`}`);
      });
    }
    await this.db.execute(sql`delete from drive_stars where item_id = ${id}`);
    await Promise.all(keys.map((key) => this.storage.remove(key).catch(() => {})));
    await this.#bump(ctx);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------------------------------------------- stars, usage

  async star(ctx, { type, id, starred }) {
    if (type === 'file') await this.fileForDownload(ctx, id); else await this.#need(ctx, await this.#folder(ctx, id), 'viewer');
    if (starred) await this.db.execute(sql`insert into drive_stars (workspace_id, user_id, item_type, item_id) values (${ctx.workspaceId}, ${ctx.userId}, ${type}, ${id}) on conflict do nothing`);
    else await this.db.execute(sql`delete from drive_stars where user_id = ${ctx.userId} and item_type = ${type} and item_id = ${id}`);
    return { ok: true };
  }

  async usedBytes(workspaceId) {
    const [row] = await this.#rows(sql`select coalesce(sum(size), 0)::bigint as used from drive_files where workspace_id = ${workspaceId}`);
    return Number(row.used);
  }

  async usage(ctx) { return { used: await this.usedBytes(ctx.workspaceId), quota: this.limits.quotaBytes, maxUpload: this.limits.maxUploadBytes }; }

  // ---------------------------------------------------------------------------------------------------------------- sharing

  async getAccess(ctx, folderId) {
    const folder = await this.#folder(ctx, folderId);
    if (folder.kind !== 'folder') throw new ValidationError({ folder: 'Access to this folder follows the record it belongs to' });
    const role = await this.#need(ctx, folder, 'viewer');
    const entries = await this.#rows(sql`select a.principal_type, a.principal_id, a.role, u.first_name, u.last_name, u.email from drive_access a left join users u on a.principal_type = 'user' and u.id = a.principal_id
      where a.workspace_id = ${ctx.workspaceId} and a.folder_id = ${folderId} order by a.created_at`);
    const [owner] = await this.#rows(sql`select first_name, last_name, email from users where id = ${folder.owner_id}`);
    // grants coming from folders above (read-only here, change them where they are set)
    const above = folder.parent_id && folder.inherit ? await this.#inheritedFrom(ctx, folder) : [];
    return {
      folder: { id: folder.id, name: folder.name, inherit: folder.inherit, role },
      owner: { id: folder.owner_id, name: `${owner?.first_name ?? ''} ${owner?.last_name ?? ''}`.trim(), email: owner?.email ?? '' },
      entries: entries.map((e) => ({ principalType: e.principal_type, principalId: e.principal_id, role: e.role, name: e.principal_type === 'workspace' ? 'Everyone in this workspace' : `${e.first_name} ${e.last_name}`.trim(), email: e.email ?? null })),
      inheritedFrom: above,
    };
  }

  async #inheritedFrom(ctx, folder) {
    const ids = folder.path.split('/').filter(Boolean).slice(0, -1);
    if (!ids.length) return [];
    const rows = await this.#rows(sql`select d.id as folder_id, d.name as folder_name, d.inherit, a.principal_type, a.principal_id, a.role, u.first_name, u.last_name, u.email
      from drive_folders d left join drive_access a on a.folder_id = d.id left join users u on a.principal_type = 'user' and u.id = a.principal_id
      where d.workspace_id = ${ctx.workspaceId} and d.id = any(${pgArray(ids, 'uuid')}) order by length(d.path) desc`);
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r.folder_id)) { if (r.principal_id) out.push(r); continue; }
      seen.add(r.folder_id);
      if (r.principal_id) out.push(r);
      if (!r.inherit) break;
    }
    return out.filter((r) => r.principal_id).map((r) => ({ folderId: r.folder_id, folderName: r.folder_name, principalType: r.principal_type, principalId: r.principal_id, role: r.role, name: r.principal_type === 'workspace' ? 'Everyone in this workspace' : `${r.first_name} ${r.last_name}`.trim(), email: r.email ?? null }));
  }

  /** Replaces the folder's own grants (and, optionally, whether it inherits). Managers only. */
  async setAccess(ctx, folderId, { inherit, entries }) {
    const folder = await this.#folder(ctx, folderId);
    if (folder.kind !== 'folder') throw new ValidationError({ folder: 'Access to this folder follows the record it belongs to' });
    await this.#need(ctx, folder, 'manager');
    const people = entries.filter((e) => e.principalType === 'user').map((e) => e.principalId);
    if (entries.some((e) => e.principalType === 'workspace' && e.principalId !== ctx.workspaceId)) throw new ValidationError({ entries: 'Unknown workspace' });
    if (people.length) {
      const members = await this.#rows(sql`select user_id from memberships where workspace_id = ${ctx.workspaceId} and user_id = any(${pgArray(people, 'uuid')})`);
      if (members.length !== new Set(people).size) throw new ValidationError({ entries: 'You can only share with members of this workspace' });
    }
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`delete from drive_access where folder_id = ${folderId}`);
      for (const e of entries) {
        await tx.execute(sql`insert into drive_access (id, workspace_id, folder_id, principal_type, principal_id, role, created_by) values (${uuidv7()}, ${ctx.workspaceId}, ${folderId}, ${e.principalType}, ${e.principalId}, ${e.role}, ${ctx.userId}) on conflict do nothing`);
      }
      if (inherit !== undefined && folder.parent_id) await tx.execute(sql`update drive_folders set inherit = ${inherit}, updated_at = now() where id = ${folderId}`);
    });
    await this.#bump(ctx);
    return this.getAccess(ctx, folderId);
  }

  // ---------------------------------------------------------------------------------------------------------------- record attachments

  async #recordsRoot(ctx) {
    const find = () => this.#rows(sql`select d.*, null::text as owner_name from drive_folders d where d.workspace_id = ${ctx.workspaceId} and d.kind = 'records' and d.parent_id is null limit 1`);
    const [hit] = await find();
    if (hit) return hit;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.workspaceId}:records`}))`);
      const [again] = (await tx.execute(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'records' and parent_id is null limit 1`)).rows;
      if (again) return again;
      const id = uuidv7();
      return (await tx.execute(sql`insert into drive_folders (id, workspace_id, name, path, kind, inherit, owner_id) values (${id}, ${ctx.workspaceId}, 'Records', ${`/${id}/`}, 'records', false, ${ctx.userId}) returning *`)).rows[0];
    });
  }

  /** The folder `Records / <Object> / <record uuid>`, created on first use. */
  async #recordFolder(ctx, objectKey, recordId, label) {
    const [hit] = await this.#rows(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'record' and record_object = ${objectKey} and record_id = ${recordId}`);
    if (hit) return hit;
    const root = await this.#recordsRoot(ctx);
    const def = await this.objects.definition(ctx.workspaceId, objectKey);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.workspaceId}:${objectKey}:${recordId}`}))`);
      const [again] = (await tx.execute(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'record' and record_object = ${objectKey} and record_id = ${recordId}`)).rows;
      if (again) return again;
      let [objectFolder] = (await tx.execute(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'records' and record_object = ${objectKey} limit 1`)).rows;
      if (!objectFolder) {
        const oid = uuidv7();
        [objectFolder] = (await tx.execute(sql`insert into drive_folders (id, workspace_id, parent_id, name, path, kind, record_object, inherit, owner_id) values (${oid}, ${ctx.workspaceId}, ${root.id}, ${def?.plural ?? objectKey}, ${`${root.path}${oid}/`}, 'records', ${objectKey}, false, ${ctx.userId}) returning *`)).rows;
      }
      const rid = uuidv7();
      return (await tx.execute(sql`insert into drive_folders (id, workspace_id, parent_id, name, path, kind, record_object, record_id, inherit, owner_id)
        values (${rid}, ${ctx.workspaceId}, ${objectFolder.id}, ${String(label ?? recordId).slice(0, 200)}, ${`${objectFolder.path}${rid}/`}, 'record', ${objectKey}, ${recordId}, false, ${ctx.userId}) returning *`)).rows[0];
    });
  }

  /** Attachments of one record. Requires read access to the record. */
  async recordFiles(ctx, objectKey, recordId) {
    const { record } = await this.objects.get(ctx, objectKey, recordId); // throws if the person may not read it
    const [folder] = await this.#rows(sql`select * from drive_folders where workspace_id = ${ctx.workspaceId} and kind = 'record' and record_object = ${objectKey} and record_id = ${recordId}`);
    const perms = await this.objects.permissions(ctx, objectKey);
    if (!folder) return { files: [], folderId: null, canUpload: perms.edit };
    const rows = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')}
      where f.workspace_id = ${ctx.workspaceId} and f.folder_id = ${folder.id} and f.trashed_at is null order by f.created_at desc limit 500`);
    return { files: rows.map(fileDto), folderId: folder.id, canUpload: perms.edit, label: record.name ?? record.label };
  }

  /** Uploads an attachment for a record (needs edit access to it). Everything lands in `Records/<Object>/<record uuid>`. */
  async uploadToRecord(ctx, objectKey, recordId, args) {
    const { record } = await this.objects.get(ctx, objectKey, recordId);
    if (!(await this.objects.permissions(ctx, objectKey)).edit) { args.stream.resume(); throw new ForbiddenError('You can view this record but not change it'); }
    const folder = await this.#recordFolder(ctx, objectKey, recordId, record.name ?? record.label ?? recordId);
    return this.#upload(ctx, folder, args);
  }

  /** Members of the workspace matching a name or email (the "Add people" box in the share dialog). */
  describeKind(file) { return FILE_KIND_LABELS[fileKindOf(file.name, file.mime)]; }
}
