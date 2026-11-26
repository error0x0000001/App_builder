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
/** Marks drive rows that belong to a chat conversation (`record_id` is then the conversation id). */
export const CHAT_OBJECT = '@chat';
const encodeCursor = (k, id) => Buffer.from(JSON.stringify({ k, id })).toString('base64url');
const decodeCursor = (s) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { throw new ValidationError({ after: 'Invalid cursor' }); } };
const cleanFilename = (name) => (String(name ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) || 'Untitled');
const withSuffix = (name, n) => { const i = name.lastIndexOf('.'); return i > 0 ? `${name.slice(0, i)} (${n})${name.slice(i)}` : `${name} (${n})`; };

/**
 * Documents (the Drive). Everything here is tenant-scoped and permission-checked in this class — routes only translate HTTP.
 *
 * Access (see docs/tenant-suite-plan.md): per-folder grants inherited down the tree until a Restricted folder; folder owner = manager;
 * tenant owners/admins manage everything. Conversation folders (`Chat / <conversation>`) follow conversation membership only.
 */
export class DriveService {
  constructor({ db, storage, cache, secret, limits }) { Object.assign(this, { db, storage, cache, secret, limits }); }

  // ---------------------------------------------------------------------------------------------------------------- access

  /** Only the current workspace's items (and tenant-wide ones) are ever visible: a person switches workspace to see another. */
  #inWorkspace = (ctx, alias) => sql`(${sql.raw(alias)}.workspace_id is null or ${sql.raw(alias)}.workspace_id = ${ctx.workspaceId ?? null})`;

  #isAdmin = (ctx) => ctx.actor.role === 'owner' || ctx.actor.role === 'admin';

  async #rows(query) { return (await this.db.execute(query)).rows; }

  async #folder(ctx, id, { trashed = false } = {}) {
    const [row] = await this.#rows(sql`select * from drive_folders where tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'drive_folders')} and id = ${id} ${trashed ? sql`` : sql`and trashed_at is null`}`);
    if (!row) throw new NotFoundError('Folder not found');
    return row;
  }

  /** What this person may do in a folder: viewer | editor | manager, or null (no access). */
  async roleOn(ctx, folder) {
    if (folder.kind === 'chats') return 'viewer'; // the container of the conversation folders: everyone may open it, but it only ever lists the conversations they are in
    if (folder.kind === 'chat') return (await this.#isChatMember(ctx, folder.record_id)) ? 'editor' : null; // conversation membership only — not even organisation admins
    if (this.#isAdmin(ctx)) return 'manager';
    if (folder.owner_id === ctx.userId) return 'manager';
    const ids = folder.path.split('/').filter(Boolean);
    const [nodes, grants] = await Promise.all([
      this.#rows(sql`select id, owner_id, inherit from drive_folders where tenant_id = ${ctx.tenantId} and id = any(${pgArray(ids, 'uuid')})`),
      this.#rows(sql`select folder_id, role from drive_access where tenant_id = ${ctx.tenantId} and folder_id = any(${pgArray(ids, 'uuid')}) and principal_id in (${ctx.userId}, ${ctx.tenantId})`),
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

  async #isChatMember(ctx, conversationId) {
    const [row] = await this.#rows(sql`select 1 as ok from chat_members where conversation_id = ${conversationId} and user_id = ${ctx.userId} and tenant_id = ${ctx.tenantId} and left_at is null`);
    return Boolean(row);
  }

  /** SQL: is the item at `pathExpr` visible through a grant or ownership (respecting Restricted folders)? */
  #pathVisible(ctx, pathExpr) {
    const ws = ctx.tenantId; const me = ctx.userId;
    return sql`exists (
      select 1 from drive_folders g
      where g.tenant_id = ${ws} and g.kind = 'folder' and g.trashed_at is null and ${pathExpr} like g.path || '%'
        and (g.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = g.id and a.principal_id in (${me}, ${ws})))
        and not exists (select 1 from drive_folders r where r.tenant_id = ${ws} and r.inherit = false and r.id <> g.id and r.path like g.path || '%' and ${pathExpr} like r.path || '%'))`;
  }

  async #fileVisible(ctx, alias = 'f') {
    const a = sql.raw(alias);
    // chat files: only people in the conversation (admins included — a conversation is private to its members)
    const chat = sql`(${a}.record_object = ${CHAT_OBJECT} and exists (select 1 from chat_members cm where cm.conversation_id = ${a}.record_id and cm.user_id = ${ctx.userId} and cm.left_at is null))`;
    const here = this.#inWorkspace(ctx, alias);
    if (this.#isAdmin(ctx)) return sql`(${here} and (${a}.record_object is null or ${chat}))`;
    return sql`(${here} and ((${a}.record_object is null and ${this.#pathVisible(ctx, sql.raw(`${alias}.folder_path`))}) or ${chat}))`;
  }

  // ---------------------------------------------------------------------------------------------------------------- listing

  #bump(ctx) { return this.cache.bump(searchNs(ctx.tenantId)); }

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
    if (folder.kind === 'chats') return { folder: head, folders: await this.#chatFolders(ctx, folder), files: [], nextCursor: null };
    if (folder.kind === 'chat') { // a conversation's files: named after the conversation, read-only here (files are sent from the conversation itself)
      const name = await this.#chatName(ctx, folder.record_id);
      Object.assign(head, { name, role: 'viewer', breadcrumbs: crumbs.map((c) => (c.id === folder.id ? { ...c, name } : c)) });
      return { folder: head, folders: [], ...(await this.#childFiles(ctx, folder, { sort, after, limit })) };
    }

    const folders = await this.#childFolders(ctx, folder, role);
    const { files, nextCursor } = await this.#childFiles(ctx, folder, { sort, after, limit });
    return { folder: head, folders, files, nextCursor };
  }

  /** A conversation's name as this person sees it: the group's title, or the other person's name in a DM. */
  async #chatName(ctx, conversationId) {
    const [row] = await this.#rows(sql`select case when c.kind = 'group' then coalesce(c.title, 'Group') else coalesce((select nullif(trim(u.first_name || ' ' || u.last_name), '') from chat_members p join users u on u.id = p.user_id where p.conversation_id = c.id and p.user_id <> ${ctx.userId} limit 1), 'Direct message') end as name
      from chat_conversations c where c.id = ${conversationId}`);
    return row?.name ?? 'Conversation';
  }

  /** The `Chat` container's children: one folder per conversation the person is in (named after the conversation), never anyone else's. */
  async #chatFolders(ctx, root) {
    const rows = await this.#rows(sql`select * from (select d.*, null::text as owner_name,
        case when c.kind = 'group' then coalesce(c.title, 'Group') else coalesce((select nullif(trim(u.first_name || ' ' || u.last_name), '') from chat_members p join users u on u.id = p.user_id where p.conversation_id = c.id and p.user_id <> ${ctx.userId} limit 1), 'Direct message') end as display_name
      from drive_folders d join chat_conversations c on c.id = d.record_id
      join chat_members cm on cm.conversation_id = c.id and cm.user_id = ${ctx.userId} and cm.left_at is null
      where d.tenant_id = ${ctx.tenantId} and d.kind = 'chat' and d.parent_id = ${root.id} and d.trashed_at is null) q order by lower(q.display_name), q.id limit 500`);
    return rows.map((r) => ({ ...folderDto(r), name: r.display_name }));
  }

  async #breadcrumbs(ctx, folder) {
    const ids = folder.path.split('/').filter(Boolean);
    const nodes = await this.#rows(sql`select * from drive_folders where tenant_id = ${ctx.tenantId} and id = any(${pgArray(ids, 'uuid')})`);
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
    const ws = ctx.tenantId; const me = ctx.userId;
    const visible = all || this.#isAdmin(ctx)
      ? sql`true`
      : sql`(d.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${me}, ${ws})))`;
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, exists (select 1 from drive_access a where a.folder_id = d.id) as shared
      from drive_folders d ${this.#ownerJoin('d')} where d.tenant_id = ${ws} and ${this.#inWorkspace(ctx, 'd')} and d.parent_id is null and d.kind = 'folder' and d.trashed_at is null and ${visible} order by lower(d.name), d.id limit 500`);
    const [chats] = all ? [] : await this.#rows(sql`select d.* from drive_folders d where d.tenant_id = ${ws} and d.kind = 'chats' and d.parent_id is null
      and exists (select 1 from drive_folders k join chat_members cm on cm.conversation_id = k.record_id and cm.user_id = ${me} and cm.left_at is null where k.parent_id = d.id and k.kind = 'chat' and k.trashed_at is null) limit 1`);
    return { folder: null, folders: [...(chats ? [folderDto(chats)] : []), ...rows.map(folderDto)], files: [], nextCursor: null };
  }

  async #childFolders(ctx, parent, parentRole) {
    const ws = ctx.tenantId; const me = ctx.userId;
    const visible = this.#isAdmin(ctx)
      ? sql`true`
      : sql`((d.inherit and ${parentRole ? sql`true` : sql`false`}) or d.owner_id = ${me} or exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${me}, ${ws})))`;
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, exists (select 1 from drive_access a where a.folder_id = d.id) as shared
      from drive_folders d ${this.#ownerJoin('d')} where d.tenant_id = ${ws} and d.parent_id = ${parent.id} and d.kind = 'folder' and d.trashed_at is null and ${visible} order by lower(d.name), d.id limit 1000`);
    return rows.map(folderDto);
  }

  async #childFiles(ctx, folder, { sort, after, limit }) {
    const c = after ? decodeCursor(after) : null;
    const byName = sort === 'name';
    const keyset = !c ? sql`true` : byName ? sql`(lower(f.name), f.id) > (${c.k}, ${c.id})` : sql`(f.updated_at, f.id) < (${c.k}::timestamptz, ${c.id})`;
    const rows = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')}
      where f.tenant_id = ${ctx.tenantId} and f.folder_id = ${folder.id} and f.trashed_at is null and ${keyset}
      order by ${byName ? sql`lower(f.name), f.id` : sql`f.updated_at desc, f.id desc`} limit ${limit + 1}`);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { files: page.map(fileDto), nextCursor: rows.length > limit ? encodeCursor(byName ? last.name.toLowerCase() : new Date(last.updated_at).toISOString(), last.id) : null };
  }

  async #recent(ctx, { after, limit }) {
    const c = after ? decodeCursor(after) : null;
    const visible = await this.#fileVisible(ctx);
    const rows = await this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')} from drive_files f ${this.#ownerJoin('f')}
      where f.tenant_id = ${ctx.tenantId} and f.trashed_at is null and ${visible} ${c ? sql`and (f.updated_at, f.id) < (${c.k}::timestamptz, ${c.id})` : sql``}
      order by f.updated_at desc, f.id desc limit ${limit + 1}`);
    const page = rows.slice(0, limit); const last = page.at(-1);
    return { folder: null, folders: [], files: page.map(fileDto), nextCursor: rows.length > limit ? encodeCursor(new Date(last.updated_at).toISOString(), last.id) : null };
  }

  async #starredItems(ctx) {
    const visible = await this.#fileVisible(ctx);
    const files = await this.#rows(sql`select f.*, ${this.#ownerName}, true as starred from drive_files f ${this.#ownerJoin('f')} join drive_stars s on s.item_id = f.id and s.item_type = 'file' and s.user_id = ${ctx.userId}
      where f.tenant_id = ${ctx.tenantId} and f.trashed_at is null and ${visible} order by lower(f.name) limit 500`);
    const folders = await this.#rows(sql`select d.*, ${this.#ownerName}, true as starred from drive_folders d ${this.#ownerJoin('d')} join drive_stars s on s.item_id = d.id and s.item_type = 'folder' and s.user_id = ${ctx.userId}
      where d.tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'd')} and d.trashed_at is null and d.kind = 'folder' and (${this.#isAdmin(ctx) ? sql`true` : this.#pathVisible(ctx, sql.raw('d.path'))}) order by lower(d.name) limit 500`);
    return { folder: null, folders: folders.map(folderDto), files: files.map(fileDto), nextCursor: null };
  }

  async #shared(ctx) {
    const rows = await this.#rows(sql`select d.*, ${this.#ownerName}, ${this.#starred(ctx, 'folder', 'd')}, true as shared from drive_folders d ${this.#ownerJoin('d')}
      where d.tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'd')} and d.kind = 'folder' and d.trashed_at is null and d.owner_id <> ${ctx.userId}
        and exists (select 1 from drive_access a where a.folder_id = d.id and a.principal_id in (${ctx.userId}, ${ctx.tenantId})) order by lower(d.name), d.id limit 500`);
    return { folder: null, folders: rows.map(folderDto), files: [], nextCursor: null };
  }

  async #trash(ctx) {
    const mine = this.#isAdmin(ctx) ? sql`true` : sql`x.owner_id = ${ctx.userId}`;
    const folders = await this.#rows(sql`select x.*, ${this.#ownerName} from drive_folders x ${this.#ownerJoin('x')} where x.tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'x')} and x.kind = 'folder' and x.trashed_at is not null and ${mine}
      and (x.parent_id is null or exists (select 1 from drive_folders p where p.id = x.parent_id and p.trashed_at is null)) order by x.trashed_at desc limit 500`);
    const files = await this.#rows(sql`select x.*, ${this.#ownerName} from drive_files x ${this.#ownerJoin('x')} where x.tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'x')} and x.trashed_at is not null and ${mine}
      and exists (select 1 from drive_folders p where p.id = x.folder_id and p.trashed_at is null) order by x.trashed_at desc limit 500`);
    return { folder: null, folders: folders.map(folderDto), files: files.map(fileDto), nextCursor: null };
  }

  /** Name search across everything this person can see (the Documents search box and global search share it). */
  async search(ctx, q, limit = 20) {
    const needle = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    const visible = await this.#fileVisible(ctx);
    const [files, folders] = await Promise.all([
      this.#rows(sql`select f.*, ${this.#ownerName}, ${this.#starred(ctx, 'file', 'f')}, p.name as folder_name from drive_files f ${this.#ownerJoin('f')} left join drive_folders p on p.id = f.folder_id
        where f.tenant_id = ${ctx.tenantId} and f.trashed_at is null and lower(f.name) like ${needle} and ${visible} order by f.updated_at desc limit ${limit}`),
      this.#rows(sql`select d.*, ${this.#ownerName} from drive_folders d ${this.#ownerJoin('d')}
        where d.tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'd')} and d.kind = 'folder' and d.trashed_at is null and lower(d.name) like ${needle} and (${this.#isAdmin(ctx) ? sql`true` : this.#pathVisible(ctx, sql.raw('d.path'))}) order by lower(d.name) limit ${limit}`),
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
    const [row] = await this.#rows(sql`insert into drive_folders (id, tenant_id, workspace_id, parent_id, name, path, owner_id)
      values (${id}, ${ctx.tenantId}, ${parent ? parent.workspace_id : ctx.workspaceId}, ${parentId ?? null}, ${name}, ${`${parent?.path ?? '/'}${id}/`}, ${ctx.userId}) returning *`);
    return { folder: folderDto(row) };
  }

  async #assertFolderNameFree(ctx, parentId, name, exceptId) {
    const [hit] = await this.#rows(sql`select 1 from drive_folders where tenant_id = ${ctx.tenantId} and kind = 'folder' and trashed_at is null and lower(name) = lower(${name})
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
      if ((target?.workspace_id ?? folder.workspace_id) !== folder.workspace_id) throw new ValidationError({ parentId: 'A folder can’t be moved to another workspace' });
      const newPath = `${target?.path ?? '/'}${folder.id}/`;
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`update drive_folders set path = ${newPath} || substr(path, ${folder.path.length + 1}), updated_at = now() where tenant_id = ${ctx.tenantId} and path like ${`${folder.path}%`}`);
        await tx.execute(sql`update drive_files set folder_path = ${newPath} || substr(folder_path, ${folder.path.length + 1}) where tenant_id = ${ctx.tenantId} and folder_path like ${`${folder.path}%`}`);
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
    const folder = await this.#folder(ctx, args.folderId);
    if (folder.kind === 'chat' || folder.kind === 'chats') { args.stream.resume(); throw new ForbiddenError('Send files from the conversation itself'); }
    return this.#upload(ctx, folder, args);
  }

  async #upload(ctx, folder, { filename, mime, stream, declaredSize }) {
    await this.#need(ctx, folder, 'editor');
    const maxBytes = this.limits.maxUploadBytes;
    if (declaredSize && declaredSize > maxBytes) { stream.resume(); throw new TooLargeError(maxBytes); }
    const used = await this.usedBytes(ctx.tenantId);
    if (used + (declaredSize ?? 0) > this.limits.quotaBytes) { stream.resume(); throw new ConflictError('This organisation has run out of Documents storage'); }

    const id = uuidv7();
    const key = `${ctx.tenantId}/${new Date().getUTCFullYear()}/${id}`;
    const { size, checksum } = await this.storage.put(key, stream, { maxBytes: Math.min(maxBytes, this.limits.quotaBytes - used) });
    const name = await this.#freeFileName(ctx, folder.id, cleanFilename(filename));
    const [row] = await this.#rows(sql`insert into drive_files (id, tenant_id, workspace_id, folder_id, folder_path, name, mime, size, storage_key, checksum, owner_id, record_object, record_id)
      values (${id}, ${ctx.tenantId}, ${folder.workspace_id}, ${folder.id}, ${folder.path}, ${name}, ${String(mime || 'application/octet-stream').slice(0, 120)}, ${size}, ${key}, ${checksum}, ${ctx.userId}, ${folder.record_object}, ${folder.record_id}) returning *`);
    await this.#bump(ctx);
    return { file: fileDto(row) };
  }

  async #freeFileName(ctx, folderId, name) {
    const rows = await this.#rows(sql`select name from drive_files where tenant_id = ${ctx.tenantId} and folder_id = ${folderId} and trashed_at is null and lower(name) like ${`${name.toLowerCase().replace(/[\\%_]/g, '\\$&').replace(/\.[^.]*$/, '')}%`}`);
    const taken = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 1; ; n += 1) { const candidate = withSuffix(name, n); if (!taken.has(candidate.toLowerCase())) return candidate; }
  }

  async #file(ctx, id, { trashed = false } = {}) {
    const [row] = await this.#rows(sql`select * from drive_files where tenant_id = ${ctx.tenantId} and ${this.#inWorkspace(ctx, 'drive_files')} and id = ${id} ${trashed ? sql`` : sql`and trashed_at is null`}`);
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
    const payload = Buffer.from(JSON.stringify({ f: file.id, w: ctx.tenantId, e: Date.now() + 5 * MINUTE })).toString('base64url');
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
    const [row] = await this.#rows(sql`select * from drive_files where tenant_id = ${data.w} and id = ${data.f} and trashed_at is null`);
    if (!row) throw new NotFoundError('File not found');
    return row;
  }

  async renameOrMoveFile(ctx, id, { name, folderId }) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'editor');
    let target = null;
    if (folderId && folderId !== file.folder_id) {
      target = await this.#folder(ctx, folderId);
      await this.#need(ctx, target, 'editor');
      if (target.workspace_id !== file.workspace_id) throw new ValidationError({ folderId: 'A file can’t be moved to another workspace' });
      if ((target.kind === 'chat') !== Boolean(file.record_object) || (target.kind === 'chat' && target.record_id !== file.record_id)) throw new ValidationError({ folderId: 'Conversation files stay with their conversation' });
    }
    const folder = target ?? { id: file.folder_id, path: file.folder_path };
    const newName = await this.#freeFileNameExcept(ctx, folder.id, name ?? file.name, id);
    await this.db.execute(sql`update drive_files set name = ${newName}, folder_id = ${folder.id}, folder_path = ${folder.path}, updated_at = now() where id = ${id}`);
    await this.#bump(ctx);
    return this.fileInfo(ctx, id);
  }

  async #freeFileNameExcept(ctx, folderId, name, exceptId) {
    const rows = await this.#rows(sql`select name from drive_files where tenant_id = ${ctx.tenantId} and folder_id = ${folderId} and trashed_at is null and id <> ${exceptId}`);
    const taken = new Set(rows.map((r) => r.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 1; ; n += 1) { const candidate = withSuffix(name, n); if (!taken.has(candidate.toLowerCase())) return candidate; }
  }

  async copyFile(ctx, id, { folderId, name }) {
    const file = await this.#file(ctx, id);
    await this.#fileFolder(ctx, file, 'viewer');
    const target = await this.#folder(ctx, folderId ?? file.folder_id);
    if (target.kind === 'chats') throw new ValidationError({ folderId: 'Copy into one of your folders' });
    await this.#need(ctx, target, 'editor');
    const used = await this.usedBytes(ctx.tenantId);
    if (used + Number(file.size) > this.limits.quotaBytes) throw new ConflictError('This organisation has run out of Documents storage');
    const newId = uuidv7();
    const key = `${ctx.tenantId}/${new Date().getUTCFullYear()}/${newId}`;
    await this.storage.put(key, this.storage.open(file.storage_key));
    const copyName = await this.#freeFileName(ctx, target.id, name ?? (target.id === file.folder_id ? `Copy of ${file.name}` : file.name));
    const [row] = await this.#rows(sql`insert into drive_files (id, tenant_id, workspace_id, folder_id, folder_path, name, mime, size, storage_key, checksum, owner_id, record_object, record_id)
      values (${newId}, ${ctx.tenantId}, ${target.workspace_id}, ${target.id}, ${target.path}, ${copyName}, ${file.mime}, ${file.size}, ${key}, ${file.checksum}, ${ctx.userId}, ${target.record_object}, ${target.record_id}) returning *`);
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
        await tx.execute(sql`update drive_folders set trashed_at = ${when} where tenant_id = ${ctx.tenantId} and path like ${`${folder.path}%`} and trashed_at is null`);
        await tx.execute(sql`update drive_files set trashed_at = ${when} where tenant_id = ${ctx.tenantId} and folder_path like ${`${folder.path}%`} and trashed_at is null`);
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
        await tx.execute(sql`update drive_folders set trashed_at = null where tenant_id = ${ctx.tenantId} and path like ${`${folder.path}%`} and trashed_at = ${folder.trashed_at}`);
        await tx.execute(sql`update drive_files set trashed_at = null where tenant_id = ${ctx.tenantId} and folder_path like ${`${folder.path}%`} and trashed_at = ${folder.trashed_at}`);
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
      keys = (await this.#rows(sql`select storage_key from drive_files where tenant_id = ${ctx.tenantId} and folder_path like ${`${folder.path}%`}`)).map((r) => r.storage_key);
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`delete from drive_files where tenant_id = ${ctx.tenantId} and folder_path like ${`${folder.path}%`}`);
        await tx.execute(sql`delete from drive_access where tenant_id = ${ctx.tenantId} and folder_id in (select id from drive_folders where tenant_id = ${ctx.tenantId} and path like ${`${folder.path}%`})`);
        await tx.execute(sql`delete from drive_folders where tenant_id = ${ctx.tenantId} and path like ${`${folder.path}%`}`);
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
    if (starred) await this.db.execute(sql`insert into drive_stars (tenant_id, user_id, item_type, item_id) values (${ctx.tenantId}, ${ctx.userId}, ${type}, ${id}) on conflict do nothing`);
    else await this.db.execute(sql`delete from drive_stars where user_id = ${ctx.userId} and item_type = ${type} and item_id = ${id}`);
    return { ok: true };
  }

  async usedBytes(tenantId) {
    const [row] = await this.#rows(sql`select coalesce(sum(size), 0)::bigint as used from drive_files where tenant_id = ${tenantId}`);
    return Number(row.used);
  }

  async usage(ctx) { return { used: await this.usedBytes(ctx.tenantId), quota: this.limits.quotaBytes, maxUpload: this.limits.maxUploadBytes }; }

  // ---------------------------------------------------------------------------------------------------------------- sharing

  async getAccess(ctx, folderId) {
    const folder = await this.#folder(ctx, folderId);
    if (folder.kind !== 'folder') throw new ValidationError({ folder: 'Access to this folder follows the conversation it belongs to' });
    const role = await this.#need(ctx, folder, 'viewer');
    const entries = await this.#rows(sql`select a.principal_type, a.principal_id, a.role, u.first_name, u.last_name, u.email from drive_access a left join users u on a.principal_type = 'user' and u.id = a.principal_id
      where a.tenant_id = ${ctx.tenantId} and a.folder_id = ${folderId} order by a.created_at`);
    const [owner] = await this.#rows(sql`select first_name, last_name, email from users where id = ${folder.owner_id}`);
    // grants coming from folders above (read-only here, change them where they are set)
    const above = folder.parent_id && folder.inherit ? await this.#inheritedFrom(ctx, folder) : [];
    return {
      folder: { id: folder.id, name: folder.name, inherit: folder.inherit, role },
      owner: { id: folder.owner_id, name: `${owner?.first_name ?? ''} ${owner?.last_name ?? ''}`.trim(), email: owner?.email ?? '' },
      entries: entries.map((e) => ({ principalType: e.principal_type, principalId: e.principal_id, role: e.role, name: e.principal_type === 'tenant' ? 'Everyone in this organisation' : `${e.first_name} ${e.last_name}`.trim(), email: e.email ?? null })),
      inheritedFrom: above,
    };
  }

  async #inheritedFrom(ctx, folder) {
    const ids = folder.path.split('/').filter(Boolean).slice(0, -1);
    if (!ids.length) return [];
    const rows = await this.#rows(sql`select d.id as folder_id, d.name as folder_name, d.inherit, a.principal_type, a.principal_id, a.role, u.first_name, u.last_name, u.email
      from drive_folders d left join drive_access a on a.folder_id = d.id left join users u on a.principal_type = 'user' and u.id = a.principal_id
      where d.tenant_id = ${ctx.tenantId} and d.id = any(${pgArray(ids, 'uuid')}) order by length(d.path) desc`);
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r.folder_id)) { if (r.principal_id) out.push(r); continue; }
      seen.add(r.folder_id);
      if (r.principal_id) out.push(r);
      if (!r.inherit) break;
    }
    return out.filter((r) => r.principal_id).map((r) => ({ folderId: r.folder_id, folderName: r.folder_name, principalType: r.principal_type, principalId: r.principal_id, role: r.role, name: r.principal_type === 'tenant' ? 'Everyone in this organisation' : `${r.first_name} ${r.last_name}`.trim(), email: r.email ?? null }));
  }

  /** Replaces the folder's own grants (and, optionally, whether it inherits). Managers only. */
  async setAccess(ctx, folderId, { inherit, entries }) {
    const folder = await this.#folder(ctx, folderId);
    if (folder.kind !== 'folder') throw new ValidationError({ folder: 'Access to this folder follows the conversation it belongs to' });
    await this.#need(ctx, folder, 'manager');
    const people = entries.filter((e) => e.principalType === 'user').map((e) => e.principalId);
    if (entries.some((e) => e.principalType === 'tenant' && e.principalId !== ctx.tenantId)) throw new ValidationError({ entries: 'Unknown tenant' });
    if (people.length) {
      const members = await this.#rows(sql`select user_id from memberships where tenant_id = ${ctx.tenantId} and user_id = any(${pgArray(people, 'uuid')})`);
      if (members.length !== new Set(people).size) throw new ValidationError({ entries: 'You can only share with members of this organisation' });
    }
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`delete from drive_access where folder_id = ${folderId}`);
      for (const e of entries) {
        await tx.execute(sql`insert into drive_access (id, tenant_id, folder_id, principal_type, principal_id, role, created_by) values (${uuidv7()}, ${ctx.tenantId}, ${folderId}, ${e.principalType}, ${e.principalId}, ${e.role}, ${ctx.userId}) on conflict do nothing`);
      }
      if (inherit !== undefined && folder.parent_id) await tx.execute(sql`update drive_folders set inherit = ${inherit}, updated_at = now() where id = ${folderId}`);
    });
    await this.#bump(ctx);
    return this.getAccess(ctx, folderId);
  }

  async #chatsRoot(ctx) {
    const find = (db) => db.execute(sql`select * from drive_folders where tenant_id = ${ctx.tenantId} and kind = 'chats' and parent_id is null limit 1`).then((r) => r.rows[0]);
    const hit = await find(this.db);
    if (hit) return hit;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.tenantId}:chats`}))`);
      const again = await find(tx);
      if (again) return again;
      const id = uuidv7();
      return (await tx.execute(sql`insert into drive_folders (id, tenant_id, name, path, kind, inherit, owner_id) values (${id}, ${ctx.tenantId}, 'Chat', ${`/${id}/`}, 'chats', false, ${ctx.userId}) returning *`)).rows[0];
    });
  }

  /** The folder `Chat / <conversation uuid>`, created on first upload. Access = membership of that conversation. */
  async #chatFolder(ctx, conversationId) {
    const find = (db) => db.execute(sql`select * from drive_folders where tenant_id = ${ctx.tenantId} and kind = 'chat' and record_id = ${conversationId}`).then((r) => r.rows[0]);
    const hit = await find(this.db);
    if (hit) return hit;
    const root = await this.#chatsRoot(ctx);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ctx.tenantId}:chat:${conversationId}`}))`);
      const again = await find(tx);
      if (again) return again;
      const id = uuidv7();
      return (await tx.execute(sql`insert into drive_folders (id, tenant_id, parent_id, name, path, kind, record_object, record_id, inherit, owner_id)
        values (${id}, ${ctx.tenantId}, ${root.id}, ${conversationId}, ${`${root.path}${id}/`}, 'chat', ${CHAT_OBJECT}, ${conversationId}, false, ${ctx.userId}) returning *`)).rows[0];
    });
  }

  /** The id of a conversation's file folder for a member (used to copy forwarded attachments into it). */
  async chatFolderId(ctx, conversationId) {
    if (!(await this.#isChatMember(ctx, conversationId))) throw new NotFoundError('Conversation not found');
    return (await this.#chatFolder(ctx, conversationId)).id;
  }

  /** Uploads a file into a conversation (members only). It becomes visible in Documents search/recent to the same people. */
  async uploadToChat(ctx, conversationId, args) {
    if (!(await this.#isChatMember(ctx, conversationId))) { args.stream.resume(); throw new NotFoundError('Conversation not found'); }
    return this.#upload(ctx, await this.#chatFolder(ctx, conversationId), args);
  }

  /** Metadata for files the caller uploaded into this conversation's folder — what a message stores about its attachments. */
  async chatFileMeta(ctx, conversationId, ids) {
    if (!ids.length) return [];
    const folder = await this.#chatFolder(ctx, conversationId);
    const rows = await this.#rows(sql`select id, name, mime, size from drive_files where tenant_id = ${ctx.tenantId} and folder_id = ${folder.id} and owner_id = ${ctx.userId} and trashed_at is null and id = any(${pgArray(ids, 'uuid')})`);
    if (rows.length !== new Set(ids).size) throw new ValidationError({ attachments: 'Attach files you uploaded to this conversation' });
    const byId = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, mime: r.mime, size: Number(r.size) }]));
    return ids.map((id) => byId.get(id));
  }

  /** Members of the organisation matching a name or email (the "Add people" box in the share dialog). */
  describeKind(file) { return FILE_KIND_LABELS[fileKindOf(file.name, file.mime)]; }
}
