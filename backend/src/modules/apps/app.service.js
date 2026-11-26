import { createHash } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { ACTION_KINDS, ACTION_STYLES, BLOCK_KINDS, OPEN_MODES, blockKindCatalog, defaultSettings, parseBlockSettings, settingsOf } from './blockKinds.js';
import { sampleCalendar, sampleCards, sampleChart, sampleKanban, sampleRecordFields, sampleTable } from './sampleData.js';

const NS = (tenantId) => `ui:${tenantId}`;
const TTL = { ttlMs: 300_000 };
const GAP = 1000;
const ICONS = ['grid', 'layers', 'building', 'users', 'user', 'target', 'briefcase', 'life-buoy', 'megaphone', 'check-square', 'trend-up', 'package', 'folder', 'calendar', 'mail', 'phone', 'tag', 'star', 'flag', 'globe', 'server', 'shield', 'database', 'cube', 'rocket', 'key', 'home', 'chat', 'poll', 'table', 'zap', 'palette'];
const COLOURS = ['gray', 'brand', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'indigo'];
const isAdmin = (role) => role === 'owner' || role === 'admin';
const HEAVY = new Set(['password', 'line_items', 'signature', 'photo', 'file', 'html', 'rich_text', 'long_text', 'checklist', 'timer']);

const appDto = (a) => ({ id: a.id, key: a.key, label: a.label, description: a.description, icon: a.icon, color: a.color, sortOrder: a.sortOrder, active: a.active, ...(a.assignmentCount === undefined ? {} : { assignmentCount: a.assignmentCount }) });
const etagOf = (body) => `"${createHash('sha1').update(JSON.stringify(body)).digest('base64url').slice(0, 20)}"`;

/**
 * Apps, navigation, pages and blocks (configuration). Every read of a page is one cached bundle (with an ETag, so a repeat visit is a 304);
 * every Studio edit is a command that is validated here, written in one transaction-sized step, and bumps the organisation's cache version.
 */
export class AppService {
  constructor({ repos, cache, objectDefs, db }) { Object.assign(this, { repos, cache, objectDefs, db }); }
  get r() { return this.repos.apps; }

  meta() {
    return { blockKinds: blockKindCatalog(), actionKinds: ACTION_KINDS, actionStyles: ACTION_STYLES, openModes: OPEN_MODES, icons: ICONS, colours: COLOURS };
  }

  // ---------------------------------------------------------------------------------------------------------- apps

  async #person(tenantId, auth, membership, workspaceId) {
    const ids = await this.cache.rememberValue(NS(tenantId), `ids:${auth.userId}`, { ttlMs: 30_000 }, () => this.r.personIds(tenantId, auth.userId));
    return { role: membership.role, workspaceId, ...ids };
  }

  /** The apps this person may open (admins see every active app). */
  async launcher(tenantId, auth, membership, workspaceId) {
    const person = await this.#person(tenantId, auth, membership, workspaceId);
    const apps = await this.cache.rememberValue(NS(tenantId), `launch:${auth.userId}:${workspaceId}:${membership.role}`, TTL, async () => (isAdmin(membership.role)
      ? (await this.r.allApps(tenantId)).filter((a) => a.active) : await this.r.visibleApps(tenantId, person)).map(appDto));
    return { apps };
  }
  async adminApps(tenantId) { return { apps: (await this.r.allApps(tenantId)).map(appDto) }; }

  async #app(tenantId, key) {
    const app = await this.r.appByKey(tenantId, key);
    if (!app) throw new NotFoundError('App not found');
    return app;
  }
  async #assertVisible(tenantId, app, auth, membership, workspaceId) {
    if (isAdmin(membership.role)) return;
    const { apps } = await this.launcher(tenantId, auth, membership, workspaceId);
    if (!apps.some((a) => a.id === app.id)) throw new NotFoundError('App not found'); // never reveal an app the person can't open
  }

  async createApp({ tenantId, userId, body }) {
    const app = await this.r.createApp({ tenantId, createdBy: userId, ...body }).catch(this.#conflict('An app with that address already exists'));
    const route = await this.r.createRoute({ tenantId, appId: app.id, type: 'page', title: 'Home', icon: 'home' });
    await this.#newPage(tenantId, route.id);
    await this.#changed(tenantId, userId, 'app-create', `Created app ${app.label}`);
    return appDto(app);
  }
  async updateApp({ tenantId, userId, key, body }) {
    const app = await this.#app(tenantId, key);
    const updated = await this.r.updateApp(tenantId, app.id, body);
    await this.#changed(tenantId, userId, 'app-update', `Updated app ${updated.label}`);
    return appDto(updated);
  }
  async deleteApp({ tenantId, userId, key }) {
    const app = await this.#app(tenantId, key);
    await this.r.deleteApp(tenantId, app.id);
    await this.#changed(tenantId, userId, 'app-delete', `Deleted app ${app.label}`);
  }
  async reorderApps({ tenantId, userId, ids }) { await this.r.setAppOrder(tenantId, ids); await this.#changed(tenantId, userId, 'app-order', 'Reordered apps'); }
  async getAssignments(tenantId, key) { const app = await this.#app(tenantId, key); return { assignments: await this.r.assignments(app.id) }; }
  async setAssignments({ tenantId, userId, key, items }) {
    const app = await this.#app(tenantId, key);
    await this.r.setAssignments(tenantId, app.id, items);
    await this.#changed(tenantId, userId, 'app-access', `Changed who can open ${app.label}`);
    return { assignments: await this.r.assignments(app.id) };
  }

  /** An app and its navigation tree (cached). */
  async appBundle({ tenantId, key, auth, membership, workspaceId }) {
    const app = await this.#app(tenantId, key);
    await this.#assertVisible(tenantId, app, auth, membership, workspaceId);
    return this.#cached(tenantId, `app:${app.id}`, async () => ({ app: appDto(app), routes: await this.r.routes(app.id) }));
  }

  // ---------------------------------------------------------------------------------------------------------- routes and tabs

  async createRoute({ tenantId, userId, key, body }) {
    const app = await this.#app(tenantId, key);
    if (body.parentId) await this.#assertGroup(tenantId, app.id, body.parentId);
    if (body.type === 'link' && !body.linkUrl) throw new ValidationError({ linkUrl: 'Enter the address to open' });
    const route = await this.r.createRoute({ tenantId, appId: app.id, ...body });
    if (route.type === 'page') await this.#newPage(tenantId, route.id);
    await this.#changed(tenantId, userId, 'route-create', `Added ${route.type} ${route.title} to ${app.label}`);
    return route;
  }
  async updateRoute({ tenantId, userId, routeId, body }) {
    const route = await this.#route(tenantId, routeId);
    if (body.parentId) { await this.#assertGroup(tenantId, route.appId, body.parentId); if (body.parentId === routeId || (await this.#descendants(route.appId, routeId)).has(body.parentId)) throw new ValidationError({ parentId: 'A group can’t be moved inside itself' }); }
    const updated = await this.r.updateRoute(tenantId, routeId, body);
    await this.#changed(tenantId, userId, 'route-update', `Updated ${route.title}`);
    return updated;
  }
  async deleteRoute({ tenantId, userId, routeId }) {
    const route = await this.#route(tenantId, routeId);
    await this.r.deleteRoute(tenantId, routeId);
    await this.#changed(tenantId, userId, 'route-delete', `Deleted ${route.title}`);
  }
  async reorderRoutes({ tenantId, userId, ids }) { await this.r.setRouteOrder(tenantId, ids); await this.#changed(tenantId, userId, 'route-order', 'Reordered the menu'); }
  async #route(tenantId, id) { const r = await this.r.route(tenantId, id); if (!r) throw new NotFoundError('Page not found'); return r; }
  async #assertGroup(tenantId, appId, id) { const g = await this.r.route(tenantId, id); if (!g || g.appId !== appId || g.type !== 'group') throw new ValidationError({ parentId: 'Choose a group of this app' }); }
  async #descendants(appId, id) {
    const routes = await this.r.routes(appId); const out = new Set(); const walk = (p) => routes.filter((x) => x.parentId === p).forEach((x) => { out.add(x.id); walk(x.id); }); walk(id); return out;
  }
  /** A new page starts with one tab. */
  async #newPage(tenantId, routeId) { await this.r.createTab({ tenantId, routeId, title: 'Main' }); }

  async createTab({ tenantId, userId, routeId, body }) {
    const route = await this.#route(tenantId, routeId);
    if (route.type !== 'page') throw new ValidationError({ routeId: 'Only pages have tabs' });
    const tab = await this.r.createTab({ tenantId, routeId, ...body });
    await this.#changed(tenantId, userId, 'tab-create', `Added tab ${tab.title}`);
    return tab;
  }
  async updateTab({ tenantId, userId, tabId, body }) { const tab = await this.#tab(tenantId, tabId); const t = await this.r.updateTab(tenantId, tabId, body); await this.#changed(tenantId, userId, 'tab-update', `Updated tab ${tab.title}`); return t; }
  async deleteTab({ tenantId, userId, tabId }) {
    const tab = await this.#tab(tenantId, tabId);
    if ((await this.r.tabs(tab.routeId)).length <= 1) throw new ConflictError('A page needs at least one tab');
    await this.r.deleteTab(tenantId, tabId);
    await this.#changed(tenantId, userId, 'tab-delete', `Deleted tab ${tab.title}`);
  }
  async reorderTabs({ tenantId, userId, ids }) { await this.r.setTabOrder(tenantId, ids); await this.#changed(tenantId, userId, 'tab-order', 'Reordered tabs'); }
  async #tab(tenantId, id) { const t = await this.r.tab(tenantId, id); if (!t) throw new NotFoundError('Tab not found'); return t; }

  // ---------------------------------------------------------------------------------------------------------- page bundle

  /** A page: its route, tabs and the layout of one tab. Cached per tab; the whole response carries an ETag. */
  async pageBundle({ tenantId, routeId, tabId, auth, membership, workspaceId }) {
    const route = await this.#route(tenantId, routeId);
    await this.#assertVisible(tenantId, { id: route.appId }, auth, membership, workspaceId);
    if (route.type !== 'page') throw new ValidationError({ routeId: 'This is not a page' });
    return this.#cached(tenantId, `page:${routeId}:${tabId ?? ''}`, async () => {
      const tabs = (await this.r.tabs(routeId));
      const tab = tabs.find((t) => t.id === tabId) ?? tabs.find((t) => !t.hidden) ?? tabs[0];
      return { route: { id: route.id, appKey: route.appKey, title: route.title, icon: route.icon, showHeader: route.showHeader, enableTabs: route.enableTabs }, tabs, tabId: tab?.id ?? null, layout: tab ? await this.#layout(tenantId, tab.id) : { rows: [] } };
    });
  }

  async #layout(tenantId, tabId) {
    const l = await this.r.loadLayout(tabId);
    const objectIds = [...new Set(l.blocks.map((b) => b.objectId).filter(Boolean))];
    const objects = new Map();
    await Promise.all(objectIds.map(async (id) => { try { const { object } = await this.objectDefs.get(tenantId, id); objects.set(id, { id: object.id, key: object.key, label: object.label, pluralLabel: object.pluralLabel, icon: object.icon, color: object.color }); } catch { /* deleted */ } }));
    const fieldsOf = (id) => l.fields.filter((f) => f.blockId === id).map(({ blockId, ...f }) => f);
    const actionsOf = (id, scope) => l.actions.filter((a) => a.blockId === id && a.scope === scope).map(({ blockId, scope: _s, ...a }) => a);
    const block = (b) => ({ id: b.id, kind: b.kind, title: b.title, showTitle: b.showTitle, heightPx: b.heightPx, object: objects.get(b.objectId) ?? null, settings: { ...defaultSettings(b.kind), ...(l.settings[b.id] ?? {}) }, fields: fieldsOf(b.id), actions: { block: actionsOf(b.id, 'block'), row: actionsOf(b.id, 'row') } });
    return { rows: l.rows.map((row) => ({ id: row.id, columns: l.columns.filter((c) => c.rowId === row.id).map((c) => ({ id: c.id, widthPct: c.widthPct, blocks: l.blocks.filter((b) => b.columnId === c.id).map(block) })) })) };
  }

  /** A cached value with its ETag. Anything an admin edits bumps the namespace, so every worker drops it at once. */
  async #cached(tenantId, key, load) {
    return this.cache.rememberValue(NS(tenantId), key, TTL, async () => { const body = await load(); return { body, etag: etagOf(body) }; });
  }

  // ---------------------------------------------------------------------------------------------------------- Studio: blocks

  async addBlock({ tenantId, userId, tabId, body }) {
    const tab = await this.#tab(tenantId, tabId);
    const kind = BLOCK_KINDS[body.kind];
    if (!kind) throw new ValidationError({ kind: 'Unknown block' });
    let objectData = null;
    if (kind.needsObject) {
      if (!body.objectId) throw new ValidationError({ objectId: `A ${kind.label.toLowerCase()} needs an object` });
      objectData = await this.objectDefs.get(tenantId, body.objectId).catch(() => { throw new ValidationError({ objectId: 'Unknown object' }); });
      if (objectData.object.archivedAt) throw new ConflictError('That object is archived');
    }
    const parsed = parseBlockSettings(body.kind, body.settings ?? {});
    if (parsed.issues) throw new ValidationError(Object.fromEntries(parsed.issues.map((i) => [i.path, i.message])));
    let columnId = body.columnId;
    if (columnId) { const c = await this.r.column(tenantId, columnId); if (!c || c.tabId !== tab.id) throw new ValidationError({ columnId: 'Choose a column of this tab' }); }
    else { const rowId = await this.r.createRow(tenantId, tab.id); columnId = await this.r.createColumn(tenantId, tab.id, rowId, 100); }
    const id = await this.r.createBlock({ tenantId, tabId: tab.id, columnId, kind: body.kind, title: body.title ?? (objectData ? objectData.object.pluralLabel : kind.label), showTitle: body.showTitle ?? true, objectId: body.objectId ?? null });
    const picks = objectData ? this.#autoSettings(body.kind, objectData.fields) : {};
    await this.r.saveSettings(body.kind, id, { ...defaultSettings(body.kind), ...picks, ...parsed.settings });
    if (kind.fields) await this.r.replaceFields(id, this.#autoFields(body.kind, objectData?.fields ?? []).map((f) => ({ fieldKey: f.key })));
    for (const scope of ['block', 'row']) for (const actionKind of kind.defaults[scope]) { const a = ACTION_KINDS.find((x) => x.id === actionKind); await this.r.createAction({ tenantId, blockId: id, scope, kind: a.id, label: a.label, icon: a.icon, style: a.style, openMode: a.openMode }); }
    await this.#changed(tenantId, userId, 'block-add', `Added a ${kind.label.toLowerCase()} block`);
    return { id };
  }

  /** The fields a new block shows: the first few of the object, skipping heavy ones. */
  #autoFields(kind, fields) { const n = BLOCK_KINDS[kind].defaultFields; return fields.filter((f) => f.active && !(kind === 'table' || kind === 'list' || kind === 'kanban' ? HEAVY.has(f.type) : ['password'].includes(f.type))).slice(0, n); }
  #autoSettings(kind, fields) {
    const first = (...types) => fields.find((f) => f.active && types.includes(f.type))?.key ?? null;
    if (kind === 'kanban') return { groupField: first('picklist', 'status_path'), titleField: first('text') };
    if (kind === 'calendar') { const dates = fields.filter((f) => f.active && ['date', 'date_time'].includes(f.type)); return { titleField: first('text'), startField: dates[0]?.key ?? null, endField: dates[1]?.key ?? null }; }
    if (kind === 'chart') return { dimensionField: first('picklist', 'status_path'), measureField: first('number', 'decimal', 'currency') };
    if (kind === 'list') return { titleField: first('text') };
    return {};
  }

  async updateBlock({ tenantId, userId, blockId, body }) {
    const block = await this.r.block(tenantId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    const kind = BLOCK_KINDS[block.kind];
    let objectId = block.objectId;
    if (body.objectId !== undefined) {
      if (!kind.needsObject && body.objectId) throw new ValidationError({ objectId: `A ${kind.label.toLowerCase()} doesn’t use an object` });
      if (kind.needsObject && !body.objectId) throw new ValidationError({ objectId: 'This block needs an object' });
      if (body.objectId) await this.objectDefs.get(tenantId, body.objectId).catch(() => { throw new ValidationError({ objectId: 'Unknown object' }); });
      objectId = body.objectId;
    }
    if (body.settings) {
      const parsed = parseBlockSettings(block.kind, body.settings);
      if (parsed.issues) throw new ValidationError(Object.fromEntries(parsed.issues.map((i) => [i.path, i.message])));
      await this.#assertFieldKeys(tenantId, objectId, block.kind, parsed.settings);
      await this.r.saveSettings(block.kind, blockId, parsed.settings);
    }
    await this.r.updateBlock(tenantId, blockId, { title: body.title, showTitle: body.showTitle, heightPx: body.heightPx, objectId: body.objectId });
    if (body.objectId !== undefined && body.objectId !== block.objectId && kind.fields) { const od = await this.objectDefs.get(tenantId, objectId); await this.r.replaceFields(blockId, this.#autoFields(block.kind, od.fields).map((f) => ({ fieldKey: f.key }))); }
    await this.#changed(tenantId, userId, 'block-update', `Changed a ${kind.label.toLowerCase()} block`);
  }

  /** Settings that name a field must name a field of the block's object. */
  async #assertFieldKeys(tenantId, objectId, kind, settings) {
    const names = settingsOf(kind).filter((d) => d.kind === 'fieldKey' && settings[d.key]).map((d) => [d, settings[d.key]]);
    if (!names.length) return;
    if (!objectId) throw new ValidationError({ settings: 'Choose an object first' });
    const { fields } = await this.objectDefs.get(tenantId, objectId);
    for (const [d, key] of names) if (!fields.some((f) => f.key === key)) throw new ValidationError({ [`settings.${d.key}`]: `Unknown field ${key}` });
  }

  async setBlockFields({ tenantId, userId, blockId, items }) {
    const block = await this.r.block(tenantId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    if (!BLOCK_KINDS[block.kind].fields) throw new ValidationError({ fields: 'This block has no field list' });
    if (items.length) {
      if (!block.objectId) throw new ValidationError({ fields: 'Choose an object first' });
      const { fields } = await this.objectDefs.get(tenantId, block.objectId);
      for (const f of items) if (!fields.some((x) => x.key === f.fieldKey)) throw new ValidationError({ fields: `Unknown field ${f.fieldKey}` });
      if (new Set(items.map((i) => i.fieldKey)).size !== items.length) throw new ValidationError({ fields: 'A field can be listed once' });
    }
    await this.r.replaceFields(blockId, items);
    await this.#changed(tenantId, userId, 'block-fields', 'Changed the fields of a block');
  }

  async deleteBlock({ tenantId, userId, blockId }) {
    const block = await this.r.block(tenantId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    await this.r.deleteBlock(tenantId, blockId);
    const cols = await this.r.columnsOfRow(block.rowId);
    if (cols.length === 1 && (await this.r.countBlocksInColumn(cols[0].id)) === 0) await this.#dropRow(tenantId, block.rowId, cols[0].id);
    await this.#changed(tenantId, userId, 'block-delete', 'Removed a block');
  }
  async #dropRow(tenantId, rowId, columnId) { await this.r.deleteColumn(tenantId, columnId); await this.r.deleteRowIfEmpty(rowId); }

  /** Moves a block one step: up / down inside its column (or the whole row when it is alone), left / right into the neighbouring column. */
  async moveBlock({ tenantId, userId, blockId, direction }) {
    const block = await this.r.block(tenantId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    if (direction === 'up' || direction === 'down') {
      const d = direction === 'up' ? -1 : 1;
      const siblings = await this.r.blocksOfColumn(block.columnId);
      if (siblings.length > 1) {
        const ids = siblings.map((b) => b.id); const i = ids.indexOf(blockId); const j = i + d;
        if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; await this.r.setBlockOrder(tenantId, ids); }
      } else if ((await this.r.columnsOfRow(block.rowId)).length === 1) {
        const rows = (await this.r.rowsOfTab(block.tabId)).map((r) => r.id); const i = rows.indexOf(block.rowId); const j = i + d;
        if (j >= 0 && j < rows.length) { [rows[i], rows[j]] = [rows[j], rows[i]]; await this.r.setRowOrder(tenantId, rows); }
      }
    } else {
      const cols = await this.r.columnsOfRow(block.rowId); const i = cols.findIndex((c) => c.id === block.columnId); const target = cols[i + (direction === 'left' ? -1 : 1)];
      if (!target) throw new ConflictError(direction === 'left' ? 'There is no column to the left' : 'There is no column to the right');
      const last = (await this.r.blocksOfColumn(target.id)).at(-1)?.sortOrder ?? 0;
      await this.r.moveBlock(tenantId, blockId, target.id, last + GAP);
    }
    await this.#changed(tenantId, userId, 'block-move', 'Moved a block');
  }

  async addColumn({ tenantId, userId, rowId, tabId }) {
    const tab = await this.#tab(tenantId, tabId);
    const rows = await this.r.rowsOfTab(tab.id);
    if (!rows.some((r) => r.id === rowId)) throw new NotFoundError('Row not found');
    const cols = await this.r.columnsOfRow(rowId);
    if (cols.length >= 4) throw new ConflictError('A row holds at most four columns');
    const id = await this.r.createColumn(tenantId, tab.id, rowId, 50);
    await this.#evenWidths(tenantId, rowId);
    await this.#changed(tenantId, userId, 'column-add', 'Added a column');
    return { id };
  }
  async setColumnWidth({ tenantId, userId, columnId, widthPct }) {
    const c = await this.r.column(tenantId, columnId);
    if (!c) throw new NotFoundError('Column not found');
    await this.r.setColumnWidth(tenantId, columnId, widthPct);
    await this.#changed(tenantId, userId, 'column-width', 'Resized a column');
  }
  async deleteColumn({ tenantId, userId, columnId }) {
    const c = await this.r.column(tenantId, columnId);
    if (!c) throw new NotFoundError('Column not found');
    await this.r.deleteColumn(tenantId, columnId);
    if ((await this.r.columnsOfRow(c.rowId)).length === 0) await this.r.deleteRowIfEmpty(c.rowId); else await this.#evenWidths(tenantId, c.rowId);
    await this.#changed(tenantId, userId, 'column-delete', 'Removed a column');
  }
  async #evenWidths(tenantId, rowId) { const cols = await this.r.columnsOfRow(rowId); const w = Math.floor(100 / cols.length); for (const [i, c] of cols.entries()) await this.r.setColumnWidth(tenantId, c.id, i === cols.length - 1 ? 100 - w * (cols.length - 1) : w); }

  // ---------------------------------------------------------------------------------------------------------- Studio: buttons

  async addAction({ tenantId, userId, blockId, body }) {
    const block = await this.r.block(tenantId, blockId);
    if (!block) throw new NotFoundError('Block not found');
    const kind = BLOCK_KINDS[block.kind]; const a = ACTION_KINDS.find((x) => x.id === body.kind);
    if (!a) throw new ValidationError({ kind: 'Unknown button' });
    if (!kind.actions[body.scope]?.includes(body.kind)) throw new ValidationError({ kind: `A ${kind.label.toLowerCase()} can’t have a ${a.label.toLowerCase()} button ${body.scope === 'row' ? 'on each row' : 'in its toolbar'}` });
    const created = await this.r.createAction({ tenantId, blockId, scope: body.scope, kind: a.id, label: body.label ?? a.label, icon: body.icon ?? a.icon, style: body.style ?? a.style, openMode: body.openMode ?? a.openMode, popupTitle: body.popupTitle });
    await this.#changed(tenantId, userId, 'action-add', `Added a ${a.label.toLowerCase()} button`);
    return created;
  }
  async updateAction({ tenantId, userId, actionId, body }) {
    if (!(await this.r.action(tenantId, actionId))) throw new NotFoundError('Button not found');
    const updated = await this.r.updateAction(tenantId, actionId, body);
    await this.#changed(tenantId, userId, 'action-update', 'Changed a button');
    return updated;
  }
  async deleteAction({ tenantId, userId, actionId }) { if (!(await this.r.action(tenantId, actionId))) throw new NotFoundError('Button not found'); await this.r.deleteAction(tenantId, actionId); await this.#changed(tenantId, userId, 'action-delete', 'Removed a button'); }
  async reorderActions({ tenantId, userId, blockId, scope, ids }) {
    const current = await this.r.actionsOf(blockId, scope);
    if (ids.length !== current.length || !ids.every((id) => current.includes(id))) throw new ValidationError({ ids: 'Send every button once' });
    await this.r.setActionOrder(tenantId, ids);
    await this.#changed(tenantId, userId, 'action-order', 'Reordered buttons');
  }

  // ---------------------------------------------------------------------------------------------------------- data

  /** What a block shows. Sorted, searched and paged here. Until records exist the content is clearly marked sample data. */
  async blockData({ tenantId, blockId, query }) {
    const raw = await this.r.block(tenantId, blockId);
    if (!raw) throw new NotFoundError('Block not found');
    const layout = await this.#cached(tenantId, `layout:${raw.tabId}`, () => this.#layout(tenantId, raw.tabId));
    const block = layout.body.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.id === blockId);
    const objectFields = block.object ? (await this.objectDefs.get(tenantId, block.object.id)).fields.filter((f) => f.active) : [];
    const chosen = block.fields.map((bf) => ({ ...objectFields.find((f) => f.key === bf.fieldKey), widthPx: bf.widthPx, fixed: bf.fixed, label: bf.label ?? objectFields.find((f) => f.key === bf.fieldKey)?.label })).filter((f) => f.key);
    const b = { id: block.id, settings: block.settings };
    switch (block.kind) {
      case 'table': return sampleTable({ block: b, fields: chosen, query });
      case 'list': return sampleCards({ block: b, fields: chosen, objectFields, query });
      case 'details': return sampleRecordFields({ block: b, fields: chosen });
      case 'chart': return sampleChart({ block: b, objectFields });
      case 'kanban': return sampleKanban({ block: b, objectFields, fields: chosen });
      case 'calendar': return sampleCalendar({ block: b, objectFields });
      case 'form': case 'filter': return { fields: chosen.map((f) => ({ key: f.key, label: f.label })), sample: false };
      default: return { sample: false };
    }
  }

  // ---------------------------------------------------------------------------------------------------------- internals

  #conflict(message) { return (error) => { if (error?.code === '23505' || error?.cause?.code === '23505') throw new ConflictError(message); throw error; }; }
  async #changed(tenantId, userId, action, summary) {
    await Promise.all([this.cache.bump(NS(tenantId)), this.repos.auditLog.record(tenantId, userId, 'apps', action, summary)]);
  }
}

export { ForbiddenError };
