# Documents · Chat · Meet — design and phases

Three modules inside Cloudbase, built one after the other on the same rails (workspace tenancy, roles, record permissions, global search,
Untitled UI look). This file is the design reference; `docs/setup-status.md`-style honesty applies: each phase lists what is **built and
verified** and what is **not**.

## 1. Documents (Google-Drive style)

**Model** — `drive_folders` (materialised `path` of ancestor ids, `inherit` flag, kind `folder | records | record`), `drive_files`
(storage key, size, mime, sha-256, denormalised `folder_path`), `drive_access` (folder × user/workspace → viewer | editor | manager),
`drive_stars`. All keyed by workspace; ids are UUIDv7.

**Access control** (per folder, inherited down the tree)
- A person's role on a folder = the highest role granted on the folder or any ancestor, stopping at a folder with `inherit = false`;
  folder owner = manager; workspace owners/admins manage everything.
- People only ever *see* folders they can reach: a listing returns a child if it inherits your access, you have a direct grant, or you own it.
  "Shared with me" lists folders granted directly to you.
- Files inherit their folder's access (no per-file ACL in phase 1).
- **Record attachments:** every record gets a folder `Records / <Object> / <record uuid>`. Access there is **not** the folder ACL but the
  record's own permission (profiles, permission sets, sharing): read to list/download, edit to upload/delete. Uploads from a record land in
  that folder only, so everything uploaded anywhere is visible in Documents (to the people allowed to see it).

**Scale** — metadata in Postgres (indexed `(workspace_id, folder_id, name)` keyset listing, trigram search index on file names);
bytes behind a `StorageDriver` interface (local disk now; S3-compatible next, with presigned direct upload so the API never proxies large
files). Uploads stream to storage with a size cap and a running checksum — nothing is buffered in memory. Folder moves rewrite `path`
with one prefix `UPDATE`.

**Phase 1 (this change):** folders, upload (drag-drop, progress), download/preview, rename, move, copy, trash/restore/delete forever, star,
recent, shared-with-me, storage usage, folder sharing UI, record attachments, global search over files and folders (ACL-filtered).
**Not in phase 1:** version history, comments, thumbnails, resumable/chunked uploads, S3 driver, virus scanning, in-browser editors.

## 2. Chat (WhatsApp / Slack style)

**Why this design** — the proven pattern (Discord, Slack, WhatsApp) is: partition messages by *conversation* and *time*, never by user;
keep every read a single-partition range scan; push, don't poll; make the realtime tier stateless.

- **Storage:** `messages` partitioned by hash of `conversation_id` (then range by month for retention); primary key
  `(conversation_id, id)` with UUIDv7/ULID ids, so "latest 50" and "load older" are keyset scans on the primary key. Per-member read cursor
  (`last_read_id`) instead of per-message receipts for groups (O(members) not O(members × messages)); per-message delivery/read receipts
  only for 1:1. Reactions, edits, deletes, replies/threads, mentions, pins, forwards and attachments (stored in Documents) are columns/side tables.
- **Fan-out:** write the message once; publish `conversation:<id>` on Redis (Streams for durability + replay by id); each realtime node
  subscribes to the conversations its connected users are in and pushes over WebSocket. Large groups push a small "new message" envelope and
  the client fetches/gets payload by id; unread counts come from the cursors, not from fan-out writes.
- **Realtime tier:** WebSocket gateway as its own stateless service (`services/realtime`), horizontal behind a load balancer, auth by the
  same access token, presence/typing as ephemeral Redis keys with TTL (never in Postgres), backpressure and per-connection rate limits.
- **Search:** Postgres full-text (`tsvector` GIN per partition) plus trigram for prefix, filtered by conversations the person belongs to —
  fast to millions of rows per workspace; the search layer is an interface so Meilisearch/OpenSearch can replace it past that point.
- **Features (WhatsApp parity):** 1:1 and groups (admins, add/remove, leave, invite link, description, icon), text, emoji reactions, reply,
  forward, edit, delete for me/everyone, mentions, pinned, starred, mute/archive, typing + presence, delivery/read ticks, voice notes,
  images/files (via Documents), link previews, disappearing messages, polls, broadcast lists.
- **Ordering & idempotency:** client-generated message ids (UUIDv7) make send retries idempotent; server timestamp ordering within a conversation.

## 3. Meet (Teams style: audio, video, screen share)

Media does **not** go through our API. Design: **WebRTC with an SFU** (selective forwarding unit) so a meeting of N people costs each
client one upload and N downloads instead of a full mesh, plus **TURN** for networks that block UDP.

- **SFU:** LiveKit (open-source, Go) is the recommended engine — rooms, simulcast, active-speaker, screen share, recording hooks, SDKs.
  Our API issues short-lived room tokens only for people allowed in that meeting/conversation.
- **Signalling/state:** our realtime tier carries "ring", "accepted", "declined", "joined" for calls and scheduled-meeting reminders.
- **Features:** 1:1 audio/video calls from a chat, group calls, scheduled meetings with a link, lobby/admit, mute/camera, screen share,
  raise hand, in-meeting chat (the conversation), recording (to Documents), background blur (client-side), device selection.

**What can be verified where we build:** the sandbox has no camera/microphone, no TURN and no UDP route to outside, so call media cannot
be exercised end to end here; the signalling, tokens, permissions and UI states can. Real verification needs a staging box with LiveKit + TURN.

## Decisions (owner)
- **File storage:** S3-compatible object storage in production (S3, R2 or MinIO). Next step: an S3 `StorageDriver` with presigned direct upload/download.
- **Retention:** per-workspace retention **plus legal hold** (freeze chosen conversations): `messages` gets a month partition per conversation hash, a `retention_days` setting drops whole partitions, and a `legal_hold` flag on a conversation (or workspace) blocks both partition drops and deletes/edits-for-everyone.
- **Call engine:** open — the owner asked whether an SFU adds load to our system (answer: it runs on its own machines or managed; our API only issues tokens). To be confirmed before Meet is built.

## Decisions that were needed before Chat/Meet
1. **Media engine:** LiveKit self-hosted (our docker-compose, TURN included) or LiveKit Cloud / another managed SFU?
2. **File storage for real use:** local disk is fine for dev; production wants S3-compatible object storage (S3, R2, MinIO).
3. **Message retention / compliance:** unlimited, per-workspace retention setting, or legal-hold?
