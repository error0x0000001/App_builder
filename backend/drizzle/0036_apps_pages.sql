-- Apps, navigation, pages and their layout: real, typed tables (configuration only). A page is loaded with a handful of indexed queries and cached.
CREATE TABLE "apps" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text DEFAULT 'grid' NOT NULL,
  "color" text DEFAULT 'brand' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "apps_key_chk" CHECK ("key" ~ '^[a-z][a-z0-9-]{1,39}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX "apps_key_uq" ON "apps" ("tenant_id", "key");--> statement-breakpoint
CREATE INDEX "apps_list_idx" ON "apps" ("tenant_id", "sort_order", "id");--> statement-breakpoint

-- Who sees an app. No rows = everyone in the organisation.
CREATE TABLE "app_assignments" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "profile_id" uuid REFERENCES "profiles"("id") ON DELETE CASCADE,
  "permission_set_id" uuid REFERENCES "permission_sets"("id") ON DELETE CASCADE,
  "org_role" "tenant_role",
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "app_assignments_one_chk" CHECK (num_nonnulls("profile_id", "permission_set_id", "org_role", "workspace_id") = 1)
);--> statement-breakpoint
CREATE INDEX "app_assignments_app_idx" ON "app_assignments" ("app_id");--> statement-breakpoint

CREATE TABLE "app_routes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "parent_id" uuid REFERENCES "app_routes"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "icon" text DEFAULT '' NOT NULL,
  "link_url" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "show_header" boolean DEFAULT true NOT NULL,
  "enable_tabs" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "app_routes_type_chk" CHECK ("type" IN ('group', 'page', 'link')),
  CONSTRAINT "app_routes_link_chk" CHECK (("type" = 'link') = ("link_url" IS NOT NULL))
);--> statement-breakpoint
CREATE INDEX "app_routes_tree_idx" ON "app_routes" ("app_id", "parent_id", "sort_order", "id");--> statement-breakpoint

CREATE TABLE "page_tabs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "route_id" uuid NOT NULL REFERENCES "app_routes"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "icon" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "page_tabs_route_idx" ON "page_tabs" ("route_id", "sort_order", "id");--> statement-breakpoint

-- Layout: a tab holds rows, a row holds columns (a width each), a column holds blocks.
CREATE TABLE "ui_rows" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tab_id" uuid NOT NULL REFERENCES "page_tabs"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE INDEX "ui_rows_tab_idx" ON "ui_rows" ("tab_id", "sort_order", "id");--> statement-breakpoint
CREATE TABLE "ui_columns" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tab_id" uuid NOT NULL REFERENCES "page_tabs"("id") ON DELETE CASCADE,
  "row_id" uuid NOT NULL REFERENCES "ui_rows"("id") ON DELETE CASCADE,
  "width_pct" integer DEFAULT 100 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "ui_columns_width_chk" CHECK ("width_pct" BETWEEN 5 AND 100)
);--> statement-breakpoint
CREATE INDEX "ui_columns_tab_idx" ON "ui_columns" ("tab_id", "row_id", "sort_order", "id");--> statement-breakpoint
CREATE TABLE "ui_blocks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tab_id" uuid NOT NULL REFERENCES "page_tabs"("id") ON DELETE CASCADE,
  "column_id" uuid NOT NULL REFERENCES "ui_columns"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "show_title" boolean DEFAULT true NOT NULL,
  "object_id" uuid REFERENCES "objects"("id") ON DELETE SET NULL,
  "height_px" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ui_blocks_kind_chk" CHECK ("kind" IN ('table', 'form', 'details', 'list', 'chart', 'kanban', 'calendar', 'markdown', 'iframe', 'filter')),
  CONSTRAINT "ui_blocks_height_chk" CHECK ("height_px" IS NULL OR "height_px" BETWEEN 80 AND 2000)
);--> statement-breakpoint
CREATE INDEX "ui_blocks_tab_idx" ON "ui_blocks" ("tab_id", "column_id", "sort_order", "id");--> statement-breakpoint
CREATE INDEX "ui_blocks_object_idx" ON "ui_blocks" ("object_id") WHERE "object_id" IS NOT NULL;--> statement-breakpoint

-- Fields shown by a block (table columns, form / details / card / filter fields), in order.
CREATE TABLE "block_fields" (
  "block_id" uuid NOT NULL REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "field_key" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "label" text,
  "width_px" integer,
  "span" integer,
  "fixed" boolean DEFAULT false NOT NULL,
  "read_only" boolean DEFAULT false NOT NULL,
  PRIMARY KEY ("block_id", "field_key"),
  CONSTRAINT "block_fields_span_chk" CHECK ("span" IS NULL OR "span" BETWEEN 1 AND 4)
);--> statement-breakpoint

CREATE TABLE "block_table_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "page_size" integer DEFAULT 20 NOT NULL,
  "density" text DEFAULT 'normal' NOT NULL,
  "row_numbers" boolean DEFAULT false NOT NULL,
  "sticky_header" boolean DEFAULT true NOT NULL,
  "striped" boolean DEFAULT true NOT NULL,
  "selectable" boolean DEFAULT false NOT NULL,
  "default_sort_field" text,
  "default_sort_dir" text DEFAULT 'asc' NOT NULL,
  CONSTRAINT "block_table_size_chk" CHECK ("page_size" BETWEEN 5 AND 200),
  CONSTRAINT "block_table_density_chk" CHECK ("density" IN ('compact', 'normal', 'comfortable')),
  CONSTRAINT "block_table_dir_chk" CHECK ("default_sort_dir" IN ('asc', 'desc'))
);--> statement-breakpoint
CREATE TABLE "block_form_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "mode" text DEFAULT 'create' NOT NULL,
  "layout" text DEFAULT 'vertical' NOT NULL,
  "columns" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "block_form_mode_chk" CHECK ("mode" IN ('create', 'edit')),
  CONSTRAINT "block_form_layout_chk" CHECK ("layout" IN ('vertical', 'horizontal')),
  CONSTRAINT "block_form_columns_chk" CHECK ("columns" BETWEEN 1 AND 3)
);--> statement-breakpoint
CREATE TABLE "block_list_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "title_field" text,
  "columns" integer DEFAULT 3 NOT NULL,
  "page_size" integer DEFAULT 12 NOT NULL,
  CONSTRAINT "block_list_columns_chk" CHECK ("columns" BETWEEN 1 AND 4),
  CONSTRAINT "block_list_size_chk" CHECK ("page_size" BETWEEN 4 AND 100)
);--> statement-breakpoint
CREATE TABLE "block_chart_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "chart_type" text DEFAULT 'bar' NOT NULL,
  "measure_fn" text DEFAULT 'count' NOT NULL,
  "measure_field" text,
  "dimension_field" text,
  "time_grain" text DEFAULT 'none' NOT NULL,
  "row_limit" integer DEFAULT 12 NOT NULL,
  "stacked" boolean DEFAULT false NOT NULL,
  "show_legend" boolean DEFAULT true NOT NULL,
  "show_labels" boolean DEFAULT false NOT NULL,
  "color" text DEFAULT 'brand' NOT NULL,
  CONSTRAINT "block_chart_type_chk" CHECK ("chart_type" IN ('bar', 'line', 'area', 'pie', 'donut', 'kpi')),
  CONSTRAINT "block_chart_fn_chk" CHECK ("measure_fn" IN ('count', 'sum', 'avg', 'min', 'max')),
  CONSTRAINT "block_chart_grain_chk" CHECK ("time_grain" IN ('none', 'day', 'week', 'month', 'year')),
  CONSTRAINT "block_chart_limit_chk" CHECK ("row_limit" BETWEEN 1 AND 100)
);--> statement-breakpoint
CREATE TABLE "block_kanban_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "group_field" text,
  "title_field" text
);--> statement-breakpoint
CREATE TABLE "block_calendar_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "title_field" text,
  "start_field" text,
  "end_field" text,
  "default_view" text DEFAULT 'month' NOT NULL,
  CONSTRAINT "block_calendar_view_chk" CHECK ("default_view" IN ('month', 'week'))
);--> statement-breakpoint
CREATE TABLE "block_markdown_content" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "content" text DEFAULT '' NOT NULL,
  CONSTRAINT "block_markdown_len_chk" CHECK (length("content") <= 20000)
);--> statement-breakpoint
CREATE TABLE "block_iframe_settings" (
  "block_id" uuid PRIMARY KEY REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "url" text DEFAULT '' NOT NULL,
  "allow_fullscreen" boolean DEFAULT false NOT NULL,
  CONSTRAINT "block_iframe_url_chk" CHECK ("url" = '' OR "url" ~ '^https?://')
);--> statement-breakpoint

-- Buttons on a block (toolbar) or on each row. Behaviour (what they do) is not stored yet.
CREATE TABLE "block_actions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "block_id" uuid NOT NULL REFERENCES "ui_blocks"("id") ON DELETE CASCADE,
  "scope" text DEFAULT 'block' NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "icon" text DEFAULT '' NOT NULL,
  "style" text DEFAULT 'default' NOT NULL,
  "open_mode" text DEFAULT 'none' NOT NULL,
  "popup_title" text DEFAULT '' NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "block_actions_scope_chk" CHECK ("scope" IN ('block', 'row')),
  CONSTRAINT "block_actions_kind_chk" CHECK ("kind" IN ('add_new', 'filter', 'refresh', 'delete', 'export', 'import', 'print', 'bulk_edit', 'view', 'edit', 'duplicate', 'submit', 'reset', 'custom')),
  CONSTRAINT "block_actions_style_chk" CHECK ("style" IN ('primary', 'default', 'danger', 'link')),
  CONSTRAINT "block_actions_open_chk" CHECK ("open_mode" IN ('none', 'drawer', 'modal', 'page'))
);--> statement-breakpoint
CREATE INDEX "block_actions_block_idx" ON "block_actions" ("block_id", "scope", "sort_order", "id");
