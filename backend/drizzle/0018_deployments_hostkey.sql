-- Trust on first use: the SSH host key fingerprint seen when a server was first tested; a different key later is refused.
ALTER TABLE "dp_servers" ADD COLUMN "host_key" text;
