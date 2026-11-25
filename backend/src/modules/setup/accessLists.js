import { ALL_OBJECTS, STANDARD_OBJECTS, isKnownObject } from '@app/shared';
import { v5 as uuidv5 } from 'uuid';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor } from '../../shared/pagination.js';
import { ipInRange } from '../security/ip.js';
import { listNs } from './records.service.js';

const yn = (b) => (b ? 'Yes' : 'No');
const isYes = (v) => String(v).toLowerCase() === 'yes';
const day = (d) => new Date(d).toISOString().slice(0, 10);
const OBJECT_NAMESPACE = '6f0c3a40-5d4b-4c63-9a53-0a8e2f9f0b11';
const objectId = (key) => uuidv5(key, OBJECT_NAMESPACE); // the sharing list addresses rows by id, and its rows are the standard objects
const duplicate = (e) => (e.code === '23505' || e.cause?.code === '23505');
const badIp = (e) => (e.code === '22P02' || e.cause?.code === '22P02');

/**
 * The Setup lists that sit on the access-control and security tables: profiles, object settings (grants), permission-set assignments, sharing
 * defaults, trusted networks and the role hierarchy. Each one is a thin mapping between the page's columns and a real table, with the rules
 * (unique names, the standard profiles are fixed, no lock-out) enforced here and in the database.
 */
export function createAccessLists({ repos, cache, access, security, addons = null }) {
  const touch = async (ctx, key, action, summary, { grants = false, policy = false } = {}) => {
    await Promise.all([cache.bump(listNs(ctx.tenantId, key)), grants ? access.changed(ctx.tenantId) : null, policy ? security.changed(ctx.tenantId) : null, cache.bump(`search:${ctx.tenantId}`)]);
    await repos.auditLog.record(ctx.tenantId, ctx.userId, key, action, summary);
  };
  const page = (rows, limit, cursorOf) => ({ nextCursor: rows.length > limit ? encodeCursor(cursorOf(rows[limit - 1])) : null });

  // A name belongs to one thing: a profile or a permission set, never both.
  const assertNameFree = async (tenantId, name, { exceptProfileId } = {}) => {
    const [profile, set] = await Promise.all([repos.access.profileByName(tenantId, name), repos.access.permissionSetByName(tenantId, name)]);
    if ((profile && profile.id !== exceptProfileId) || set) throw new ConflictError(`“${name}” is already a profile or a permission set`);
  };

  const profiles = {
    async list(ctx, { limit, after, q }) {
      const cursor = decodeCursor(after);
      const rows = await repos.access.listProfiles(ctx.tenantId, { limit: limit + 1, after: cursor, q });
      return { ...page(rows, limit, (r) => ({ n: r.name.toLowerCase(), id: r.id })), items: rows.slice(0, limit).map((r) => ({ id: r.id, profile_name: r.name, user_license: r.user_license, custom: !r.is_system, description: r.description, created_by: r.created_by_name ?? 'Quelli', last_modified: day(r.updated_at) })) };
    },
    async create(ctx, { profile_name: name, description, user_license: license }) {
      await assertNameFree(ctx.tenantId, name);
      const row = await repos.access.createProfile(ctx.tenantId, { name, description, userLicense: license, createdBy: ctx.userId });
      await touch(ctx, 'profiles', 'create', `Created Profile: ${name}`, { grants: true });
      return { id: row.id, profile_name: row.name };
    },
    async update(ctx, id, { profile_name: name, description }) {
      const current = await repos.access.profileById(ctx.tenantId, id);
      if (!current) throw new NotFoundError('Profile not found');
      if (current.is_system) throw new ForbiddenError('The standard profiles cannot be changed');
      if (name && name.toLowerCase() !== current.name.toLowerCase()) await assertNameFree(ctx.tenantId, name, { exceptProfileId: id });
      await repos.access.updateProfile(ctx.tenantId, id, { name, description });
      await touch(ctx, 'profiles', 'update', `Changed Profile: ${name ?? current.name}`, { grants: true });
      return { id, profile_name: name ?? current.name };
    },
    async remove(ctx, ids) {
      const n = await repos.access.deleteProfiles(ctx.tenantId, ids);
      if (!n) throw new ForbiddenError('The standard profiles cannot be deleted');
      await touch(ctx, 'profiles', 'delete', `Deleted ${n} Profile(s)`, { grants: true });
      return n;
    },
  };

  const objectSettings = {
    async list(ctx, { limit, after, q }) {
      const rows = await repos.access.listGrants(ctx.tenantId, { limit: limit + 1, after: decodeCursor(after), q });
      return { ...page(rows, limit, (r) => ({ t: r.created_at.toISOString(), id: r.id })), items: rows.slice(0, limit).map((r) => ({ id: r.id, object: r.object_key, permission_set: r.grantee, read: yn(r.can_read), create: yn(r.can_create), edit: yn(r.can_edit), delete: yn(r.can_delete) })) };
    },
    async create(ctx, { object, permission_set: name, read, create, edit, delete: del }) {
      if (!isKnownObject(object)) throw new ValidationError([{ field: 'object', message: `No object named “${object}”` }]);
      const profile = await repos.access.profileByName(ctx.tenantId, name);
      const set = profile ? null : (await repos.access.permissionSetByName(ctx.tenantId, name)) ?? await repos.access.createPermissionSet(ctx.tenantId, { name, createdBy: ctx.userId }); // a new name makes a permission set
      const grant = await repos.access.upsertGrant(ctx.tenantId, profile ? { profileId: profile.id } : { permissionSetId: set.id }, object, { can_read: isYes(read), can_create: isYes(create), can_edit: isYes(edit), can_delete: isYes(del) });
      await touch(ctx, 'object-settings', 'create', `Set ${object} permissions for ${name}`, { grants: true });
      return { id: grant.id, object };
    },
    async update(ctx, id, { read, create, edit, delete: del }) {
      const flag = (v) => (v === undefined ? undefined : isYes(v));
      const row = await repos.access.updateGrant(ctx.tenantId, id, { can_read: flag(read), can_create: flag(create), can_edit: flag(edit), can_delete: flag(del) });
      if (!row) throw new NotFoundError('Permission not found');
      await touch(ctx, 'object-settings', 'update', 'Changed Object Settings', { grants: true });
      return { id };
    },
    async remove(ctx, ids) {
      const n = await repos.access.deleteGrants(ctx.tenantId, ids);
      if (n) await touch(ctx, 'object-settings', 'delete', `Deleted ${n} Object Settings row(s)`, { grants: true });
      return n;
    },
  };

  const manageAssignments = addons && {
    async list(ctx, { limit, after, q }) {
      const rows = await repos.access.listAssignments(ctx.tenantId, { limit: limit + 1, after: decodeCursor(after), q });
      return { ...page(rows, limit, (r) => ({ t: r.created_at.toISOString(), id: r.id })), items: rows.slice(0, limit).map((r) => ({ id: r.id, user: r.user_name ?? r.email, permission_set: r.permission_set, assigned: day(r.created_at) })) };
    },
    async create(ctx, { user: email, permission_set: name }) {
      const member = await repos.access.memberByEmail(ctx.tenantId, email.trim());
      if (!member) throw new ValidationError([{ field: 'user', message: `${email} is not a member of this organisation` }]);
      await addons.assign(ctx, member.id, name);
      await cache.bump(listNs(ctx.tenantId, 'manage-assignments'));
      return { id: member.id, user: email };
    },
    async remove(ctx, ids) {
      const rows = await repos.access.assignmentsByIds(ctx.tenantId, ids);
      for (const r of rows) await addons.unassign(ctx, r.user_id, r.permission_set);
      await cache.bump(listNs(ctx.tenantId, 'manage-assignments'));
      return rows.length;
    },
  };

  const sharingDefaults = {
    async list(ctx, { q }) {
      const overrides = new Map((await repos.access.sharingOverrides(ctx.tenantId)).map((r) => [r.object_key, r]));
      const needle = q?.toLowerCase();
      const items = STANDARD_OBJECTS.filter((o) => !needle || o.key.toLowerCase().includes(needle)).map((o) => {
        const r = overrides.get(o.key);
        return { id: objectId(o.key), object: o.key, default_internal_access: r?.internal_access ?? 'Public Read/Write', default_external_access: r?.external_access ?? 'Private', grant_access_using_hierarchies: r?.grant_via_hierarchies ?? true };
      });
      return { items, nextCursor: null, total: items.length, totalCapped: false };
    },
    async update(ctx, id, { default_internal_access: internal, default_external_access: external, grant_access_using_hierarchies: hierarchies }) {
      const object = STANDARD_OBJECTS.find((o) => objectId(o.key) === id);
      if (!object) throw new NotFoundError('Object not found');
      await repos.access.upsertSharing(ctx.tenantId, object.key, { internalAccess: internal, externalAccess: external, grantViaHierarchies: hierarchies });
      await touch(ctx, 'sharing-defaults', 'update', `Changed sharing default for ${object.key}`, { grants: true });
      return { id, object: object.key };
    },
  };

  const networkAccess = {
    async list(ctx, { limit, after }) {
      const rows = await repos.security.listRanges(ctx.tenantId, { limit: limit + 1, after: decodeCursor(after) });
      return { ...page(rows, limit, (r) => ({ t: r.created_at.toISOString(), id: r.id })), items: rows.slice(0, limit).map((r) => ({ id: r.id, start_ip_address: r.start_ip, end_ip_address: r.end_ip, description: r.description, action: 'Edit | Del' })) };
    },
    async create(ctx, { start_ip_address: start, end_ip_address: end, description }) {
      // The first range must contain the admin's own address, otherwise saving it would lock them out of the organisation.
      if (ctx.ip && (await repos.security.countRanges(ctx.tenantId)) === 0 && !ipInRange(ctx.ip, start, end || start)) {
        throw new ConflictError(`Your current IP (${ctx.ip}) must be inside the first range, or you would lock yourself out.`);
      }
      let row;
      try { row = await repos.security.createRange(ctx.tenantId, { startIp: start, endIp: end || start, description }); } catch (e) { if (badIp(e)) throw new ValidationError([{ field: 'start_ip_address', message: 'Enter a valid IP address' }]); throw e; }
      await touch(ctx, 'network-access', 'create', `Added trusted network ${start}${end ? `–${end}` : ''}`, { policy: true });
      return { id: row.id };
    },
    async update(ctx, id, { start_ip_address: start, end_ip_address: end, description }) {
      let row;
      try { row = await repos.security.updateRange(ctx.tenantId, id, { startIp: start, endIp: end, description }); } catch (e) { if (badIp(e)) throw new ValidationError([{ field: 'start_ip_address', message: 'Enter a valid IP address' }]); throw e; }
      if (!row) throw new NotFoundError('Range not found');
      await touch(ctx, 'network-access', 'update', 'Changed a trusted network', { policy: true });
      return { id };
    },
    async remove(ctx, ids) {
      const n = await repos.security.deleteRanges(ctx.tenantId, ids);
      if (n) await touch(ctx, 'network-access', 'delete', `Removed ${n} trusted network(s)`, { policy: true });
      return n;
    },
  };

  const roles = {
    async list(ctx) {
      const rows = await repos.hierarchy.list(ctx.tenantId);
      return { items: rows.map((r) => ({ id: r.id, name: r.name, assigned_to: r.assigned_to, parentId: r.parent_id ?? undefined })), nextCursor: null, total: rows.length, totalCapped: false };
    },
    async tree(ctx) {
      const rows = await repos.hierarchy.list(ctx.tenantId);
      const nodes = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, assignedTo: r.assigned_to, children: [] }]));
      const roots = [];
      for (const r of rows) (r.parent_id && nodes.has(r.parent_id) ? nodes.get(r.parent_id).children : roots).push(nodes.get(r.id));
      return { roots };
    },
    async create(ctx, { name, parentId }) {
      let row;
      try { row = await repos.hierarchy.create(ctx.tenantId, { parentId: parentId ?? (await repos.hierarchy.root(ctx.tenantId))?.id, name }); } catch (e) { if (duplicate(e)) throw new ConflictError(`There is already a role named “${name}” under that parent`); throw e; }
      if (!row) throw new NotFoundError('Parent role not found');
      await touch(ctx, 'roles', 'create', `Created Role: ${name}`);
      return { id: row.id, name: row.name };
    },
    async update(ctx, id, { name, parentId }) {
      const node = await repos.hierarchy.byId(ctx.tenantId, id);
      if (!node) throw new NotFoundError('Role not found');
      try {
        if (name !== undefined) await repos.hierarchy.update(ctx.tenantId, id, { name });
        if (parentId !== undefined && parentId !== node.parent_id) {
          const parent = await repos.hierarchy.byId(ctx.tenantId, parentId);
          if (!parent) throw new NotFoundError('Parent role not found');
          if (!node.parent_id) throw new ValidationError(undefined, 'The top of the hierarchy cannot be moved');
          if (parent.path.startsWith(node.path)) throw new ValidationError(undefined, 'A role cannot be moved below itself');
          await repos.hierarchy.move(ctx.tenantId, node, parent);
        }
      } catch (e) { if (duplicate(e)) throw new ConflictError(`There is already a role named “${name}” under that parent`); throw e; }
      await touch(ctx, 'roles', 'update', `Changed Role: ${name ?? node.name}`);
      return { id, name: name ?? node.name };
    },
    async remove(ctx, ids) {
      if (await repos.hierarchy.hasChildren(ctx.tenantId, ids)) throw new ConflictError('Remove or move the sub-roles first');
      const n = await repos.hierarchy.remove(ctx.tenantId, ids);
      if (!n) throw new ForbiddenError('The top of the hierarchy cannot be deleted');
      await touch(ctx, 'roles', 'delete', `Deleted ${n} Role(s)`);
      return n;
    },
  };

  return { profiles, 'object-settings': objectSettings, ...(manageAssignments ? { 'manage-assignments': manageAssignments } : {}), 'sharing-defaults': sharingDefaults, 'network-access': networkAccess, roles };
}
