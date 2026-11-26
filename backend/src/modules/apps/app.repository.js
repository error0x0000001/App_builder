import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { pgArray } from '../../shared/db/helpers.js';
import { BLOCK_KINDS, settingsOf } from './blockKinds.js';

const GAP = 1000;
const camel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
const ident = (name) => sql.raw(`"${name.replace(/[^a-z_]/g, '')}"`);

/** Real tables for apps, routes, tabs, layout, blocks and their buttons. Raw SQL on purpose: every read is one indexed lookup. */
export class AppRepository {
  constructor(db) { this.db = db; }
  async #rows(query) { return (await this.db.execute(query)).rows; }
  async #one(query) { return (await this.#rows(query))[0] ?? null; }

  // ----------------------------------------------------------------------------------------------------------- apps

  /** Apps a person may open: no assignments = everyone, otherwise a match on profile, permission set, organisation role or workspace. */
  visibleApps(tenantId, p) {
    return this.#rows(sql`select a.* from apps a where a.tenant_id = ${tenantId} and a.active and (
        not exists (select 1 from app_assignments x where x.app_id = a.id)
        or exists (select 1 from app_assignments x where x.app_id = a.id and (x.profile_id = ${p.profileId ?? null} or x.permission_set_id = any(${pgArray(p.permissionSetIds ?? [], 'uuid')}) or x.org_role::text = ${p.role} or x.workspace_id = ${p.workspaceId ?? null})))
      order by a.sort_order, lower(a.label), a.id`).then((r) => r.map(camel));
  }
  allApps(tenantId) { return this.#rows(sql`select a.*, (select count(*)::int from app_assignments x where x.app_id = a.id) as assignment_count from apps a where a.tenant_id = ${tenantId} order by a.sort_order, lower(a.label), a.id`).then((r) => r.map(camel)); }
  async appByKey(tenantId, key) { const r = await this.#one(sql`select * from apps where tenant_id = ${tenantId} and key = ${key}`); return r && camel(r); }
  async createApp(v) {
    const r = await this.#one(sql`insert into apps (id, tenant_id, key, label, description, icon, color, sort_order, created_by) values (${uuidv7()}, ${v.tenantId}, ${v.key}, ${v.label}, ${v.description}, ${v.icon}, ${v.color},
      (select coalesce(max(sort_order), 0) + ${GAP} from apps where tenant_id = ${v.tenantId}), ${v.createdBy}) returning *`);
    return camel(r);
  }
  async updateApp(tenantId, id, v) {
    const r = await this.#one(sql`update apps set label = coalesce(${v.label ?? null}, label), description = coalesce(${v.description ?? null}, description), icon = coalesce(${v.icon ?? null}, icon), color = coalesce(${v.color ?? null}, color),
      active = coalesce(${v.active ?? null}, active), updated_at = now() where tenant_id = ${tenantId} and id = ${id} returning *`);
    return r && camel(r);
  }
  async deleteApp(tenantId, id) { return (await this.#rows(sql`delete from apps where tenant_id = ${tenantId} and id = ${id} returning id`)).length === 1; }
  async setAppOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update apps set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }
  assignments(appId) { return this.#rows(sql`select id, profile_id, permission_set_id, org_role::text as org_role, workspace_id from app_assignments where app_id = ${appId}`).then((r) => r.map(camel)); }
  async setAssignments(tenantId, appId, items) {
    await this.db.execute(sql`delete from app_assignments where app_id = ${appId}`);
    for (const a of items) await this.db.execute(sql`insert into app_assignments (id, tenant_id, app_id, profile_id, permission_set_id, org_role, workspace_id) values (${uuidv7()}, ${tenantId}, ${appId}, ${a.profileId ?? null}, ${a.permissionSetId ?? null}, ${a.orgRole ?? null}::tenant_role, ${a.workspaceId ?? null})`);
  }
  /** Ids a person's profile and permission sets resolve to (for the visibility check). */
  async personIds(tenantId, userId) {
    const r = await this.#one(sql`select (select profile_id from memberships where tenant_id = ${tenantId} and user_id = ${userId}) as profile_id,
      coalesce((select array_agg(permission_set_id) from permission_set_assignments where tenant_id = ${tenantId} and user_id = ${userId}), '{}') as permission_set_ids`);
    return { profileId: r?.profile_id ?? null, permissionSetIds: r?.permission_set_ids ?? [] };
  }

  // ----------------------------------------------------------------------------------------------------------- routes and tabs

  routes(appId) { return this.#rows(sql`select id, parent_id, type, title, icon, link_url, sort_order, hidden, show_header, enable_tabs from app_routes where app_id = ${appId} order by sort_order, id`).then((r) => r.map(camel)); }
  async route(tenantId, id) { const r = await this.#one(sql`select r.*, a.key as app_key from app_routes r join apps a on a.id = r.app_id where r.tenant_id = ${tenantId} and r.id = ${id}`); return r && camel(r); }
  async createRoute(v) {
    const r = await this.#one(sql`insert into app_routes (id, tenant_id, app_id, parent_id, type, title, icon, link_url, sort_order) values (${uuidv7()}, ${v.tenantId}, ${v.appId}, ${v.parentId ?? null}, ${v.type}, ${v.title}, ${v.icon ?? ''}, ${v.linkUrl ?? null},
      (select coalesce(max(sort_order), 0) + ${GAP} from app_routes where app_id = ${v.appId} and parent_id is not distinct from ${v.parentId ?? null})) returning *`);
    return camel(r);
  }
  async updateRoute(tenantId, id, v) {
    const r = await this.#one(sql`update app_routes set title = coalesce(${v.title ?? null}, title), icon = coalesce(${v.icon ?? null}, icon), link_url = case when type = 'link' then coalesce(${v.linkUrl ?? null}, link_url) else null end,
      hidden = coalesce(${v.hidden ?? null}, hidden), show_header = coalesce(${v.showHeader ?? null}, show_header), enable_tabs = coalesce(${v.enableTabs ?? null}, enable_tabs),
      parent_id = case when ${v.parentId !== undefined} then ${v.parentId ?? null}::uuid else parent_id end, updated_at = now() where tenant_id = ${tenantId} and id = ${id} returning *`);
    return r && camel(r);
  }
  async deleteRoute(tenantId, id) { return (await this.#rows(sql`delete from app_routes where tenant_id = ${tenantId} and id = ${id} returning id`)).length === 1; }
  async setRouteOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update app_routes set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }

  tabs(routeId) { return this.#rows(sql`select id, route_id, title, icon, sort_order, hidden from page_tabs where route_id = ${routeId} order by sort_order, id`).then((r) => r.map(camel)); }
  async tab(tenantId, id) { const r = await this.#one(sql`select t.*, r.app_id from page_tabs t join app_routes r on r.id = t.route_id where t.tenant_id = ${tenantId} and t.id = ${id}`); return r && camel(r); }
  async createTab(v) {
    const r = await this.#one(sql`insert into page_tabs (id, tenant_id, route_id, title, icon, sort_order) values (${uuidv7()}, ${v.tenantId}, ${v.routeId}, ${v.title}, ${v.icon ?? ''},
      (select coalesce(max(sort_order), 0) + ${GAP} from page_tabs where route_id = ${v.routeId})) returning *`);
    return camel(r);
  }
  async updateTab(tenantId, id, v) { const r = await this.#one(sql`update page_tabs set title = coalesce(${v.title ?? null}, title), icon = coalesce(${v.icon ?? null}, icon), hidden = coalesce(${v.hidden ?? null}, hidden) where tenant_id = ${tenantId} and id = ${id} returning *`); return r && camel(r); }
  async deleteTab(tenantId, id) { return (await this.#rows(sql`delete from page_tabs where tenant_id = ${tenantId} and id = ${id} returning id`)).length === 1; }
  async setTabOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update page_tabs set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }

  // ----------------------------------------------------------------------------------------------------------- layout

  /** The whole layout of a tab: rows → columns → blocks, with each block's settings, fields and buttons. One round of parallel indexed queries. */
  async loadLayout(tabId) {
    const [rows, columns, blocks, fields, actions] = await Promise.all([
      this.#rows(sql`select id, sort_order from ui_rows where tab_id = ${tabId} order by sort_order, id`),
      this.#rows(sql`select id, row_id, width_pct, sort_order from ui_columns where tab_id = ${tabId} order by sort_order, id`),
      this.#rows(sql`select id, column_id, kind, title, show_title, object_id, height_px, sort_order from ui_blocks where tab_id = ${tabId} order by sort_order, id`),
      this.#rows(sql`select f.block_id, f.field_key, f.sort_order, f.label, f.width_px, f.span, f.fixed, f.read_only from block_fields f join ui_blocks b on b.id = f.block_id where b.tab_id = ${tabId} order by f.sort_order, f.field_key`),
      this.#rows(sql`select a.id, a.block_id, a.scope, a.kind, a.label, a.icon, a.style, a.open_mode, a.popup_title, a.hidden, a.sort_order from block_actions a join ui_blocks b on b.id = a.block_id where b.tab_id = ${tabId} order by a.sort_order, a.id`),
    ]);
    const byKind = {};
    for (const b of blocks) (byKind[b.kind] ??= []).push(b.id);
    const settings = {};
    await Promise.all(Object.entries(byKind).filter(([kind]) => BLOCK_KINDS[kind]?.table).map(async ([kind, ids]) => {
      const defs = settingsOf(kind);
      const rowsOf = await this.#rows(sql`select block_id, ${sql.join(defs.map((d) => sql`${ident(d.column)}`), sql`, `)} from ${ident(BLOCK_KINDS[kind].table)} where block_id = any(${pgArray(ids, 'uuid')})`);
      for (const r of rowsOf) settings[r.block_id] = Object.fromEntries(defs.map((d) => [d.key, r[d.column]]));
    }));
    return { rows: rows.map(camel), columns: columns.map(camel), blocks: blocks.map(camel), fields: fields.map(camel), actions: actions.map(camel), settings };
  }

  async createRow(tenantId, tabId) { return (await this.#one(sql`insert into ui_rows (id, tenant_id, tab_id, sort_order) values (${uuidv7()}, ${tenantId}, ${tabId}, (select coalesce(max(sort_order), 0) + ${GAP} from ui_rows where tab_id = ${tabId})) returning id`)).id; }
  async createColumn(tenantId, tabId, rowId, widthPct = 100) { return (await this.#one(sql`insert into ui_columns (id, tenant_id, tab_id, row_id, width_pct, sort_order) values (${uuidv7()}, ${tenantId}, ${tabId}, ${rowId}, ${widthPct}, (select coalesce(max(sort_order), 0) + ${GAP} from ui_columns where row_id = ${rowId})) returning id`)).id; }
  async column(tenantId, id) { const r = await this.#one(sql`select id, tab_id, row_id, width_pct, sort_order from ui_columns where tenant_id = ${tenantId} and id = ${id}`); return r && camel(r); }
  async columnsOfRow(rowId) { return this.#rows(sql`select id, width_pct, sort_order from ui_columns where row_id = ${rowId} order by sort_order, id`).then((r) => r.map(camel)); }
  async setColumnWidth(tenantId, id, widthPct) { await this.db.execute(sql`update ui_columns set width_pct = ${widthPct} where tenant_id = ${tenantId} and id = ${id}`); }
  async deleteColumn(tenantId, id) { await this.db.execute(sql`delete from ui_columns where tenant_id = ${tenantId} and id = ${id}`); }
  async deleteRowIfEmpty(rowId) { await this.db.execute(sql`delete from ui_rows r where r.id = ${rowId} and not exists (select 1 from ui_columns c where c.row_id = r.id)`); }
  async setRowOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update ui_rows set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }
  async rowsOfTab(tabId) { return this.#rows(sql`select id, sort_order from ui_rows where tab_id = ${tabId} order by sort_order, id`).then((r) => r.map(camel)); }
  async blocksOfColumn(columnId) { return this.#rows(sql`select id, sort_order from ui_blocks where column_id = ${columnId} order by sort_order, id`).then((r) => r.map(camel)); }
  async countBlocksInColumn(columnId) { return (await this.#one(sql`select count(*)::int as n from ui_blocks where column_id = ${columnId}`)).n; }

  async block(tenantId, id) { const r = await this.#one(sql`select b.*, c.row_id from ui_blocks b join ui_columns c on c.id = b.column_id where b.tenant_id = ${tenantId} and b.id = ${id}`); return r && camel(r); }
  async createBlock(v) {
    const id = uuidv7();
    await this.db.execute(sql`insert into ui_blocks (id, tenant_id, tab_id, column_id, kind, title, show_title, object_id, sort_order) values (${id}, ${v.tenantId}, ${v.tabId}, ${v.columnId}, ${v.kind}, ${v.title}, ${v.showTitle ?? true}, ${v.objectId ?? null},
      (select coalesce(max(sort_order), 0) + ${GAP} from ui_blocks where column_id = ${v.columnId}))`);
    return id;
  }
  async updateBlock(tenantId, id, v) {
    await this.db.execute(sql`update ui_blocks set title = coalesce(${v.title ?? null}, title), show_title = coalesce(${v.showTitle ?? null}, show_title),
      object_id = case when ${v.objectId !== undefined} then ${v.objectId ?? null}::uuid else object_id end, height_px = case when ${v.heightPx !== undefined} then ${v.heightPx ?? null}::int else height_px end, updated_at = now() where tenant_id = ${tenantId} and id = ${id}`);
  }
  async moveBlock(tenantId, id, columnId, sortOrder) { await this.db.execute(sql`update ui_blocks set column_id = ${columnId}, sort_order = ${sortOrder}, updated_at = now() where tenant_id = ${tenantId} and id = ${id}`); }
  async setBlockOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update ui_blocks set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }
  async deleteBlock(tenantId, id) { await this.db.execute(sql`delete from ui_blocks where tenant_id = ${tenantId} and id = ${id}`); }

  /** Writes a block's settings into its kind's table (insert or replace). Only columns of that kind are ever touched. */
  async saveSettings(kind, blockId, values) {
    const k = BLOCK_KINDS[kind]; if (!k?.table) return;
    const defs = settingsOf(kind);
    const cols = defs.filter((d) => values[d.key] !== undefined);
    if (!cols.length) { await this.db.execute(sql`insert into ${ident(k.table)} (block_id) values (${blockId}) on conflict (block_id) do nothing`); return; }
    await this.db.execute(sql`insert into ${ident(k.table)} (block_id, ${sql.join(cols.map((d) => ident(d.column)), sql`, `)}) values (${blockId}, ${sql.join(cols.map((d) => sql`${values[d.key]}`), sql`, `)})
      on conflict (block_id) do update set ${sql.join(cols.map((d) => sql`${ident(d.column)} = excluded.${ident(d.column)}`), sql`, `)}`);
  }
  async replaceFields(blockId, items) {
    await this.db.execute(sql`delete from block_fields where block_id = ${blockId}`);
    for (const [i, f] of items.entries()) await this.db.execute(sql`insert into block_fields (block_id, field_key, sort_order, label, width_px, span, fixed, read_only) values (${blockId}, ${f.fieldKey}, ${(i + 1) * 10}, ${f.label ?? null}, ${f.widthPx ?? null}, ${f.span ?? null}, ${Boolean(f.fixed)}, ${Boolean(f.readOnly)})`);
  }

  async action(tenantId, id) { const r = await this.#one(sql`select a.*, b.tab_id from block_actions a join ui_blocks b on b.id = a.block_id where a.tenant_id = ${tenantId} and a.id = ${id}`); return r && camel(r); }
  async createAction(v) {
    const r = await this.#one(sql`insert into block_actions (id, tenant_id, block_id, scope, kind, label, icon, style, open_mode, popup_title, sort_order) values (${uuidv7()}, ${v.tenantId}, ${v.blockId}, ${v.scope}, ${v.kind}, ${v.label}, ${v.icon ?? ''}, ${v.style}, ${v.openMode}, ${v.popupTitle ?? ''},
      (select coalesce(max(sort_order), 0) + ${GAP} from block_actions where block_id = ${v.blockId} and scope = ${v.scope})) returning *`);
    return camel(r);
  }
  async updateAction(tenantId, id, v) {
    const r = await this.#one(sql`update block_actions set label = coalesce(${v.label ?? null}, label), icon = coalesce(${v.icon ?? null}, icon), style = coalesce(${v.style ?? null}, style), open_mode = coalesce(${v.openMode ?? null}, open_mode),
      popup_title = coalesce(${v.popupTitle ?? null}, popup_title), hidden = coalesce(${v.hidden ?? null}, hidden) where tenant_id = ${tenantId} and id = ${id} returning *`);
    return r && camel(r);
  }
  async deleteAction(tenantId, id) { await this.db.execute(sql`delete from block_actions where tenant_id = ${tenantId} and id = ${id}`); }
  async setActionOrder(tenantId, ids) { for (const [i, id] of ids.entries()) await this.db.execute(sql`update block_actions set sort_order = ${(i + 1) * GAP} where tenant_id = ${tenantId} and id = ${id}`); }
  async actionsOf(blockId, scope) { return this.#rows(sql`select id from block_actions where block_id = ${blockId} and scope = ${scope} order by sort_order, id`).then((r) => r.map((x) => x.id)); }
}
