import { WebSocketServer } from 'ws';
import { conversationChannel, userChannel } from './bus.js';

export const REALTIME_PATH = '/api/v1/realtime';
const AUTH_TIMEOUT_MS = 5000;
const MAX_BUFFERED = 1024 * 1024;
const TYPING_GAP_MS = 2000;

/**
 * The WebSocket tier: stateless and horizontally scalable. A socket authenticates with its access token (first frame, never in the URL),
 * then this node subscribes (ref-counted) to the bus channels of the conversations that person is in plus their personal channel, and relays
 * events. Nothing here is stored — losing a node only drops connections, which the client re-opens and catches up over REST.
 */
export class RealtimeHub {
  constructor({ tokens, chat, bus, presence, logger, calls = null }) {
    Object.assign(this, { tokens, chat, bus, presence, logger, calls });
    this.sockets = new Set();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  }

  attach(server) {
    this.onUpgrade = (req, socket, head) => {
      if (new URL(req.url, 'http://x').pathname !== REALTIME_PATH) return;
      this.wss.handleUpgrade(req, socket, head, (ws) => this.#open(ws));
    };
    server.on('upgrade', this.onUpgrade);
    return this;
  }

  #open(ws) {
    const conn = { ws, userId: null, workspaceId: null, subs: new Map(), typingAt: new Map(), alive: true };
    this.sockets.add(conn);
    const deadline = setTimeout(() => ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);
    ws.on('message', (raw) => this.#onMessage(conn, raw, deadline).catch((e) => this.logger.warn({ err: e.message }, 'realtime message failed')));
    ws.on('pong', () => { conn.alive = true; });
    ws.on('close', () => { clearTimeout(deadline); this.#drop(conn); });
    ws.on('error', () => ws.terminate());
  }

  #send(conn, event) {
    if (conn.ws.readyState !== 1) return;
    if (conn.ws.bufferedAmount > MAX_BUFFERED) { conn.ws.terminate(); return; } // a client that cannot keep up reconnects and refetches
    conn.ws.send(JSON.stringify(event));
  }

  #subscribe(conn, channel, handler) {
    if (!conn.subs.has(channel)) conn.subs.set(channel, this.bus.subscribe(channel, handler));
  }

  #watch(conn, conversationId) {
    this.#subscribe(conn, conversationChannel(conversationId), (event) => {
      if (event.type === 'typing' && event.userId === conn.userId) return;
      this.#send(conn, event);
    });
  }

  #drop(conn) {
    for (const off of conn.subs.values()) off();
    conn.subs.clear();
    this.sockets.delete(conn);
  }

  async #onMessage(conn, raw, deadline) {
    let frame;
    try { frame = JSON.parse(raw.toString()); } catch { return conn.ws.close(4400, 'bad frame'); }
    if (!conn.userId) {
      if (frame.type !== 'auth' || typeof frame.token !== 'string') return conn.ws.close(4401, 'auth required');
      let auth;
      try { auth = await this.tokens.verifyAccess(frame.token); } catch { return conn.ws.close(4401, 'invalid token'); }
      clearTimeout(deadline);
      conn.userId = auth.userId; conn.workspaceId = auth.workspaceId;
      this.#subscribe(conn, userChannel(auth.userId), (event) => this.#personal(conn, event));
      for (const id of await this.chat.conversationIdsOf(auth.workspaceId, auth.userId)) this.#watch(conn, id);
      await this.presence.touch(conn.workspaceId, conn.userId);
      return this.#send(conn, { type: 'ready', userId: auth.userId });
    }
    switch (frame.type) {
      case 'ping': await this.presence.touch(conn.workspaceId, conn.userId); return this.#send(conn, { type: 'pong' });
      case 'typing': {
        const channel = conversationChannel(frame.conversationId);
        const last = conn.typingAt.get(frame.conversationId) ?? 0;
        if (!conn.subs.has(channel) || Date.now() - last < TYPING_GAP_MS) return undefined; // only into conversations this socket belongs to, at most every 2s
        conn.typingAt.set(frame.conversationId, Date.now());
        return this.bus.publish(channel, { type: 'typing', conversationId: frame.conversationId, userId: conn.userId });
      }
      default: return this.calls?.onFrame?.(conn, frame, (event) => this.#send(conn, event));
    }
  }

  /** Personal channel: membership changes re-wire this socket; everything else (call rings…) is relayed. */
  #personal(conn, event) {
    if (event.type === 'conversation.joined') this.#watch(conn, event.conversationId);
    if (event.type === 'conversation.left') { conn.subs.get(conversationChannel(event.conversationId))?.(); conn.subs.delete(conversationChannel(event.conversationId)); }
    this.#send(conn, event);
  }

  start() {
    this.heartbeat = setInterval(() => {
      for (const conn of this.sockets) {
        if (!conn.alive) { conn.ws.terminate(); continue; }
        conn.alive = false; conn.ws.ping();
      }
    }, 30_000);
    this.heartbeat.unref();
    return this;
  }

  async close() {
    clearInterval(this.heartbeat);
    for (const conn of this.sockets) conn.ws.close(1001, 'server shutting down');
    this.wss.close();
  }
}
