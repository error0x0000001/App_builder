import { WebSocketServer } from 'ws';

export const TERMINAL_PATH = '/api/v1/deployments/terminal';
const AUTH_TIMEOUT_MS = 5000;
const IDLE_MS = 15 * 60_000;
const MAX_PER_USER = 3;
const MAX_FRAME = 16 * 1024;

/**
 * Web terminal. A socket authenticates with its access token in the first frame (never the URL), is accepted only for people at the
 * manager level of Deployments, and is bridged to an interactive shell through the service. One person gets at most 3 sessions; an idle
 * session closes after 15 minutes. Frames: in `{auth}` `{data}` `{resize}`; out `{ready}` `{data}` `{exit}`.
 */
export class TerminalHub {
  constructor({ tokens, membershipLookup, deployments, logger }) {
    Object.assign(this, { tokens, membershipLookup, deployments, logger });
    this.sessions = new Map(); // userId -> count
    this.sockets = new Set();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  }

  attach(server) {
    this.onUpgrade = (req, socket, head) => {
      if (new URL(req.url, 'http://x').pathname !== TERMINAL_PATH) return;
      this.wss.handleUpgrade(req, socket, head, (ws) => this.#open(ws));
    };
    server.on('upgrade', this.onUpgrade);
    return this;
  }

  #open(ws) {
    const conn = { ws, session: null, userId: null, idle: null };
    this.sockets.add(conn);
    const send = (frame) => { if (ws.readyState === 1) ws.send(JSON.stringify(frame)); };
    const deadline = setTimeout(() => ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);
    const bump = () => { clearTimeout(conn.idle); conn.idle = setTimeout(() => { send({ type: 'exit', reason: 'idle' }); ws.close(4408, 'idle'); }, IDLE_MS); };
    const drop = () => {
      clearTimeout(deadline); clearTimeout(conn.idle); this.sockets.delete(conn);
      if (conn.userId) this.sessions.set(conn.userId, Math.max(0, (this.sessions.get(conn.userId) ?? 1) - 1));
      try { conn.session?.close(); } catch { /* gone */ }
    };
    ws.on('close', drop);
    ws.on('error', () => ws.terminate());
    ws.on('message', async (raw) => {
      let frame; try { frame = JSON.parse(raw.toString('utf8')); } catch { return ws.close(4400, 'bad frame'); }
      try {
        if (!conn.session && !conn.starting) {
          if (frame.type !== 'auth' || typeof frame.token !== 'string') return ws.close(4401, 'auth required');
          conn.starting = true; clearTimeout(deadline);
          let auth; try { auth = await this.tokens.verifyAccess(frame.token); } catch { return ws.close(4401, 'invalid token'); }
          const membership = await this.membershipLookup.find(auth.workspaceId, auth.userId);
          const ctx = { workspaceId: auth.workspaceId, userId: auth.userId, role: membership?.role };
          if (!membership || (await this.deployments.levelFor(ctx)) !== 'manager') return ws.close(4403, 'forbidden');
          if ((this.sessions.get(auth.userId) ?? 0) >= MAX_PER_USER) return ws.close(4429, 'too many sessions');
          this.sessions.set(auth.userId, (this.sessions.get(auth.userId) ?? 0) + 1); conn.userId = auth.userId;
          const dims = { cols: Math.min(Math.max(Number(frame.cols) || 80, 20), 400), rows: Math.min(Math.max(Number(frame.rows) || 24, 5), 200) };
          const target = frame.serviceId ? { serviceId: String(frame.serviceId) } : { serverId: String(frame.serverId ?? '') };
          conn.session = await this.deployments.openTerminal(ctx, { ...target, ...dims, onData: (data) => { bump(); send({ type: 'data', data }); }, onClose: (reason) => { send({ type: 'exit', reason }); ws.close(1000); } });
          bump(); return send({ type: 'ready' });
        }
        if (!conn.session) return undefined;
        bump();
        if (frame.type === 'data' && typeof frame.data === 'string') conn.session.write(frame.data);
        else if (frame.type === 'resize') conn.session.resize(Math.min(Math.max(Number(frame.cols) || 80, 20), 400), Math.min(Math.max(Number(frame.rows) || 24, 5), 200));
      } catch (e) {
        this.logger?.warn({ err: e.message }, 'terminal failed');
        send({ type: 'error', message: e.message });
        ws.close(4500, 'failed');
      }
      return undefined;
    });
  }

  async close() { for (const c of this.sockets) c.ws.terminate(); this.wss.close(); }
}
