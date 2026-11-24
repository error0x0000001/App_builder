CREATE TABLE IF NOT EXISTS "dp_server_metrics" (
  "server_id" uuid NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "cpu" real NOT NULL,
  "mem_used_mb" integer NOT NULL,
  "mem_total_mb" integer NOT NULL,
  "disk_used_kb" bigint NOT NULL,
  "disk_total_kb" bigint NOT NULL,
  PRIMARY KEY ("server_id", "at"),
  CONSTRAINT "dp_server_metrics_server_fk" FOREIGN KEY ("server_id") REFERENCES "dp_servers"("id") ON DELETE cascade
);
