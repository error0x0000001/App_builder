import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const httpUrl = (url) => url.replace(/^ws/i, 'http').replace(/\/$/, '');

/**
 * The only code that knows LiveKit. Mints short-lived room tokens (HS256 JWTs in LiveKit's grant format — no SDK needed) and calls the room
 * admin API over Twirp/HTTP. Media never touches our servers: clients connect to LiveKit directly with the token we issue.
 */
export class LiveKitClient {
  constructor({ url, apiKey, apiSecret, fetchImpl = fetch }) {
    Object.assign(this, { url, apiKey, fetchImpl });
    this.key = new TextEncoder().encode(apiSecret ?? '');
    this.enabled = Boolean(url && apiKey && apiSecret);
  }

  #sign(grant, { identity, name, ttlSeconds }) {
    return new SignJWT({ video: grant, ...(name ? { name } : {}) })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.apiKey).setSubject(identity ?? this.apiKey)
      .setNotBefore('0s').setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }

  /** A token that lets one person join one room. */
  joinToken({ room, identity, name, ttlSeconds = 3600 }) {
    return this.#sign({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true }, { identity, name, ttlSeconds });
  }

  async #admin(method, room, body) {
    const token = await this.#sign({ room, roomAdmin: true, roomList: true }, { ttlSeconds: 60 });
    const res = await this.fetchImpl(`${httpUrl(this.url)}/twirp/livekit.RoomService/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return null; // the room does not exist (nobody is in it)
    if (!res.ok) throw new Error(`LiveKit ${method} failed: ${res.status}`);
    return res.json();
  }

  /** Identities currently connected to the room. */
  async participants(room) {
    const data = await this.#admin('ListParticipants', room, { room });
    return (data?.participants ?? []).map((p) => p.identity);
  }

  /** Verifies a LiveKit webhook (signed JWT whose `sha256` claim is the body's hash) and returns the parsed event, or null when it is not genuine. */
  async verifyWebhook(rawBody, authorization) {
    try {
      const { payload } = await jwtVerify(authorization ?? '', this.key, { issuer: this.apiKey });
      const hash = createHash('sha256').update(rawBody).digest();
      const claimed = Buffer.from(String(payload.sha256 ?? ''), 'base64');
      if (claimed.length !== hash.length || !timingSafeEqual(claimed, hash)) return null;
      return JSON.parse(rawBody.toString('utf8'));
    } catch { return null; }
  }

  /** Connected participants with their published tracks (for moderation). */
  async participantTracks(room) {
    const data = await this.#admin('ListParticipants', room, { room });
    return (data?.participants ?? []).map((p) => ({ identity: p.identity, tracks: (p.tracks ?? []).map((t) => ({ sid: t.sid, type: t.type, source: t.source, muted: t.muted })) }));
  }

  /** Force-mutes a person's microphone (they can unmute themselves again). Returns how many tracks were muted. */
  async muteMicrophone(room, identity) {
    const person = (await this.participantTracks(room)).find((p) => p.identity === identity);
    const tracks = (person?.tracks ?? []).filter((t) => t.type === 'AUDIO' && !t.muted);
    for (const t of tracks) await this.#admin('MutePublishedTrack', room, { room, identity, trackSid: t.sid, muted: true });
    return tracks.length;
  }

  async removeParticipant(room, identity) { await this.#admin('RemoveParticipant', room, { room, identity }); }

  async closeRoom(room) { await this.#admin('DeleteRoom', room, { room }); }
}
