import { z } from 'zod';
import { ACTION_KINDS, ACTION_STYLES, BLOCK_KIND_IDS } from './blockKinds.js';

const COLOURS = ['gray', 'brand', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'teal', 'indigo'];
const uuid = z.string().uuid();
const title = z.string().trim().min(1, 'Enter a name').max(80);
const icon = z.string().trim().max(40);
const idList = z.object({ ids: z.array(uuid).min(1).max(500) }).strict();

export const appBodySchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'Use lower-case letters, numbers and dashes'), label: title, description: z.string().trim().max(300).default(''), icon: icon.default('grid'), color: z.enum(COLOURS).default('brand') }).strict();
export const appPatchSchema = z.object({ label: title, description: z.string().trim().max(300), icon, color: z.enum(COLOURS), active: z.boolean() }).partial().strict();
export const assignmentsSchema = z.object({ items: z.array(z.union([z.object({ profileId: uuid }).strict(), z.object({ permissionSetId: uuid }).strict(), z.object({ orgRole: z.enum(['owner', 'admin', 'member', 'viewer']) }).strict(), z.object({ workspaceId: uuid }).strict()])).max(100) }).strict();
export const orderSchema = idList;

export const routeBodySchema = z.object({ type: z.enum(['group', 'page', 'link']), title, icon: icon.default(''), parentId: uuid.nullable().optional(), linkUrl: z.string().trim().max(500).regex(/^(https?:\/\/|\/)/, 'Use an address starting with http://, https:// or /').optional() }).strict();
export const routePatchSchema = z.object({ title, icon, hidden: z.boolean(), showHeader: z.boolean(), enableTabs: z.boolean(), parentId: uuid.nullable(), linkUrl: z.string().trim().max(500).regex(/^(https?:\/\/|\/)/) }).partial().strict();
export const tabBodySchema = z.object({ title, icon: icon.default('') }).strict();
export const tabPatchSchema = z.object({ title, icon, hidden: z.boolean() }).partial().strict();

export const blockBodySchema = z.object({ kind: z.enum(BLOCK_KIND_IDS), objectId: uuid.nullable().optional(), title: z.string().trim().max(120).optional(), showTitle: z.boolean().optional(), columnId: uuid.optional(), settings: z.record(z.any()).optional() }).strict();
export const blockPatchSchema = z.object({ title: z.string().trim().max(120), showTitle: z.boolean(), heightPx: z.number().int().min(80).max(2000).nullable(), objectId: uuid.nullable(), settings: z.record(z.any()) }).partial().strict();
export const blockFieldsSchema = z.object({ fields: z.array(z.object({ fieldKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/), label: z.string().trim().max(80).nullable().optional(), widthPx: z.number().int().min(40).max(800).nullable().optional(), span: z.number().int().min(1).max(4).nullable().optional(), fixed: z.boolean().optional(), readOnly: z.boolean().optional() }).strict()).max(60) }).strict();
export const moveSchema = z.object({ direction: z.enum(['up', 'down', 'left', 'right']) }).strict();
export const columnWidthSchema = z.object({ widthPct: z.number().int().min(5).max(100) }).strict();
export const addColumnSchema = z.object({}).strict();

export const actionBodySchema = z.object({ scope: z.enum(['block', 'row']), kind: z.enum(ACTION_KINDS.map((a) => a.id)), label: z.string().trim().min(1).max(60).optional(), icon: icon.optional(), style: z.enum(ACTION_STYLES).optional(), openMode: z.enum(['none', 'drawer', 'modal', 'page']).optional(), popupTitle: z.string().trim().max(120).optional() }).strict();
export const actionPatchSchema = z.object({ label: z.string().trim().min(1).max(60), icon, style: z.enum(ACTION_STYLES), openMode: z.enum(['none', 'drawer', 'modal', 'page']), popupTitle: z.string().trim().max(120), hidden: z.boolean() }).partial().strict();
export const actionOrderSchema = z.object({ scope: z.enum(['block', 'row']), ids: z.array(uuid).min(1).max(50) }).strict();

export const dataQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).optional(), pageSize: z.coerce.number().int().min(1).max(200).optional(), q: z.string().trim().max(80).optional(), sort: z.string().max(41).optional(), dir: z.enum(['asc', 'desc']).optional() }).strict();
export const pageQuerySchema = z.object({ tab: uuid.optional() }).strict();
