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

### Chat — built and measured (Phase 2a)
Built: DMs (idempotent), groups (admins, add/remove/leave, last-admin promotion, invite links, up to 1024 members), send with client UUIDv7 ids
(retries never double-post), keyset paging, reply/forward/edit/delete/reactions/pins, read cursors + capped unread counts, typing, presence
(Redis TTL keys, polled for visible people), full-text search scoped to your conversations, legal hold (blocks edit/delete), WebSocket tier
(`/api/v1/realtime`, first-frame token auth, Redis pub/sub per conversation with ref-counted subscriptions, live (un)subscribe on membership change).
Measured on 3 000 000 messages in 500 conversations (32 hash partitions, one dev Postgres):
open a conversation (latest 50) **0.2 ms** · unread count 2 ms · selective search across all 500 conversations **~40 ms** ·
two-term/prefix search across 300–500 conversations **~110–130 ms** · a single very common word across 300–500 conversations **~400–530 ms**
(worst case: every 8th message matches). Past that scale, or for typo-tolerant search, swap the search interface for Meilisearch/OpenSearch.
**Phase 2d (built, verified):** attachments (paperclip, paste, drag-drop, progress) stored in Documents under `Chat / <conversation uuid>` — access is
conversation membership only (not even workspace admins; forwarding copies the file into the target conversation's folder), images as thumbnails and
other files as cards with the shared preview, WhatsApp-style info panel (profile photo, name/email/job title, Audio/Video, shared Media / Docs / Links
tabs via partial indexes, mute/pin/archive, members + invite link + admin controls, groups in common, group name/description, legal hold), profile photos
(browser-cropped 256 px JPEG, signed immutable URLs, shown in chat, calls, pickers and the account menu).
**Phase 2e (built, verified):** Chat is its own rail/sidebar section (list lives in the navigation panel, unread badge on the rail icon); starred
messages (Starred tab), "delete for me", disappearing messages (24 h / 7 d / 90 d, hidden at once, purged every minute by the worker with their files,
never under legal hold), polls (single/multiple choice, live counts), voice notes (browser recording, in-bubble player), link previews (title/description/site
only — server-fetched, SSRF-guarded, cached 7 days; no remote image is loaded), message info (who read it — per-person read cursors; delivery is not tracked),
@mentions (picker, highlight, "@" marker in the inbox), group icons, scheduled meetings (date + time form, banner with Add to calendar (.ics) and Join from
15 min before, reschedule), raise hand (host can lower it), Chat folders in Documents (read-only, named after the conversation, members only).
Not built: meeting reminders/notifications before the start, recurring meetings, a lobby, voice-note waveform/speed, link-preview images, broadcast lists.
Known trade-offs: `chat_conversations.last_message_*` is a hot row in extremely busy groups (one UPDATE per message); retention partition drops are not built yet; chat files are searchable/recent in Documents for members but there is no `Chat` folder tree to browse there yet.

## 3. Calls and meetings (inside Chat — LiveKit)

Media does **not** go through our API: WebRTC with an SFU (LiveKit). A meeting of N people costs each client one upload and N downloads, plus
TURN for networks that block UDP. Our API only issues room tokens and carries ring/decline/ended state on the chat socket.

**Built and verified (Phase 2b):** start an audio/video call from any conversation (DM or group), ring the other members (card with Accept/Decline,
ringtone, auto-dismiss), join with a member-only 1-hour token, call screen (participant grid, active speaker, mic / camera / screen share / leave /
end for everyone), "call in progress — Join" banner, call lines in the conversation ("started a video call", "Video call ended · 4 min",
"Missed video call"), webhook-verified end-of-call when a room finishes, config flag (`LIVEKIT_*` unset ⇒ no call buttons). Tested against a real
LiveKit 1.9 server; setup for macOS in `docs/calls-local-dev.md` (`npm run dev:livekit`).
**Also built (Phase 2c):** People panel in the call (profile, host badge, who is speaking, mic/camera/screen state), host controls (mute one, mute all, remove — remover cannot rejoin; host = starter or group admin; enforced on the server), in-call Chat panel (the conversation itself), grouped message bubbles.
**Not verified:** audio/video flowing between browsers (the sandbox cannot establish WebRTC) — needs your first Mac test.
**Not built yet:** scheduled meetings UI (the `meeting_at` field exists), join link for outsiders / lobby, device picker, raise hand, in-call chat panel,
recording to Documents, shared meeting notes, hand raise, background blur, per-device identities (a second tab of the same person replaces the first).

## Decisions (owner)
- **File storage:** S3-compatible object storage in production (S3, R2 or MinIO). Next step: an S3 `StorageDriver` with presigned direct upload/download.
- **Retention:** per-workspace retention **plus legal hold** (freeze chosen conversations): `messages` gets a month partition per conversation hash, a `retention_days` setting drops whole partitions, and a `legal_hold` flag on a conversation (or workspace) blocks both partition drops and deletes/edits-for-everyone.
- **Call engine:** **LiveKit** (SFU on its own machines or LiveKit Cloud; our API only issues room tokens). The owner develops on macOS: dev uses the native `livekit-server --dev` (`brew install livekit`), with a docker-compose variant that maps the UDP ports (Docker Desktop for Mac has no host networking). Camera/mic work on `http://localhost`.
- **One app, not two:** Meet is a feature of Chat, not a separate module. A call starts from a conversation (DM or group), in-call chat *is* that conversation, a scheduled meeting is a conversation with a time and join link, and ringing/accept/decline use the same WebSocket. One nav item ("Chat"), one membership model, one permission check.

## Decisions that were needed before Chat/Meet
1. **Media engine:** LiveKit self-hosted (our docker-compose, TURN included) or LiveKit Cloud / another managed SFU?
2. **File storage for real use:** local disk is fine for dev; production wants S3-compatible object storage (S3, R2, MinIO).
3. **Message retention / compliance:** unlimited, per-workspace retention setting, or legal-hold?
