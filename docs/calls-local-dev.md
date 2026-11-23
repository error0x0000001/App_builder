# Calls — running and testing locally (macOS first)

Calls are a feature of Chat (see `docs/workspace-suite-plan.md`). Media never goes through our API: browsers connect straight to a
**LiveKit** server with a short-lived token the API issues. So local testing needs one extra process: `livekit-server`.

## 1. Install and start LiveKit (macOS)

```bash
brew install livekit            # one time
npm run dev:livekit             # from the repo root; listens on ws://localhost:7880
```

`dev:livekit` runs `livekit-server --config tools/livekit/livekit.dev.yaml --node-ip 127.0.0.1`. That config sets the dev key/secret,
a small UDP port range (50000–50100) and a webhook to the API (`/api/v1/calls/livekit-webhook`) so a call is closed even when someone just
closes their tab. macOS will ask once whether `livekit-server` may accept incoming connections — choose **Allow**.

The matching entries already exist in `.env.example` (copy them into `.env`):

```
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=cloudbase-dev-livekit-secret-0123456789abcdef
```

Leave `LIVEKIT_*` unset and the call buttons simply do not appear (the API answers `GET /chat/config` with `enabled: false`).

## 2. Try a call

1. `npm run dev` (API, worker, web) and open **http://localhost:5173** — use `localhost`, not your LAN IP: browsers only allow camera/microphone on
   `localhost` or HTTPS.
2. Sign in as two different people in two browsers (Chrome + Safari, or two Chrome profiles; a second tab of the *same* person replaces the first —
   LiveKit identity is the user id).
3. Person A: **Chat → open a conversation → video/phone icon**. Person B hears a ring and gets an Accept/Decline card; **Accept** joins.
4. Allow camera/microphone when the browser asks. Try mute, camera off, **Share screen**, leave, and **End for everyone** (starter / group admin).
5. When the last person leaves, the conversation shows "Video call ended · N min" (or "Missed video call" if nobody else joined).

## 3. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No call icons in the conversation header | `LIVEKIT_*` not set in `.env`, or API not restarted after setting it |
| "Connecting…" forever / `negotiation timed out` in the console | the browser cannot reach LiveKit's media ports: is `npm run dev:livekit` running with `--node-ip 127.0.0.1`? macOS firewall blocked it? A VPN that hijacks loopback/UDP? |
| Joined but no video | camera permission blocked (address-bar icon), or the camera is in use by another app |
| Rings but never joins on a second device | tokens expire after 1 h; reload the page, a stale tab may hold an old access token |

## 4. What is verified, and where

Verified automatically (`backend/tests/calls.test.js`, real LiveKit if `livekit-server` is running on :7880, otherwise those cases skip):
ring/decline/join/leave/end rules, tokens only for members and accepted by the real LiveKit admin API, "missed"/"ended" records in the conversation,
webhook signature checking, and `room_finished` closing the call. Verified in a browser: ringing card, accept, call screen, leave, record.

**Not verifiable on the CI/sandbox machine:** actual audio/video flowing between browsers — its Chromium cannot complete WebRTC negotiation, even to a
local server. Your first Mac test is the real media check; please report what you see.

## 5. Production notes

* Run LiveKit on its own machines (or LiveKit Cloud) — it, not the API, carries the media load. Set `LIVEKIT_URL` to its public `wss://` URL.
* Production needs TLS and a TURN service for networks that block UDP (LiveKit's built-in TURN, or coturn).
* Point LiveKit's `webhook.urls` at `https://<api>/api/v1/calls/livekit-webhook` with the same API key/secret.
* Docker Desktop for Mac has no host networking, so the native binary above is the supported local path; if you prefer a container, map TCP 7880/7881
  and UDP 50000–50100 and keep `--node-ip 127.0.0.1` (not verified by us).
