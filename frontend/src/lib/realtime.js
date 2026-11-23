import { get, tokenStore } from '../api/http.js';

const PING_MS = 25_000;
const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/realtime`;

/**
 * One WebSocket per signed-in tab: authenticates with the access token (first frame), reconnects with jittered exponential backoff,
 * pings to keep presence fresh, and tells the owner when it is back so it can refetch whatever it missed (nothing is replayed).
 * `onEvent(event)`, `onStatus('connecting' | 'online' | 'offline')`, `onResync()` after any reconnect.
 */
export class RealtimeClient {
  constructor({ onEvent, onStatus, onResync }) {
    Object.assign(this, { onEvent, onStatus, onResync });
    this.attempt = 0;
    this.stopped = true;
    this.everConnected = false;
  }

  start() { this.stopped = false; this.#connect(); }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry); clearInterval(this.pinger);
    this.socket?.close();
    this.socket = null;
  }

  send(frame) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame)); }

  async #connect() {
    if (this.stopped) return;
    this.onStatus('connecting');
    const socket = new WebSocket(url());
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: tokenStore.current() }));
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.type === 'ready') {
        this.attempt = 0;
        this.onStatus('online');
        if (this.everConnected) this.onResync();
        this.everConnected = true;
        clearInterval(this.pinger);
        this.pinger = setInterval(() => this.send({ type: 'ping' }), PING_MS);
      } else if (event.type !== 'pong') this.onEvent(event);
    };
    socket.onclose = async (close) => {
      clearInterval(this.pinger);
      if (this.stopped || this.socket !== socket) return;
      this.onStatus('offline');
      if (close.code === 4401) await get('/me').catch(() => {}); // the access token expired: this call refreshes it
      this.attempt += 1;
      this.retry = setTimeout(() => this.#connect(), Math.min(30_000, 1000 * 2 ** Math.min(this.attempt, 5)) * (0.7 + Math.random() * 0.6));
    };
  }
}
