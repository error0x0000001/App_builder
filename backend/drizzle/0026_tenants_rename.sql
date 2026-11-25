-- What was called a "workspace" is the tenant: the customer account that owns the people, configuration and data.
-- "Workspace" is freed up to become the space inside a tenant (see docs/tenancy-plan.md). Pure rename: no data changes.
DO $$
DECLARE r record;
BEGIN
  -- columns (partitions follow their parent)
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS col
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attname ILIKE '%workspace%' AND a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tbl, r.col, replace(r.col, 'workspace', 'tenant'));
  END LOOP;

  -- enum types
  FOR r IN SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND typname ILIKE '%workspace%' AND typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE %I RENAME TO %I', r.typname, replace(r.typname, 'workspace', 'tenant'));
  END LOOP;

  -- tables
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname ILIKE '%workspace%' AND c.relkind IN ('r', 'p') AND NOT c.relispartition LOOP
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, replace(r.relname, 'workspace', 'tenant'));
  END LOOP;

  -- constraints that are not inherited from a partitioned parent (a primary key's index is renamed with it)
  FOR r IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint WHERE conname ILIKE '%workspace%' AND conparentid = 0 LOOP
    EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, replace(r.conname, 'workspace', 'tenant'));
  END LOOP;

  -- remaining indexes (cosmetic: a name that cannot be changed is left as it is)
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname ILIKE '%workspace%' AND c.relkind IN ('i', 'I') LOOP
    BEGIN
      EXECUTE format('ALTER INDEX %I RENAME TO %I', r.relname, replace(r.relname, 'workspace', 'tenant'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
